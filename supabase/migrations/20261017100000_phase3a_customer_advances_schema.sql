-- Phase 3a: customer advances — schema, backfill, guards, effective/as-of readers.
--
-- Design: docs/superpowers/specs/2026-10-11-customer-advances-design.md (revision 3), plan task 1.
-- This migration adds NO behaviour to the existing payment functions. record_payment, post_payment_internal,
-- record_online_payment and (until migration B) void_payment keep working unchanged:
--   * new allocation columns are filled by an insert trigger (applied_on = receipt date, kind = RECEIPT);
--   * reversed_on is derived from the DATE OF THE ACTUAL REVERSAL ENTRY (never assumed to be "today"): a trigger on
--     payments fills it from payments.reversal_journal_entry_id, and a deferred constraint trigger verifies the pair at commit;
--   * a reversal date that was saved earlier is immutable.
-- Legacy receipts with unallocated_amount > 0 (Accsys imports) are NOT customer advances: advance_amount stays 0 for them
-- and every new constraint is written so they remain valid.

-- 1. approved liability account for customer advances (per property, like its siblings) -------------------------------

ALTER TABLE public.organization_finance_settings
  ADD COLUMN IF NOT EXISTS customer_advance_account_id uuid REFERENCES public.chart_of_accounts(id);

CREATE OR REPLACE FUNCTION public.validate_customer_advance_account_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.customer_advance_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = NEW.customer_advance_account_id
      AND a.organization_id = NEW.organization_id
      AND a.category = 'LIABILITY'
      AND NOT a.is_group
      AND a.is_active
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_ADVANCE_ACCOUNT_INVALID: حساب سلف العملاء يجب أن يكون حساب التزامات فرعيًا نشطًا في هذه المؤسسة' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_customer_advance_account_setting() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_customer_advance_account_setting ON public.organization_finance_settings;
CREATE TRIGGER trg_validate_customer_advance_account_setting
  BEFORE INSERT OR UPDATE ON public.organization_finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_advance_account_setting();

-- 2. chart template: 2250 Customer Advances for NEW organizations only -------------------------------------------------

INSERT INTO public.coa_template_accounts
  (template_key, sort_order, code, parent_code, name_ar, name_en, category, normal_balance, is_group, is_cash_equivalent, cash_flow_section)
VALUES
  ('RESORT_STANDARD', 25, '2250', '2000', 'سلف العملاء', 'Customer Advances', 'LIABILITY', 'CREDIT', false, false, 'OPERATING')
ON CONFLICT (template_key, code) DO NOTHING;

