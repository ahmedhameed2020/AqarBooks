-- Fiscal-year close guards.
--
-- 1. Direct-write guard on fiscal_periods and fiscal_years. Status changes and inserts are allowed
--    only inside the function that owns them, identified by the transaction-local setting
--    aqar.fiscal_write_context:
--      fiscal_periods status change  -> 'set_fiscal_period_status'
--      fiscal_years  status -> CLOSED -> 'close_fiscal_year'
--      inserts (both tables)          -> 'create_fiscal_year'
--    Any other write raises FISCAL_STATUS_DIRECT_WRITE_BLOCKED. A fiscal year can never leave CLOSED.
--    Deletes: blocked for every role, except the organization-cascade path described in the
--    section 1 comment below (no service_role exemption exists in this file).
--    The guard is deliberately minimal: it does not model who may do what (the RLS policies and the
--    function permission checks still do that); it only stops a status change from bypassing the
--    function that records it in the audit log.
-- 2. set_fiscal_period_status: row lock, organization-active check, reason required to reopen,
--    no reopening of a period whose fiscal year is CLOSED.
-- 3. post_journal_entry_internal: FOR SHARE on the period row, so a concurrent close (FOR UPDATE)
--    waits and then sees CLOSED.
-- 4. reverse_journal_entry: refuses entries in CLOSED/LOCKED periods and year-end closing entries.
-- 5. Audit allow-list (financial_audit_logs.check_audit_action, a CHECK constraint, not a function):
--    adds FISCAL_YEAR_CLOSED and FISCAL_PERIOD_STATUS_CHANGED; all existing values kept.
-- 6. create_fiscal_year: sets the create context before its inserts; logic unchanged.
--
-- Not changed: create_journal_entry_internal (it does not check period status, so it takes no lock),
-- organization_is_active, and the fiscal_periods_manage / fiscal_years_manage policies.

