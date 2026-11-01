-- Fiscal calendar: refuse draft entries in closed periods, and add the PLANNED -> OPEN fiscal year transition.
--
-- Forward-only. Earlier migrations are not edited. This file is NOT applied and NOT tested against a database yet;
-- a reviewer must run it on an isolated database first. Design and compatibility notes: docs/progress/fiscal-open-transition-design.md
--
-- Ground truth (read before writing):
--   create_journal_entry_internal: latest definition is baseline 20260821105505_baseline.sql:2310-2382 (no later migration
--     redefines it). It inserts a DRAFT (journal_entries.status default 'DRAFT', baseline:4279) and never checked the period.
--   create_journal_entry (wrapper): baseline:2290-2305. Unchanged here; it calls the internal function.
--   Grants: baseline:18180-18181 (REVOKE ALL FROM PUBLIC; GRANT ALL TO service_role) and baseline:21168 (REVOKE EXECUTE FROM authenticated).
--   Posting refusal (existing): 20261019100100_fiscal_year_close_guards.sql:235-238, 'fiscal period is not open', SQLSTATE P0001.
--   No migration UPDATEs journal_entries.entry_date (grep of supabase/migrations). A trigger is therefore the only place
--     that can block an entry_date change; it is added below.
--   fiscal_years status guard: 20261019100100_fiscal_year_close_guards.sql:73-139. It accepts a fiscal_years status change
--     ONLY to CLOSED with context 'close_fiscal_year'. Nothing else. See section 3 for the consequence.
--   Audit whitelist: financial_audit_logs CHECK check_audit_action (20261019100100_fiscal_year_close_guards.sql:393-402).
--     'FISCAL_YEAR_OPENED' is NOT in it, so this file writes no audit row (see section 3).
--
-- 1. create_journal_entry_internal: same body as baseline, with one added check (FISCAL_PERIOD_NOT_OPEN).
--    Refused when the entry date falls in a CLOSED or LOCKED period of the organization, or when the given
--    fiscal_period_id is CLOSED or LOCKED. The covering periods are locked FOR SHARE before the check, so a concurrent
--    close (FOR UPDATE) either waits or is seen. Idempotent replays return before the check, as before.
-- 2. Trigger on journal_entries: a DRAFT or UNDER_REVIEW entry whose entry_date or fiscal_period_id changes may not move
--    into a CLOSED or LOCKED period. Other updates (status changes, posting, reversal) are not affected.
-- 3. open_fiscal_year(org, year, reason): PLANNED -> OPEN only. CLOSED never reopens.
--    Context: 'open_fiscal_year'. The guard above does NOT accept this context for fiscal_years (see the blocker note in
--    section 3). Until the guard accepts it, the year UPDATE raises FISCAL_STATUS_DIRECT_WRITE_BLOCKED and the whole
--    call rolls back. This fails closed; it cannot open a year by any other path.
--    No audit row is written: 'FISCAL_YEAR_OPENED' is not in check_audit_action.

