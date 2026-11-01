-- Fiscal year-end closing: core schema and close_fiscal_year().
--
-- Forward-only. This file is NOT applied and NOT tested against a database yet; a reviewer must run it on an
-- isolated database first (see the report). It never edits an existing migration.
--
-- Sign rules mirror lib/accounting/fiscal-year-closing.ts (calculateYearEndClosing):
--   net = debit - credit per temporary account (REVENUE / EXPENSE);
--   a temporary line closes the account:  debit = max(-net, 0), credit = max(net, 0);
--   T = sum of all temporary nets; retained earnings line: debit = max(T, 0), credit = max(-T, 0), omitted when T = 0;
--   net_income = -T (positive for a profit).
--   Cost centres (design: docs/progress/cost-centre-closing-design.md, option a + c): temporary lines are aggregated per
--   (account, cost_center_id). The retained earnings line is produced per cost_center_id, with that centre's own T(k).
--   A NULL centre on a requires_cost_center account is refused with COST_CENTER_REQUIRED (no default is ever assigned).
--
-- Ground truth this file relies on (latest definitions, read before writing):
--   journal_entries (table + source_type CHECK journal_entries_source_type_check): baseline 20260821105505_baseline.sql:4269-4289;
--     no later migration touches it. No trigger on journal_entries or journal_entry_lines exists in any migration.
--   post_journal_entry_internal: baseline:6532-6615 (requires OPEN period; DRAFT/UNDER_REVIEW only; not usable for a CLOSED period).
--   create_journal_entry_internal: baseline:2310-2382 (inserts DRAFT; not used here).
--   next_sequence_value(org, resort, type): baseline:6055-6075, type 'journal_entry' (same as posting).
--   append_financial_audit_event: baseline:506-605 (signature: org, action, entity_type, resort_id, entity_id, request_id,
--     ip, user_agent, metadata; resort must belong to the org when given; an authenticated actor must be an ACTIVE member).
--   check_audit_action: 20261009130000_phase1_1_membership_roles_audit.sql:191-203 has no FISCAL_YEAR_CLOSED; it is added by
--     20261019100100_fiscal_year_close_guards.sql:324-336. That batch MUST be applied together with this file, before any call
--     to close_fiscal_year(); otherwise the audit insert raises a check violation and the close fails (safe, but unusable).
--   has_permission(uuid, uuid, text): 20260913165500_w0_sec_authorization_containment.sql:150-185.
--   organization_is_active: baseline:6153-6163.
--   orgs_with_permission_keys: 20261017100900_rls_set_based_permission_policies.sql:19-45.
--   chart_of_accounts: baseline:11418-11442; trg_coa_lock_after_use baseline:5960 (locks category / is_group only).
--   fiscal_years / fiscal_periods: baseline:12048-12079; RLS 20261017101200_rls_fiscal_years.sql, 20261009140000:62-68.

-- ---------------------------------------------------------------------------
-- 1. chart_of_accounts.is_retained_earnings (explicit designation only; NO backfill by code 3100 or by name).
-- ---------------------------------------------------------------------------
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_retained_earnings boolean NOT NULL DEFAULT false;

-- At most one retained-earnings account per organization.
CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_one_retained_earnings_per_org
  ON public.chart_of_accounts (organization_id)
  WHERE is_retained_earnings;

-- ---------------------------------------------------------------------------
-- 2. journal_entries.source_type: add 'YEAR_END_CLOSING'.
--    Existing values are exactly those of the latest definition (baseline:4287): JOURNAL_VOUCHER, RECEIPT_VOUCHER,
--    PAYMENT_VOUCHER. Re-added with all three plus the new one.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check CHECK (
    source_type = ANY (ARRAY[
      'JOURNAL_VOUCHER'::text,
      'RECEIPT_VOUCHER'::text,
      'PAYMENT_VOUCHER'::text,
      'YEAR_END_CLOSING'::text
    ])
  );