-- ---------------------------------------------------------------------------
-- 1. Direct-write guard
--
-- DELETE policy (lifecycle path, narrowest possible):
--   organizations -> fiscal_years / fiscal_periods is ON DELETE CASCADE (baseline:15568, :15573).
--   The guard allows a DELETE only when ALL hold:
--     a. pg_trigger_depth() > 0          (the delete runs inside a trigger, i.e. the cascade);
--     b. the owning organization row no longer exists (checked with a SECURITY DEFINER lookup,
--        so RLS cannot hide an existing parent from this check);
--     c. the row's status is PLANNED or OPEN (not CLOSED, not LOCKED).
--   Evidence for (b): PostgreSQL implements ON DELETE CASCADE as an AFTER ROW trigger on the
--   parent. It runs at the end of the parent's DELETE statement, after the parent row is deleted
--   by the same transaction, so the child's BEFORE DELETE trigger, which runs a fresh query, does
--   not see the parent. No in-database "parent is being deleted" marker is exposed to triggers, so
--   absence of the parent in the same transaction is the only available signal. It cannot be
--   forged by a direct child DELETE: while the organization exists the lookup finds it and the
--   statement is refused. A child row whose parent is absent can only come from the same
--   transaction's organization delete (the FK forbids orphans).
--   Consequence by design: an organization that has any CLOSED or LOCKED fiscal year or period
--   cannot be deleted (FISCAL_CLOSED_RECORD_DELETE_BLOCKED; the whole organization delete rolls back).
--   There is no function that deletes an open year on its own; open years leave only with their org.
--
-- TEST CONTRACT (for the static test agent; the outcome is the same for anon, authenticated and
-- service_role, and it is evaluated with no aqar.fiscal_write_context unless stated).
-- MUST BE REJECTED (SQLSTATE 42501):
--   R1  UPDATE fiscal_periods SET status = 'OPEN'                       -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R2  UPDATE fiscal_years   SET status = 'CLOSED'                     -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R3  UPDATE fiscal_periods SET status = ...  with context 'close_fiscal_year' -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R4  UPDATE fiscal_years   SET status = 'CLOSED' with context 'set_fiscal_period_status' -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R5  UPDATE fiscal_years   SET status = 'OPEN' where status = 'CLOSED' (any context) -> FISCAL_YEAR_REOPEN_NOT_ALLOWED
--   R6  UPDATE name / start_date / end_date / organization_id on either table (any context) -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R7  INSERT into fiscal_years or fiscal_periods with no context, or with 'set_fiscal_period_status' -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R8  DELETE FROM fiscal_years or fiscal_periods while the organization exists (any status) -> FISCAL_STATUS_DIRECT_WRITE_BLOCKED
--   R9  DELETE FROM organizations whose fiscal_years/fiscal_periods include a CLOSED or LOCKED row
--       -> FISCAL_CLOSED_RECORD_DELETE_BLOCKED (organization row remains)
--   R10 UPDATE fiscal_years SET status = 'CLOSED' with context 'close_fiscal_year' by a caller with NO active
--       membership in the organization (e.g. a platform admin only) -> FORBIDDEN_CLOSE_MEMBERSHIP_REQUIRED
-- MUST PASS:
--   P1  set_fiscal_period_status(...) transitions (the function sets its own context)
--   P2  close_fiscal_year(...) writing fiscal_years.status = 'CLOSED' (context 'close_fiscal_year')
--   P3  create_fiscal_year(...) inserts (context 'create_fiscal_year')
--   P4  no-op UPDATE (to_jsonb(new) = to_jsonb(old)) on any row
--   P5  DELETE FROM organizations where the organization's fiscal rows are PLANNED or OPEN
--       (the organization and its fiscal rows are removed; other FKs of the organization may still block)
--   P6  DELETE FROM organizations with no fiscal rows (guard not involved)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_fiscal_status_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_context text := coalesce(current_setting('aqar.fiscal_write_context', true), '');
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 0 and not exists (
      select 1 from public.organizations o where o.id = old.organization_id
    ) then
      if old.status in ('CLOSED', 'LOCKED') then
        raise exception 'FISCAL_CLOSED_RECORD_DELETE_BLOCKED' using errcode = '42501';
      end if;
      return old;
    end if;
    raise exception 'FISCAL_STATUS_DIRECT_WRITE_BLOCKED' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_context = 'create_fiscal_year' then
      return new;
    end if;
    raise exception 'FISCAL_STATUS_DIRECT_WRITE_BLOCKED' using errcode = '42501';
  end if;

  -- UPDATE
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  -- Only the status column may ever change, and only through the owning function.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'FISCAL_STATUS_DIRECT_WRITE_BLOCKED' using errcode = '42501';
  end if;

  if tg_table_name = 'fiscal_periods' then
    if v_context = 'set_fiscal_period_status' then
      return new;
    end if;
    raise exception 'FISCAL_STATUS_DIRECT_WRITE_BLOCKED' using errcode = '42501';
  end if;

  -- fiscal_years
  if old.status = 'CLOSED' and new.status <> 'CLOSED' then
    raise exception 'FISCAL_YEAR_REOPEN_NOT_ALLOWED' using errcode = '42501';
  end if;
  if new.status = 'CLOSED' and v_context = 'close_fiscal_year' then
    -- Membership gate. has_permission() returns true for a platform admin with NO membership
    -- (20260913165500_w0_sec_authorization_containment.sql:163), so close_fiscal_year's permission check
    -- alone would let a non-member platform admin close a year. The closing must come from an ACTIVE
    -- member of this organization. Permission (finance.years.close) is still checked in the core function.
    if not exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.organization_id = new.organization_id
        and om.status = 'active'
    ) then
      raise exception 'FORBIDDEN_CLOSE_MEMBERSHIP_REQUIRED' using errcode = '42501';
    end if;
    return new;
  end if;
  -- PLANNED -> OPEN only through open_fiscal_year, with the same active-membership gate as closing.
  if old.status = 'PLANNED' and new.status = 'OPEN' and v_context = 'open_fiscal_year' then
    if not exists (
      select 1 from public.organization_memberships om
      where om.user_id = auth.uid()
        and om.organization_id = new.organization_id
        and om.status = 'active'
    ) then
      raise exception 'FORBIDDEN_OPEN_MEMBERSHIP_REQUIRED' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'FISCAL_STATUS_DIRECT_WRITE_BLOCKED' using errcode = '42501';
end;
$$;

REVOKE ALL ON FUNCTION public.guard_fiscal_status_write() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_fiscal_periods_status_guard ON public.fiscal_periods;
CREATE TRIGGER trg_fiscal_periods_status_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_status_write();

DROP TRIGGER IF EXISTS trg_fiscal_years_status_guard ON public.fiscal_years;
CREATE TRIGGER trg_fiscal_years_status_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_status_write();

-- ---------------------------------------------------------------------------
-- 2. set_fiscal_period_status (latest body: baseline 20260821105505_baseline.sql:9614)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_period public.fiscal_periods;
  v_fiscal_year_status text;