-- 3. payments: the advance portion, the account used when it was received, the request fingerprint ----------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS advance_amount numeric(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_account_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS request_hash text;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_advance_amount_check CHECK (advance_amount >= 0),
  ADD CONSTRAINT payments_advance_account_required CHECK (advance_amount = 0 OR advance_account_id IS NOT NULL),
  ADD CONSTRAINT payments_unallocated_le_advance CHECK (advance_amount = 0 OR unallocated_amount <= advance_amount),
  ADD CONSTRAINT payments_advance_requires_unit CHECK (advance_amount = 0 OR (member_id IS NOT NULL AND unit_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS payments_advance_by_unit ON public.payments (organization_id, unit_id) WHERE advance_amount > 0;

CREATE OR REPLACE FUNCTION public.payments_guard_advance_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.advance_amount IS DISTINCT FROM OLD.advance_amount
     OR NEW.advance_account_id IS DISTINCT FROM OLD.advance_account_id
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    RAISE EXCEPTION 'payments.advance_amount, advance_account_id and request_hash are immutable after the receipt is created' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payments_guard_advance_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_payments_guard_advance_columns ON public.payments;
CREATE TRIGGER trg_payments_guard_advance_columns
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_guard_advance_columns();

-- 4. payment_allocations: effective dates, kind, links to the entries and the advance account ---------------------------

ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS applied_on date,
  ADD COLUMN IF NOT EXISTS reversed_on date,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'RECEIPT',
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS credit_account_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- backfill (before the guards exist, in this transaction)
UPDATE public.payment_allocations pa
SET applied_on = COALESCE((SELECT p.payment_date FROM public.payments p WHERE p.id = pa.payment_id), pa.created_at::date),
    created_at = COALESCE((SELECT p.created_at FROM public.payments p WHERE p.id = pa.payment_id), pa.created_at),
    created_by = COALESCE(pa.created_by, (SELECT p.created_by FROM public.payments p WHERE p.id = pa.payment_id))
WHERE pa.applied_on IS NULL;

-- reversed_on = entry_date of the receipt's reversal entry; if it cannot be found, the stored reversal timestamp (UTC date)
UPDATE public.payment_allocations pa
SET reversed_on = COALESCE(
  (SELECT je.entry_date FROM public.payments p JOIN public.journal_entries je ON je.id = p.reversal_journal_entry_id WHERE p.id = pa.payment_id),
  (SELECT (COALESCE(p.reversed_at, pa.reversed_at) AT TIME ZONE 'UTC')::date FROM public.payments p WHERE p.id = pa.payment_id),
  (pa.reversed_at AT TIME ZONE 'UTC')::date)
WHERE pa.reversed_at IS NOT NULL AND pa.reversed_on IS NULL;

ALTER TABLE public.payment_allocations ALTER COLUMN applied_on SET NOT NULL;

ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_kind_check CHECK (kind IN ('RECEIPT', 'CREDIT_APPLICATION')),
  ADD CONSTRAINT payment_allocations_kind_fields CHECK (
    (kind = 'RECEIPT' AND journal_entry_id IS NULL AND credit_account_id IS NULL)
    OR (kind = 'CREDIT_APPLICATION' AND journal_entry_id IS NOT NULL AND credit_account_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS payment_allocations_payment_kind ON public.payment_allocations (payment_id, kind);

-- 4a. insert: fill the effective date from the receipt (the path record_online_payment / Accsys imports use)
CREATE OR REPLACE FUNCTION public.payment_allocations_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.applied_on IS NULL THEN
    SELECT p.payment_date INTO NEW.applied_on FROM public.payments p WHERE p.id = NEW.payment_id;
    NEW.applied_on := COALESCE(NEW.applied_on, current_date);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_allocations_before_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_payment_allocations_before_insert ON public.payment_allocations;
CREATE TRIGGER trg_payment_allocations_before_insert
  BEFORE INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_before_insert();

-- 4b. update: the new facts are immutable once set (a saved reversal date can never be changed)
CREATE OR REPLACE FUNCTION public.payment_allocations_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.applied_on IS DISTINCT FROM OLD.applied_on
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
     OR NEW.credit_account_id IS DISTINCT FROM OLD.credit_account_id THEN
    RAISE EXCEPTION 'payment allocation applied_on, kind, journal_entry_id and credit_account_id are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.reversed_on IS NOT NULL AND NEW.reversed_on IS DISTINCT FROM OLD.reversed_on THEN
    RAISE EXCEPTION 'a saved reversal date (reversed_on) is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.reversal_journal_entry_id IS NOT NULL AND NEW.reversal_journal_entry_id IS DISTINCT FROM OLD.reversal_journal_entry_id THEN
    RAISE EXCEPTION 'a saved reversal entry (reversal_journal_entry_id) is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_allocations_guard_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_payment_allocations_guard_update ON public.payment_allocations;
CREATE TRIGGER trg_payment_allocations_guard_update
  BEFORE UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_guard_update();

-- 4c. compatibility with the CURRENT void_payment (between this migration and B): it sets allocation.reversed_at first and
--     creates/links the reversal entry afterwards. When the receipt gets its reversal entry, the still-undated reversed
--     allocations take THAT ENTRY's date. Allocations that already have a reversal date are never touched.
CREATE OR REPLACE FUNCTION public.payments_fill_allocation_reversal_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date date;
BEGIN
  IF NEW.reversal_journal_entry_id IS NOT NULL AND OLD.reversal_journal_entry_id IS NULL THEN
    SELECT je.entry_date INTO v_date FROM public.journal_entries je WHERE je.id = NEW.reversal_journal_entry_id;
    IF v_date IS NOT NULL THEN
      UPDATE public.payment_allocations
      SET reversed_on = v_date
      WHERE payment_id = NEW.id AND reversed_at IS NOT NULL AND reversed_on IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.payments_fill_allocation_reversal_dates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_payments_fill_allocation_reversal_dates ON public.payments;
CREATE TRIGGER trg_payments_fill_allocation_reversal_dates
  AFTER UPDATE OF reversal_journal_entry_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_fill_allocation_reversal_dates();

-- 4d. deferred consistency check, evaluated at COMMIT against the final row (not the event image):
--     (reversed_at IS NULL) = (reversed_on IS NULL), and reversed_on equals the entry_date of the matching reversal entry.
CREATE OR REPLACE FUNCTION public.payment_allocations_reversal_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.payment_allocations;
  v_date date;
BEGIN
  SELECT * INTO r FROM public.payment_allocations WHERE id = NEW.id;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  IF (r.reversed_at IS NULL) <> (r.reversed_on IS NULL) THEN
    RAISE EXCEPTION 'PAYMENT_ALLOCATION_REVERSAL_DATE_MISMATCH: reversed_at and reversed_on must be set together (allocation %)', r.id USING ERRCODE = '23514';
  END IF;
  IF r.reversed_on IS NOT NULL THEN
    IF r.kind = 'CREDIT_APPLICATION' THEN
      SELECT je.entry_date INTO v_date FROM public.journal_entries je WHERE je.id = r.reversal_journal_entry_id;
      IF v_date IS NULL OR v_date <> r.reversed_on THEN
        RAISE EXCEPTION 'PAYMENT_ALLOCATION_REVERSAL_DATE_MISMATCH: reversed_on must equal the entry date of the application reversal entry (allocation %)', r.id USING ERRCODE = '23514';
      END IF;
    ELSE
      SELECT je.entry_date INTO v_date FROM public.payments p JOIN public.journal_entries je ON je.id = p.reversal_journal_entry_id WHERE p.id = r.payment_id;
      IF v_date IS NOT NULL AND v_date <> r.reversed_on THEN
        RAISE EXCEPTION 'PAYMENT_ALLOCATION_REVERSAL_DATE_MISMATCH: reversed_on must equal the entry date of the receipt reversal entry (allocation %)', r.id USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_allocations_reversal_consistency() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_payment_allocations_reversal_consistency ON public.payment_allocations;
CREATE CONSTRAINT TRIGGER trg_payment_allocations_reversal_consistency
  AFTER INSERT OR UPDATE ON public.payment_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_reversal_consistency();

-- 5. idempotency-by-content store (written only by the SECURITY DEFINER functions of migration B) ----------------------

CREATE TABLE IF NOT EXISTS public.payment_credit_requests (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  idempotency_key text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('RECORD_ADVANCE', 'APPLY_CREDIT', 'REVERSE_APPLICATION')),
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key)
);
ALTER TABLE public.payment_credit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_credit_requests FROM PUBLIC, anon, authenticated;

-- 6. readers -------------------------------------------------------------------------------------------------------

-- effective allocations NOW: not reversed, and the receipt itself is POSTED (security_invoker: the caller's RLS applies)
CREATE OR REPLACE VIEW public.effective_payment_allocations WITH (security_invoker = true) AS
SELECT pa.id, pa.payment_id, p.organization_id, p.property_id, pa.due_id, pa.amount, pa.applied_on, pa.kind,
       pa.journal_entry_id, pa.credit_account_id, pa.created_at
FROM public.payment_allocations pa
JOIN public.payments p ON p.id = pa.payment_id
WHERE pa.reversed_at IS NULL AND p.status = 'POSTED';

-- effective allocations AS OF a date: applied_on <= D and not reversed on or before D; receipts without a posted/reversed
-- receipt entry never count; a receipt counts from its own payment_date.
CREATE OR REPLACE FUNCTION public.payment_allocations_as_of(p_org uuid, p_as_of date)
RETURNS TABLE (allocation_id uuid, payment_id uuid, due_id uuid, amount numeric, applied_on date, kind text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT pa.id, pa.payment_id, pa.due_id, pa.amount, pa.applied_on, pa.kind
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  JOIN public.journal_entries je ON je.id = p.journal_entry_id
  WHERE p.organization_id = p_org
    AND je.status IN ('POSTED', 'REVERSED')
    AND p.payment_date <= p_as_of
    AND pa.applied_on <= p_as_of
    AND (pa.reversed_on IS NULL OR pa.reversed_on > p_as_of);
$$;
REVOKE ALL ON FUNCTION public.payment_allocations_as_of(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_allocations_as_of(uuid, date) TO authenticated, service_role;

-- advance receipts and what is left of them now
CREATE OR REPLACE VIEW public.payment_credit_balances WITH (security_invoker = true) AS
SELECT p.id AS payment_id, p.organization_id, p.property_id, p.member_id, p.unit_id, p.payment_date,
       p.advance_amount, p.advance_account_id,
       COALESCE(ap.applied, 0)::numeric(19,4) AS applied_amount,
       (p.advance_amount - COALESCE(ap.applied, 0))::numeric(19,4) AS remaining_amount,
       (p.advance_amount - COALESCE(ap.applied, 0) > 0 AND NOT EXISTS (
          SELECT 1 FROM public.unit_ownerships uo
          WHERE uo.member_id = p.member_id AND uo.unit_id = p.unit_id
            AND (uo.start_date IS NULL OR uo.start_date <= current_date) AND (uo.end_date IS NULL OR uo.end_date >= current_date))) AS is_stranded
FROM public.payments p
LEFT JOIN LATERAL (
  SELECT sum(e.amount) AS applied FROM public.effective_payment_allocations e
  WHERE e.payment_id = p.id AND e.kind = 'CREDIT_APPLICATION') ap ON true
WHERE p.status = 'POSTED' AND p.advance_amount > 0;

-- remaining credit per advance receipt AS OF a date (voided receipts drop out from their reversal date)
CREATE OR REPLACE FUNCTION public.payment_credit_balances_as_of(p_org uuid, p_as_of date)
RETURNS TABLE (payment_id uuid, member_id uuid, unit_id uuid, advance_account_id uuid, advance_amount numeric, remaining_amount numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.id, p.member_id, p.unit_id, p.advance_account_id, p.advance_amount,
         p.advance_amount - COALESCE((SELECT sum(a.amount) FROM public.payment_allocations_as_of(p_org, p_as_of) a
                                      WHERE a.payment_id = p.id AND a.kind = 'CREDIT_APPLICATION'), 0)
  FROM public.payments p
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND p.advance_amount > 0
    AND p.payment_date <= p_as_of
    AND NOT (p.status = 'REVERSED' AND COALESCE(
          (SELECT r.entry_date FROM public.journal_entries r WHERE r.id = p.reversal_journal_entry_id),
          (p.reversed_at AT TIME ZONE 'UTC')::date) <= p_as_of);
$$;
REVOKE ALL ON FUNCTION public.payment_credit_balances_as_of(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_credit_balances_as_of(uuid, date) TO authenticated, service_role;

REVOKE ALL ON public.effective_payment_allocations FROM PUBLIC, anon;
REVOKE ALL ON public.payment_credit_balances FROM PUBLIC, anon;
GRANT SELECT ON public.effective_payment_allocations TO authenticated, service_role;
GRANT SELECT ON public.payment_credit_balances TO authenticated, service_role;

-- 7. units_with_financials: count only effective allocations (identical result for all pre-existing data) -----------------

CREATE OR REPLACE VIEW public.units_with_financials WITH (security_invoker = true) AS
 WITH due_totals AS (
         SELECT d.unit_id,
            sum(d.amount) AS total_due
           FROM public.dues d
          WHERE (d.status <> 'VOID'::text)
          GROUP BY d.unit_id
        ), paid_totals AS (
         SELECT d.unit_id,
            sum(pa.amount) AS total_paid
           FROM (public.effective_payment_allocations pa
             JOIN public.dues d ON ((d.id = pa.due_id)))
          GROUP BY d.unit_id
        ), current_owner AS (
         SELECT DISTINCT ON (uo.unit_id) uo.unit_id,
            uo.member_id AS owner_id,
            m.full_name AS owner_name,
            m.phone AS owner_phone
           FROM (public.unit_ownerships uo
             JOIN public.members m ON ((m.id = uo.member_id)))
          WHERE ((uo.end_date IS NULL) OR (uo.end_date >= CURRENT_DATE))
          ORDER BY uo.unit_id, uo.is_primary_contact DESC, uo.share_percentage DESC, uo.start_date DESC
        )
 SELECT u.id,
    u.organization_id,
    u.property_id,
    u.building_id,
    u.zone_id,
    u.code,
    u.unit_type,
    u.floor_number,
    u.area,
    u.is_active,
    b.name_ar AS building_name_ar,
    b.name_en AS building_name_en,
    z.name_ar AS zone_name_ar,
    z.name_en AS zone_name_en,
    co.owner_id,
    co.owner_name,
        CASE
            WHEN (co.owner_id IS NOT NULL) THEN 'OCCUPIED'::text
            ELSE 'VACANT'::text
        END AS occupancy_status,
    (COALESCE(dt.total_due, (0)::numeric))::numeric(19,4) AS total_due,
    (COALESCE(pt.total_paid, (0)::numeric))::numeric(19,4) AS total_paid,
    ((COALESCE(dt.total_due, (0)::numeric) - COALESCE(pt.total_paid, (0)::numeric)))::numeric(19,4) AS balance,
    ((COALESCE(dt.total_due, (0)::numeric) - COALESCE(pt.total_paid, (0)::numeric)) > (0)::numeric) AS has_arrears,
    u.custom_type_label,
    co.owner_phone,
    u.archived_at
   FROM (((((public.units u
     LEFT JOIN public.buildings b ON ((b.id = u.building_id)))
     LEFT JOIN public.zones z ON ((z.id = u.zone_id)))
     LEFT JOIN due_totals dt ON ((dt.unit_id = u.id)))
     LEFT JOIN paid_totals pt ON ((pt.unit_id = u.id)))
     LEFT JOIN current_owner co ON ((co.unit_id = u.id)));