-- ---------------------------------------------------------------------------
-- 3. fiscal_year_closings: one closing per fiscal year. Written ONLY by close_fiscal_year().
-- ---------------------------------------------------------------------------
CREATE TABLE public.fiscal_year_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years (id),
  operation_key text NOT NULL,
  closing_entry_id uuid NOT NULL REFERENCES public.journal_entries (id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  net_income numeric(19, 4) NOT NULL,
  line_count integer NOT NULL CHECK (line_count >= 0),
  closed_by uuid NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_year_closings_pkey PRIMARY KEY (id),
  -- One closing per year: the database enforces it even if the function's check is bypassed.
  CONSTRAINT fiscal_year_closings_fiscal_year_id_key UNIQUE (fiscal_year_id),
  -- Idempotency key is unique per organization (same shape as journal_entries_organization_id_idempotency_key_key).
  CONSTRAINT fiscal_year_closings_organization_id_operation_key_key UNIQUE (organization_id, operation_key)
);

ALTER TABLE public.fiscal_year_closings ENABLE ROW LEVEL SECURITY;

-- ONE SELECT policy. Same shape as the finance tables after 20261017100900 / 20261017101200: platform admins, or the
-- caller's own organizations holding ANY listed key. Keys: 'finance.reports.read' (matches journal_entries_select_permission,
-- which reads the same reports) and 'finance.years.close' (the key that performs the close).
-- No INSERT / UPDATE / DELETE policy: with RLS on, writes are denied; the only writer is close_fiscal_year().
CREATE POLICY fiscal_year_closings_select_permission ON public.fiscal_year_closings
  FOR SELECT
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
         'finance.reports.read'::text, 'finance.years.close'::text]))
  );

-- Table privileges. Supabase default privileges grant broad table rights on new public tables; the closing record must
-- only be created by the SECURITY DEFINER function, so write privileges are removed from every client-facing role
-- (service_role included, because it bypasses RLS and would otherwise be able to write rows directly).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fiscal_year_closings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.fiscal_year_closings TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. designate_retained_earnings_account(org, account): explicit designation of the retained-earnings account.
--    Requires finance.years.close (has_permission reads auth.uid() only; a null caller fails the check).
--    Clear-then-set order: the unique index allows one flagged account per organization, so the others are cleared first.
--    Audit: NOT written. check_audit_action (20261009130000:191-203) does not allow a designation action, and this file does
--    not edit that whitelist (it belongs to the audit-whitelist change, batch 1B-B).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.designate_retained_earnings_account(
  p_organization_id uuid,
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Authentication and authorization failures RAISE (SQLSTATE 42501); the messages are fixed codes, never SQL text.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_uid, p_organization_id, 'finance.years.close') THEN
    RAISE EXCEPTION 'FORBIDDEN_CLOSE_PERMISSION' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR p_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT');
  END IF;
  IF NOT public.organization_is_active(p_organization_id) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ORG_NOT_ACTIVE');
  END IF;

  -- Serialize designations for this organization so two concurrent calls cannot both clear and set in an interleaved way
  -- (which would violate the partial unique index with a raw error instead of a clean result).
  PERFORM pg_advisory_xact_lock(hashtext('retained_earnings_designation:' || p_organization_id::text));

  -- The target must be an active, non-group EQUITY account of this organization.
  PERFORM 1
    FROM public.chart_of_accounts coa
   WHERE coa.id = p_account_id
     AND coa.organization_id = p_organization_id
     AND coa.category = 'EQUITY'
     AND coa.is_active
     AND NOT coa.is_group
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'RE_ACCOUNT_INVALID');
  END IF;

  -- Clear first (unique index), then set.
  UPDATE public.chart_of_accounts
     SET is_retained_earnings = false
   WHERE organization_id = p_organization_id
     AND is_retained_earnings
     AND id <> p_account_id;

  UPDATE public.chart_of_accounts
     SET is_retained_earnings = true
   WHERE id = p_account_id
     AND organization_id = p_organization_id;

  RETURN jsonb_build_object('ok', true, 'account_id', p_account_id);
END;
$$;