begin
  select * into v_period from public.fiscal_periods where id = p_fiscal_period_id for update;
  if v_period.id is null then
    raise exception 'fiscal period not found';
  end if;
  if not public.has_permission(auth.uid(), v_period.organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_period.organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_status not in ('PLANNED', 'OPEN', 'CLOSED', 'LOCKED') then
    raise exception 'invalid status: %', p_status;
  end if;
  -- Reopening a closed/locked period is a deliberate, audited exception --
  -- permission-gated the same as any other period change, with the reason
  -- captured below (spec §12: "Reopening requires permission and reason").
  if p_status = 'OPEN' and v_period.status in ('CLOSED', 'LOCKED') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'reason is required to reopen a fiscal period';
    end if;
    select status into v_fiscal_year_status from public.fiscal_years where id = v_period.fiscal_year_id;
    if v_fiscal_year_status = 'CLOSED' then
      raise exception 'fiscal year is closed; its periods cannot be reopened';
    end if;
  end if;

  perform set_config('aqar.fiscal_write_context', 'set_fiscal_period_status', true);
  update public.fiscal_periods set status = p_status where id = p_fiscal_period_id;
  perform set_config('aqar.fiscal_write_context', '', true);

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_period.organization_id, 'fiscal_period.status_changed', 'fiscal_period', p_fiscal_period_id, p_reason,
    jsonb_build_object('new_status', p_status));
end;
$$;

ALTER FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated", "service_role";

-- ---------------------------------------------------------------------------
-- 3. post_journal_entry_internal (latest body: baseline 20260821105505_baseline.sql:6532)
--    Only change: the period read takes FOR SHARE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry public.journal_entries;
  v_period public.fiscal_periods;
  v_line_count int;
  v_total_debit numeric(19, 4);
  v_total_credit numeric(19, 4);
  v_bad_account_count int;
  v_missing_cost_center_count int;
  v_entry_number bigint;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.organization_is_active(v_entry.organization_id) then
    raise exception 'organization is not active';
  end if;
  if v_entry.status not in ('DRAFT', 'UNDER_REVIEW') then
    raise exception 'only draft or under-review entries can be posted';
  end if;

  select * into v_period from public.fiscal_periods where id = v_entry.fiscal_period_id for share;
  if v_period.status <> 'OPEN' then
    raise exception 'fiscal period is not open';
  end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'entry date does not belong to the selected period';
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_line_count, v_total_debit, v_total_credit
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  if v_line_count < 2 then
    raise exception 'a posted entry requires at least two lines';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'unbalanced entry: total debit % does not equal total credit %', v_total_debit, v_total_credit;
  end if;

  select count(*) into v_bad_account_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and (a.is_group or not a.is_active or a.organization_id <> v_entry.organization_id);

  if v_bad_account_count > 0 then
    raise exception 'entry contains lines posted to a group, inactive, or cross-tenant account';
  end if;

  select count(*) into v_missing_cost_center_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and a.requires_cost_center
    and l.cost_center_id is null;

  if v_missing_cost_center_count > 0 then
    raise exception 'one or more lines are missing a required cost center';
  end if;

  v_entry_number := public.next_sequence_value(v_entry.organization_id, null, 'journal_entry');

  update public.journal_entries
  set status = 'POSTED', posted_by = auth.uid(), posted_at = now(), entry_number = v_entry_number
  where id = p_journal_entry_id;

  update public.chart_of_accounts
  set is_used = true
  where id in (
    select account_id from public.journal_entry_lines where journal_entry_id = p_journal_entry_id
  ) and not is_used;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_entry.organization_id, v_entry.property_id, 'journal_entry.posted', 'journal_entry', p_journal_entry_id,
    jsonb_build_object('entry_number', v_entry_number, 'total', v_total_debit));
end;
$$;

ALTER FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. reverse_journal_entry (latest body: baseline 20260821105505_baseline.sql:8918)
--    Added: CLOSING_ENTRY_NOT_REVERSIBLE, ENTRY_IN_CLOSED_PERIOD, and FOR SHARE on the
--    original and reversal period rows so a concurrent close waits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_original public.journal_entries;
  v_new_entry_id uuid;
  v_entry_number bigint;
  v_period public.fiscal_periods;