-- ---------------------------------------------------------------------------
-- 1. create_journal_entry_internal (latest body: baseline 20260821105505_baseline.sql:2310-2382)
--    Only change: the FISCAL_PERIOD_NOT_OPEN block after the "fiscal period does not belong" check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_journal_entry_internal(
  "p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date",
  "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_line_number int := 0;
begin
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  if p_idempotency_key is not null then
    select id into v_entry_id
    from public.journal_entries
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id and organization_id = p_organization_id
  ) then
    raise exception 'fiscal period does not belong to this organization';
  end if;

  -- FISCAL_PERIOD_NOT_OPEN: no draft or under-review entry may be created in a CLOSED or LOCKED period.
  -- Same SQLSTATE class and message as the posting refusal (P0001, 'fiscal period is not open').
  perform 1 from public.fiscal_periods p
   where p.organization_id = p_organization_id
     and (p.id = p_fiscal_period_id or p_entry_date between p.start_date and p.end_date)
   for share;
  if exists (
    select 1 from public.fiscal_periods p
     where p.organization_id = p_organization_id
       and p.status in ('CLOSED', 'LOCKED')
       and (p.id = p_fiscal_period_id or p_entry_date between p.start_date and p.end_date)
  ) then
    raise exception 'FISCAL_PERIOD_NOT_OPEN: fiscal period is not open' using errcode = 'P0001';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one line is required';
  end if;

  insert into public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_date, description,
    source_type, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date, p_description,
    coalesce(p_source_type, 'JOURNAL_VOUCHER'), p_idempotency_key, auth.uid()
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_number := v_line_number + 1;

    if not exists (
      select 1 from public.chart_of_accounts
      where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id
    ) then
      raise exception 'account does not belong to this organization';
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id
    ) values (
      v_entry_id,
      v_line_number,
      (v_line ->> 'account_id')::uuid,
      v_line ->> 'description',
      coalesce((v_line ->> 'debit')::numeric(19, 4), 0),
      coalesce((v_line ->> 'credit')::numeric(19, 4), 0),
      nullif(v_line ->> 'cost_center_id', '')::uuid,
      nullif(v_line ->> 'project_id', '')::uuid
    );
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'journal_entry.created', 'journal_entry', v_entry_id,
    jsonb_build_object('line_count', v_line_number));

  return v_entry_id;
end;
$$;

ALTER FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) TO "service_role";
REVOKE EXECUTE ON FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Draft entry_date / period move guard. No existing function updates journal_entries.entry_date.
--    Only DRAFT and UNDER_REVIEW entries are checked; POSTED and REVERSED rows are never changed by this trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_draft_entry_period_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.entry_date is not distinct from old.entry_date
     and new.fiscal_period_id is not distinct from old.fiscal_period_id then
    return new;
  end if;
  if new.status not in ('DRAFT', 'UNDER_REVIEW') then
    return new;
  end if;

  perform 1 from public.fiscal_periods p
   where p.organization_id = new.organization_id
     and (p.id = new.fiscal_period_id or new.entry_date between p.start_date and p.end_date)
   for share;
  if exists (
    select 1 from public.fiscal_periods p
     where p.organization_id = new.organization_id
       and p.status in ('CLOSED', 'LOCKED')
       and (p.id = new.fiscal_period_id or new.entry_date between p.start_date and p.end_date)
  ) then
    raise exception 'FISCAL_PERIOD_NOT_OPEN: fiscal period is not open' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.guard_draft_entry_period_move() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_journal_entries_draft_period_guard ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_draft_period_guard
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_draft_entry_period_move();