REVOKE ALL ON FUNCTION public.designate_retained_earnings_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.designate_retained_earnings_account(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. close_fiscal_year(org, year, retained-earnings account, reason, operation key) -> jsonb
--
-- Ordering decisions (each step is a precondition of the next):
--   a. Auth first: an unauthenticated caller learns nothing about the data. Input shape next (cheap, no locks).
--      p_retained_earnings_account_id is NOT in the input-shape check: a null value returns RE_ACCOUNT_REQUIRED at step i,
--      as specified.
--   b. Permission before any read of business data.
--   c. Organization must be active before any write path is considered.
--   d. LOCK FIRST. Two advisory locks, taken in a fixed order (year first, then operation key), then the fiscal year row
--      FOR UPDATE. Every later read in this function happens after the lock, so two concurrent closings of the same year
--      serialize, and the second one sees the first one's committed closing row (step e / f) instead of racing it.
--      The operation-key lock serializes two different years that send the same operation key (the unique index would
--      otherwise surface as a raw 23505 error).
--   e. IDEMPOTENCY BEFORE STATE CHECKS. A retry of a completed close must return the original result even though the year
--      is now CLOSED (which would fail step f). A reused key for a different year is rejected, never replayed.
--   f. Already closed: a closing exists for this year under a different key.
--   g. Periods are locked (ORDER BY id, FOR UPDATE, deterministic order) and must all be CLOSED or LOCKED.
--   h. No DRAFT or UNDER_REVIEW entry may exist in the year. Drafts are never auto-discarded.
--   i. The retained-earnings account is validated only after the year-level checks; it is locked FOR SHARE so a concurrent
--      designation cannot change it mid-close.
--   j. Balance check of the year's entries first, then the per-account nets (POSTED and REVERSED, see below).
--   k. Nothing to close returns before any write.
--   l. Lines and totals are computed and checked BEFORE the entry is inserted.
--   m. Closing row written after the entry, so the FK to the entry is satisfied.
--   n. Year status written last, under an explicit session setting that a future guard trigger accepts.
--   q. Audit row FISCAL_YEAR_CLOSED after all writes. No exception handler anywhere in this function (no WHEN OTHERS):
--      if the audit insert fails, the error propagates and the whole transaction, including the closing entry, rolls back.
--
-- Audit row: append_financial_audit_event(org, 'FISCAL_YEAR_CLOSED', 'fiscal_year', NULL resort, fiscal year id, NULL request_id,
--   NULL ip, NULL user agent, metadata). Resort is NULL because a fiscal year has no property and the closing entry itself is
--   created with property_id NULL. The function accepts NULL (baseline:523-531 checks only a non-null resort).
--
-- Why the closing entry is inserted directly and not through post_journal_entry_internal:
--   post_journal_entry_internal requires the period to be OPEN and the entry to be DRAFT or UNDER_REVIEW
--   (baseline:6554-6561). The year's periods are CLOSED or LOCKED by construction at step g, so that function cannot post
--   here. Creating the entry as DRAFT and posting it would need the period reopened, which this design forbids.
--   There is no trigger on journal_entries or journal_entry_lines in any migration (checked; the only mention is a comment in
--   20261017100000), and no insert policy exists for either table (RLS denies client writes). This SECURITY DEFINER
--   function is the table owner's context, so the insert is the function's own deliberate write. The closing row is
--   therefore the immutable record of the close; the entry is created already POSTED and is never updated.
--
-- Rows counted: POSTED and REVERSED. A reversal sets the original to REVERSED and creates a POSTED reversal
--   (baseline:8961-8977; 20261017100100:561-562). Summing only POSTED would count the reversal but drop the original and
--   make the net wrong. Both statuses are real ledger postings.
--
-- Every failure before the first write returns {ok:false, error_code}; nothing has been written at that point.
CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_organization_id uuid,
  p_fiscal_year_id uuid,
  p_retained_earnings_account_id uuid,
  p_reason text,
  p_operation_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text;
  v_op text;
  v_fy public.fiscal_years%ROWTYPE;
  v_existing public.fiscal_year_closings%ROWTYPE;
  v_period record;
  v_period_count integer := 0;
  v_last_period_id uuid;
  v_row record;
  v_year_debit numeric;
  v_year_credit numeric;
  v_temp_net numeric := 0;
  v_acc uuid[] := '{}';
  v_debit numeric[] := '{}';
  v_credit numeric[] := '{}';
  v_cc uuid[] := '{}';
  v_grp_cc uuid[] := '{}';
  v_grp_net numeric[] := '{}';
  v_re_requires_cc boolean := false;
  v_has_null_cc boolean := false;
  v_cc_row record;
  v_centre_net numeric;
  v_line_count integer;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_entry_number bigint;
  v_entry_id uuid;
  v_i integer;
BEGIN
  -- a. Authentication (RAISE) and input shape (returned code).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  v_op := btrim(COALESCE(p_operation_key, ''));
  IF p_organization_id IS NULL OR p_fiscal_year_id IS NULL OR v_reason = '' OR v_op = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT');
  END IF;

  -- b. Permission. has_permission returns true for platform admins without membership, so an
  -- active membership in this organization is required as well (owner decision: a platform admin
  -- who is not a member of the organization must not close its year).
  IF NOT public.has_permission(v_uid, p_organization_id, 'finance.years.close') THEN
    RAISE EXCEPTION 'FORBIDDEN_CLOSE_PERMISSION' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om
     WHERE om.user_id = v_uid AND om.organization_id = p_organization_id AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN_CLOSE_PERMISSION' USING ERRCODE = '42501';
  END IF;

  -- c. Organization state.
  IF NOT public.organization_is_active(p_organization_id) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ORG_NOT_ACTIVE');
  END IF;

  -- d. Locks: advisory (year, then operation key), then the fiscal year row.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_year_close:' || p_fiscal_year_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_year_close_operation:' || p_organization_id::text || ':' || v_op));

  SELECT * INTO v_fy
    FROM public.fiscal_years
   WHERE id = p_fiscal_year_id
     AND organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'FISCAL_YEAR_NOT_FOUND');
  END IF;

  -- e. Idempotency: runs before any state check, because a completed close has already made the year CLOSED.
  SELECT * INTO v_existing
    FROM public.fiscal_year_closings
   WHERE organization_id = p_organization_id
     AND operation_key = v_op;
  IF FOUND THEN
    IF v_existing.fiscal_year_id = p_fiscal_year_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_closed', true,
        'closing_entry_id', v_existing.closing_entry_id,
        'line_count', v_existing.line_count,
        'net_income', v_existing.net_income::text
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error_code', 'OPERATION_KEY_REUSED');
  END IF;

  -- f. The year already has a closing recorded under another key.
  IF EXISTS (SELECT 1 FROM public.fiscal_year_closings WHERE fiscal_year_id = p_fiscal_year_id) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ALREADY_CLOSED');
  END IF;

  -- g. Periods: locked in a deterministic order; every one must be CLOSED or LOCKED; the year must have at least one.
  FOR v_period IN
    SELECT id, status
      FROM public.fiscal_periods
     WHERE fiscal_year_id = p_fiscal_year_id
       AND organization_id = p_organization_id
     ORDER BY id
     FOR UPDATE
  LOOP
    v_period_count := v_period_count + 1;
    IF v_period.status NOT IN ('CLOSED', 'LOCKED') THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'PERIOD_NOT_CLOSED');
    END IF;
  END LOOP;
  IF v_period_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'PERIOD_NOT_CLOSED');
  END IF;

  -- The closing entry is attached to the year's last period (by start date, then period number).
  SELECT id INTO v_last_period_id
    FROM public.fiscal_periods
   WHERE fiscal_year_id = p_fiscal_year_id
     AND organization_id = p_organization_id
   ORDER BY start_date DESC, period_number DESC
   LIMIT 1;

  -- h. No unreviewed entries in the year. Drafts are never discarded automatically.
  IF EXISTS (
    SELECT 1
      FROM public.journal_entries je
     WHERE je.organization_id = p_organization_id
       AND je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date
       AND je.status IN ('DRAFT', 'UNDER_REVIEW')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'UNREVIEWED_ENTRIES_EXIST');
  END IF;

  -- i. Retained-earnings account: explicit flag, EQUITY, active, not a group, same organization.
  IF p_retained_earnings_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'RE_ACCOUNT_REQUIRED');
  END IF;
  SELECT coa.requires_cost_center INTO v_re_requires_cc
    FROM public.chart_of_accounts coa
   WHERE coa.id = p_retained_earnings_account_id
     AND coa.organization_id = p_organization_id
     AND coa.is_retained_earnings
     AND coa.category = 'EQUITY'
     AND coa.is_active
     AND NOT coa.is_group
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'RE_ACCOUNT_INVALID');
  END IF;

  -- j. Balance of every POSTED / REVERSED line dated in the year (all categories).
  SELECT COALESCE(SUM(jel.debit), 0), COALESCE(SUM(jel.credit), 0)
    INTO v_year_debit, v_year_credit
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
   WHERE je.organization_id = p_organization_id
     AND je.status IN ('POSTED', 'REVERSED')
     AND je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date;
  IF v_year_debit <> v_year_credit THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ENTRIES_UNBALANCED');
  END IF;

  -- j. Temporary accounts aggregated per (account, cost centre), same POSTED / REVERSED lines.
  --    The scan keeps zero nets so the checks apply to every posted line; zero groups are skipped when lines are built.
  --    Checks, all before any write:
  --      - a NULL-centre line on an account with requires_cost_center = true -> COST_CENTER_REQUIRED (no default assigned);
  --      - a non-NULL centre on a group that closes (net <> 0) must exist, belong to this organization and be active
  --        -> COST_CENTRE_INVALID. FOR SHARE, so a concurrent deactivation waits for this transaction.
  --    Order: account, then centre (NULLS FIRST), so the outcome is deterministic.
  FOR v_row IN
    SELECT coa.id AS account_id,
           coa.requires_cost_center AS requires_cc,
           jel.cost_center_id AS cost_center_id,
           SUM(jel.debit) - SUM(jel.credit) AS net
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
     WHERE je.organization_id = p_organization_id
       AND je.status IN ('POSTED', 'REVERSED')
       AND je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date
       AND coa.category IN ('REVENUE', 'EXPENSE')
     GROUP BY coa.id, coa.requires_cost_center, jel.cost_center_id
     ORDER BY coa.id, jel.cost_center_id NULLS FIRST
  LOOP
    IF v_row.cost_center_id IS NULL THEN
      IF v_row.requires_cc THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'COST_CENTER_REQUIRED');
      END IF;
      v_has_null_cc := true;
    END IF;

    IF v_row.net <> 0 THEN
      IF v_row.cost_center_id IS NOT NULL THEN
        PERFORM 1
          FROM public.cost_centers cc
         WHERE cc.id = v_row.cost_center_id
           AND cc.organization_id = p_organization_id
           AND cc.is_active
         FOR SHARE;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'error_code', 'COST_CENTRE_INVALID');
        END IF;
      END IF;

      v_acc := array_append(v_acc, v_row.account_id);
      v_cc := array_append(v_cc, v_row.cost_center_id);
      v_debit := array_append(v_debit, GREATEST(-v_row.net, 0));
      v_credit := array_append(v_credit, GREATEST(v_row.net, 0));
      v_grp_cc := array_append(v_grp_cc, v_row.cost_center_id);
      v_grp_net := array_append(v_grp_net, v_row.net);
    END IF;
  END LOOP;

  -- The retained earnings lines would carry NULL too, so a requires-centre RE account refuses a NULL-centre temporary line.
  IF v_re_requires_cc AND v_has_null_cc THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'COST_CENTER_REQUIRED');
  END IF;

  -- k. Nothing to close: no entry, no closing row. The year stays open for the owner to decide (documented behaviour).
  IF COALESCE(array_length(v_acc, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'NOTHING_TO_CLOSE');
  END IF;

  -- Retained earnings: one line per cost centre that has a temporary group (NULL included), carrying that centre's own
  -- total T(k) = sum of its groups' nets. Credited by a profit (T(k) < 0), debited by a loss (T(k) > 0). T(k) = 0: no line.
  FOR v_cc_row IN
    SELECT DISTINCT u.cc_id
      FROM unnest(v_grp_cc) AS u(cc_id)
     ORDER BY u.cc_id NULLS FIRST
  LOOP
    v_centre_net := 0;
    FOR v_i IN 1 .. COALESCE(array_length(v_grp_cc, 1), 0) LOOP
      IF v_grp_cc[v_i] IS NOT DISTINCT FROM v_cc_row.cc_id THEN
        v_centre_net := v_centre_net + v_grp_net[v_i];
      END IF;
    END LOOP;
    v_temp_net := v_temp_net + v_centre_net;

    IF v_centre_net <> 0 THEN
      v_acc := array_append(v_acc, p_retained_earnings_account_id);
      v_cc := array_append(v_cc, v_cc_row.cc_id);
      v_debit := array_append(v_debit, GREATEST(v_centre_net, 0));
      v_credit := array_append(v_credit, GREATEST(-v_centre_net, 0));
    END IF;
  END LOOP;

  v_line_count := array_length(v_acc, 1);

  -- l. Totals must match BEFORE anything is written.
  FOR v_i IN 1 .. v_line_count LOOP
    v_total_debit := v_total_debit + v_debit[v_i];
    v_total_credit := v_total_credit + v_credit[v_i];
  END LOOP;
  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'CLOSING_ENTRY_UNBALANCED' USING ERRCODE = 'XX000';
  END IF;

  -- Entry number from the same sequence as posting. The entry is created POSTED on the year's last period (see above).
  v_entry_number := public.next_sequence_value(p_organization_id, NULL, 'journal_entry');

  INSERT INTO public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_number, entry_date, description,
    source_type, status, created_by, posted_by, posted_at
  ) VALUES (
    p_organization_id, NULL, v_last_period_id, v_entry_number, v_fy.end_date,
    'Year-end closing ' || v_fy.name, 'YEAR_END_CLOSING', 'POSTED', v_uid, v_uid, now()
  )
  RETURNING id INTO v_entry_id;

  FOR v_i IN 1 .. v_line_count LOOP
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id
    ) VALUES (
      v_entry_id, v_i, v_acc[v_i], 'Year-end closing',
      v_debit[v_i]::numeric(19, 4), v_credit[v_i]::numeric(19, 4), v_cc[v_i]
    );
  END LOOP;

  -- Same used-account marking as posting.
  UPDATE public.chart_of_accounts
     SET is_used = true
   WHERE id = ANY (v_acc)
     AND NOT is_used;

  -- m. The closing record (net_income = -T).
  INSERT INTO public.fiscal_year_closings (
    organization_id, fiscal_year_id, operation_key, closing_entry_id, reason, net_income, line_count, closed_by
  ) VALUES (
    p_organization_id, p_fiscal_year_id, v_op, v_entry_id, v_reason, (-v_temp_net)::numeric(19, 4), v_line_count, v_uid
  );

  -- n. Year status, last. The session setting is transaction-local and is cleared again right after the write.
  PERFORM set_config('aqar.fiscal_write_context', 'close_fiscal_year', true);
  UPDATE public.fiscal_years
     SET status = 'CLOSED'
   WHERE id = p_fiscal_year_id
     AND organization_id = p_organization_id;
  PERFORM set_config('aqar.fiscal_write_context', '', true);

  -- o. Fiscal period statuses are not changed here; they stay CLOSED or LOCKED.

  -- p. Audit row (step q). Deliberately NOT wrapped in an exception handler: a failure aborts the whole function.
  --    Argument order is that of append_financial_audit_event (org, action, entity_type, resort, entity_id, request_id,
  --    ip, user_agent, metadata). Result (audit id) is discarded.
  PERFORM public.append_financial_audit_event(
    p_organization_id => p_organization_id,
    p_action => 'FISCAL_YEAR_CLOSED',
    p_entity_type => 'fiscal_year',
    p_resort_id => NULL,
    p_entity_id => p_fiscal_year_id,
    p_request_id => NULL,
    p_ip_address => NULL,
    p_user_agent => NULL,
    p_metadata => jsonb_build_object(
      'closing_entry_id', v_entry_id,
      'line_count', v_line_count,
      'net_income', (-v_temp_net)::numeric(19, 4)::text,
      'operation_key', v_op
    )
  );

  -- q. Result (unchanged success shape).
  RETURN jsonb_build_object(
    'ok', true,
    'already_closed', false,
    'closing_entry_id', v_entry_id,
    'line_count', v_line_count,
    'net_income', (-v_temp_net)::numeric(19, 4)::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_fiscal_year(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid, uuid, uuid, text, text) TO authenticated, service_role;