begin
  select * into v_original from public.journal_entries where id = p_journal_entry_id;
  if v_original.id is null then
    raise exception 'journal entry not found';
  end if;
  if v_original.status <> 'POSTED' then
    raise exception 'only posted entries can be reversed';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.entries.reverse') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_original.organization_id) then
    raise exception 'organization is not active';
  end if;

  if v_original.source_type = 'YEAR_END_CLOSING' then
    raise exception 'CLOSING_ENTRY_NOT_REVERSIBLE';
  end if;

  -- Lock the original entry's period (by id and by entry date), then refuse if any is CLOSED or LOCKED.
  perform 1 from public.fiscal_periods p
  where p.organization_id = v_original.organization_id
    and (p.id = v_original.fiscal_period_id or v_original.entry_date between p.start_date and p.end_date)
  for share;
  if exists (
    select 1 from public.fiscal_periods p
    where p.organization_id = v_original.organization_id
      and p.status in ('CLOSED', 'LOCKED')
      and (p.id = v_original.fiscal_period_id or v_original.entry_date between p.start_date and p.end_date)
  ) then
    raise exception 'ENTRY_IN_CLOSED_PERIOD';
  end if;

  select * into v_period from public.fiscal_periods where id = p_reversal_fiscal_period_id for share;
  if v_period.id is null or v_period.organization_id <> v_original.organization_id then
    raise exception 'reversal fiscal period does not belong to this organization';
  end if;
  if v_period.status <> 'OPEN' then
    raise exception 'reversal fiscal period is not open';
  end if;

  insert into public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_date, description,
    source_type, status, reversed_entry_id, created_by, posted_by, posted_at
  ) values (
    v_original.organization_id, v_original.property_id, p_reversal_fiscal_period_id, p_reversal_date,
    coalesce(p_reason, 'Reversal of entry ' || coalesce(v_original.entry_number::text, v_original.id::text)),
    v_original.source_type, 'POSTED', v_original.id, auth.uid(), auth.uid(), now()
  )
  returning id into v_new_entry_id;

  v_entry_number := public.next_sequence_value(v_original.organization_id, null, 'journal_entry');
  update public.journal_entries set entry_number = v_entry_number where id = v_new_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id)
  select v_new_entry_id, line_number, account_id, description, credit, debit, cost_center_id, project_id
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  update public.journal_entries set status = 'REVERSED' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_original.organization_id, v_original.property_id, 'journal_entry.reversed', 'journal_entry', p_journal_entry_id, p_reason,
    jsonb_build_object('reversal_entry_id', v_new_entry_id, 'reversal_entry_number', v_entry_number));

  return v_new_entry_id;
end;
$$;

ALTER FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") TO "authenticated", "service_role";

-- ---------------------------------------------------------------------------
-- 5. Audit allow-list. The latest list is 20261009130000_phase1_1_membership_roles_audit.sql:191-198
--    (12 values). Two values are added; none removed. NOT VALID + VALIDATE keeps the table lock short.
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;
ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT check_audit_action CHECK (action = ANY (ARRAY[
    'PAYMENT_CREATED', 'PAYMENT_IDEMPOTENT_REPLAY', 'PAYMENT_ALLOCATION_CREATED', 'PAYMENT_REVERSED',
    'DUE_ISSUED', 'DUE_BATCH_ISSUED', 'RECURRING_DUES_GENERATED', 'RECURRING_DUES_SKIPPED',
    'OPERATION_REJECTED', 'LEASE_RENT_DUE_GENERATED', 'LEASE_RENT_DUE_SKIPPED',
    'OPENING_BALANCE_RECORDED',
    'FISCAL_YEAR_CLOSED', 'FISCAL_PERIOD_STATUS_CHANGED'
  ])) NOT VALID;
ALTER TABLE public.financial_audit_logs VALIDATE CONSTRAINT check_audit_action;

-- ---------------------------------------------------------------------------
-- 6. create_fiscal_year (latest body: baseline 20260821105505_baseline.sql:2117)
--    Only change: the create context is set before the inserts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year_id uuid;
  v_period_start date;
  v_period_number int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'end date must be after start date';
  end if;

  perform set_config('aqar.fiscal_write_context', 'create_fiscal_year', true);

  insert into public.fiscal_years (organization_id, name, start_date, end_date)
  values (p_organization_id, p_name, p_start_date, p_end_date)
  returning id into v_year_id;

  v_period_start := p_start_date;
  while v_period_start <= p_end_date loop
    v_period_number := v_period_number + 1;
    insert into public.fiscal_periods (
      organization_id, fiscal_year_id, period_number, name, start_date, end_date
    ) values (
      p_organization_id,
      v_year_id,
      v_period_number,
      to_char(v_period_start, 'YYYY-MM'),
      v_period_start,
      least((v_period_start + interval '1 month' - interval '1 day')::date, p_end_date)
    );
    v_period_start := (v_period_start + interval '1 month')::date;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'fiscal_year.created', 'fiscal_year', v_year_id,
    jsonb_build_object('name', p_name, 'periods', v_period_number));

  return v_year_id;
end;
$$;

ALTER FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") TO "authenticated", "service_role";