-- ---------------------------------------------------------------------------
-- 3. open_fiscal_year(org, year, reason): PLANNED -> OPEN.
--
--    BLOCKER (guard file, owned by another agent; NOT edited here):
--    20261019100100_fiscal_year_close_guards.sql, guard_fiscal_status_write(), fiscal_years branch (lines 118-137),
--    accepts only new.status = 'CLOSED' with context 'close_fiscal_year'. To let this function work, that guard needs
--    one more branch before its final RAISE (line 137):
--      if old.status = 'PLANNED' and new.status = 'OPEN' and v_context = 'open_fiscal_year' then
--        <same active-membership check as the CLOSED branch, FORBIDDEN_CLOSE_MEMBERSHIP_REQUIRED>
--        return new;
--      end if;
--    Its audit: check_audit_action (guard file lines 393-402) must also list 'FISCAL_YEAR_OPENED'.
--
--    Period opening goes through set_fiscal_period_status (guard file lines 156-198), which already accepts PLANNED -> OPEN
--    and writes platform_audit_logs ('fiscal_period.status_changed') with the reason. It runs first, while the year is
--    still PLANNED, and it clears its own context before this function sets the year context.
--
--    Refusals (stable codes in the message, SQLSTATE in brackets):
--      AUTHENTICATION_REQUIRED [42501]; FORBIDDEN_OPEN_PERMISSION [42501] (no permission, or no active membership);
--      FISCAL_OPEN_REASON_REQUIRED [22023]; FISCAL_YEAR_NOT_FOUND [P0002]; FISCAL_YEAR_NOT_PLANNED [P0001] (OPEN or CLOSED).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_fiscal_year(p_organization_id uuid, p_fiscal_year_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text;
  v_fy public.fiscal_years;
  v_period_id uuid;
  v_opened_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF p_organization_id IS NULL OR p_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_OPEN_INPUT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'FISCAL_OPEN_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Permission: the existing period-management key. has_permission() is true for a platform admin with no
  -- membership, so an active membership in this organization is required as well (as in close_fiscal_year).
  IF NOT public.has_permission(v_uid, p_organization_id, 'finance.periods.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN_OPEN_PERMISSION' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om
     WHERE om.user_id = v_uid AND om.organization_id = p_organization_id AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN_OPEN_PERMISSION' USING ERRCODE = '42501';
  END IF;

  IF NOT public.organization_is_active(p_organization_id) THEN
    RAISE EXCEPTION 'organization is not active';
  END IF;

  -- Lock the year first, then its periods (same order as close_fiscal_year).
  SELECT * INTO v_fy
    FROM public.fiscal_years
   WHERE id = p_fiscal_year_id
     AND organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_fy.status <> 'PLANNED' THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_PLANNED: fiscal year status is %', v_fy.status USING ERRCODE = 'P0001';
  END IF;

  -- Periods: PLANNED -> OPEN through the existing status path, which holds the period-level audit trail.
  FOR v_period_id IN
    SELECT p.id
      FROM public.fiscal_periods p
     WHERE p.fiscal_year_id = p_fiscal_year_id
       AND p.organization_id = p_organization_id
       AND p.status = 'PLANNED'
     ORDER BY p.id
     FOR UPDATE
  LOOP
    PERFORM public.set_fiscal_period_status(v_period_id, 'OPEN', v_reason);
    v_opened_count := v_opened_count + 1;
  END LOOP;

  -- The year itself. Accepted only by the guard branch described above.
  PERFORM set_config('aqar.fiscal_write_context', 'open_fiscal_year', true);
  UPDATE public.fiscal_years
     SET status = 'OPEN'
   WHERE id = p_fiscal_year_id;
  PERFORM set_config('aqar.fiscal_write_context', '', true);

  -- Audit row. Deliberately NOT wrapped in an exception handler: a failure aborts the whole function and rolls back
  -- the period and year updates above. 'FISCAL_YEAR_OPENED' is allowed by check_audit_action from 20261019100500.
  --   Argument order is that of append_financial_audit_event (org, action, entity_type, resort, entity_id, request_id,
  --   ip, user_agent, metadata; baseline 20260821105505_baseline.sql:506). Result (audit id) is discarded.
  --   This function has no operation key, so none is recorded.
  PERFORM public.append_financial_audit_event(
    p_organization_id => p_organization_id,
    p_action => 'FISCAL_YEAR_OPENED',
    p_entity_type => 'fiscal_year',
    p_resort_id => NULL,
    p_entity_id => p_fiscal_year_id,
    p_request_id => NULL,
    p_ip_address => NULL,
    p_user_agent => NULL,
    p_metadata => jsonb_build_object(
      'fiscal_year_id', p_fiscal_year_id,
      'previous_status', 'PLANNED',
      'new_status', 'OPEN',
      'opened_period_count', v_opened_count,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'fiscal_year_id', p_fiscal_year_id,
    'opened_period_count', v_opened_count
  );
END;
$$;

ALTER FUNCTION public.open_fiscal_year(p_organization_id uuid, p_fiscal_year_id uuid, p_reason text) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.open_fiscal_year(p_organization_id uuid, p_fiscal_year_id uuid, p_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_fiscal_year(p_organization_id uuid, p_fiscal_year_id uuid, p_reason text) TO authenticated, service_role;
