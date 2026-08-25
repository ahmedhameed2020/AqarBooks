-- Migration: generate_lease_rent_dues authorization
--
-- These bytes are the migration. Apply this file VERBATIM, then commit it
-- unchanged under the version the ledger records, so the applied text and the
-- committed text stay the same bytes. Its LOCATION is its status: under
-- scripts/demo/ it is pending, under supabase/migrations/ it is applied.
--
-- ===========================================================================
-- THE HOLE
-- ===========================================================================
-- Measured against the baseline, not assumed:
--
--   * generate_lease_rent_dues is SECURITY DEFINER
--   * GRANT ALL ON FUNCTION ... TO authenticated
--   * anon holds no EXECUTE (the Phase 1 posture, unchanged by this file)
--   * and the function performs NO permission check of any kind
--
-- It takes an organization id and a lease id, reads the lease with the
-- definer's rights, then writes a lease_rent_generation_runs row and a due.
-- The dues trigger posts that due to the general ledger as soon as an OPEN
-- period covers its issue date -- which, after F0, May is.
--
-- So any authenticated user who can see a lease could call it directly through
-- PostgREST and create rent receivables and journal entries. That includes the
-- public demo's AUDITOR account: signed in, permission-starved by design, and
-- able to reach the RPC because `authenticated` may execute it. The
-- application's denyIfDemo() is irrelevant here -- this path never touches the
-- application.
--
-- This is precisely the scenario layer 3 exists to make impossible, and it was
-- the one function where layer 3 was absent.
--
-- WHY THIS IS AN ISOLATED GAP AND NOT A PATTERN
-- Its neighbours are correct. generate_recurring_dues checks
-- finance.schedules.generate; issue_dues checks finance.dues.issue. This one
-- function was written without the check its siblings have.
--
-- ===========================================================================
-- THE FIX
-- ===========================================================================
-- One authorization block, after the lease is resolved and before any write.
-- Nothing else changes: same signature, same behaviour, same return values,
-- same idempotency via the unique violation on lease_rent_generation_runs.
--
-- TENANT_OWNER and FINANCE_MANAGER hold finance.schedules.generate; AUDITOR
-- does not, which is what closes the demo exposure. Verified live before this
-- was written, along with organizations.created_by being null for the demo
-- tenant -- so has_financial_permission's owner bypass grants nobody a way
-- round it.
--
-- ===========================================================================
-- HOW TO APPLY (ADR 0004 still prohibits `supabase db push`)
-- ===========================================================================
--   1. Apply through apply_migration, name `generate_lease_rent_dues_authz`.
--   2. Copy this file into supabase/migrations/ under the recorded version.
--   3. Add it to MIGRATION_FILES in tests/migration-directory-guard.test.ts,
--      pinned by byte size and sha256.
--   4. Run tests/demo-rent-authz.integration.test.ts, which proves an AUDITOR
--      session is refused and creates nothing.
--
-- No grant is changed. No data is touched.

CREATE OR REPLACE FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_lease public.unit_leases;
  v_range daterange;
  v_has_owner boolean;
  v_due_id uuid;
  v_description text;
begin
  perform pg_advisory_xact_lock(hashtext('lease_rent_' || p_lease_id::text));

  select * into v_lease from public.unit_leases where id = p_lease_id and organization_id = p_organization_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;

  -- AUTHORIZATION. Added 2026-08-25; the function previously had none.
  --
  -- After the lease is resolved, because the permission is resort-scoped and
  -- v_lease.property_id is that scope. Before ANY write, so a refusal leaves no
  -- generation run, no due, and therefore no journal entry.
  --
  -- finance.schedules.generate, not property.leases.manage: the caller is not
  -- amending a contract, they are running a recurring billing cycle. It is the
  -- same key generate_recurring_dues checks -- these two do the same kind of
  -- work and should not disagree about who may do it.
  v_user_id := auth.uid();

  if v_user_id is null then
    -- No JWT subject: a trusted server context, or an unauthenticated caller.
    -- Only the former may proceed. has_financial_permission returns false when
    -- auth.uid() is null, so the service role must be recognised here rather
    -- than inside it.
    if auth.role() is distinct from 'service_role' then
      raise exception
        'FORBIDDEN_FINANCE_PERMISSION: unauthenticated rent generation'
        using errcode = '42501';
    end if;
  elsif not public.has_financial_permission(
    p_organization_id,
    'finance.schedules.generate',
    v_lease.property_id
  ) then
    raise exception
      'FORBIDDEN_FINANCE_PERMISSION: not authorized to generate lease rent dues'
      using errcode = '42501';
  end if;

  if v_lease.status <> 'ACTIVE' then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'not_active');
  end if;

  v_range := public.lease_rent_period_range(v_lease.rent_frequency, p_period);
  if lower(v_range) > coalesce(v_lease.ends_on, 'infinity'::date) or upper(v_range) < v_lease.starts_on then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'period_outside_lease_range');
  end if;

  if v_lease.billing_recipient = 'OWNER' then
    select exists (
      select 1 from public.unit_ownerships
      where unit_id = v_lease.unit_id and (end_date is null or end_date >= current_date)
    ) into v_has_owner;
    if not v_has_owner then
      perform public.append_financial_audit_event(
        p_organization_id, 'OPERATION_REJECTED', 'unit_lease', v_lease.property_id, p_lease_id, null, null, null,
        jsonb_build_object('reason', 'no_current_owner_for_owner_billed_lease', 'period', p_period)
      );
      return jsonb_build_object('success', false, 'blocked', true, 'reason', 'no_current_owner');
    end if;
  end if;

  begin
    insert into public.lease_rent_generation_runs (organization_id, lease_id, period, generated_by)
    values (p_organization_id, p_lease_id, p_period, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('success', true, 'idempotent', true);
  end;

  v_description := 'إيجار ' || p_period;

  insert into public.dues (
    organization_id, property_id, unit_id, due_type_id, receivable_account_id,
    amount, issue_date, due_date, description, status, source_type, source_id
  ) values (
    p_organization_id, v_lease.property_id, v_lease.unit_id, v_lease.due_type_id, v_lease.receivable_account_id,
    v_lease.rent_amount, coalesce(p_issue_date, lower(v_range)), lower(v_range), v_description, 'ISSUED', 'LEASE_RENT', p_lease_id
  ) returning id into v_due_id;

  update public.lease_rent_generation_runs set due_id = v_due_id
  where lease_id = p_lease_id and period = p_period;

  perform public.append_financial_audit_event(
    p_organization_id, 'LEASE_RENT_DUE_GENERATED', 'due', v_lease.property_id, v_due_id, null, null, null,
    jsonb_build_object('lease_id', p_lease_id, 'period', p_period, 'amount', v_lease.rent_amount)
  );

  return jsonb_build_object('success', true, 'generated', true, 'due_id', v_due_id);
end;
$$;


-- ===========================================================================
-- VERIFY AFTER APPLYING
-- ===========================================================================
--   -- the check is present
--   select prosrc like '%finance.schedules.generate%'
--   from pg_proc where proname = 'generate_lease_rent_dues';
--
--   -- anon still holds nothing
--   select has_function_privilege('anon', p.oid, 'EXECUTE')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'generate_lease_rent_dues';
--
-- Then, from an AUDITOR session, expect 42501:
--   select public.generate_lease_rent_dues('<org>', '<lease>', '2026-05');
