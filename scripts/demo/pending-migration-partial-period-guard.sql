-- Migration: partial-period rent billing guard
--
-- These bytes are the migration. Apply this file VERBATIM, then commit it
-- unchanged under the version the ledger records. Its LOCATION is its status:
-- under scripts/demo/ it is pending, under supabase/migrations/ it is applied.
--
-- Builds on 20260825124312_generate_lease_rent_dues_authz. The authorization
-- block added there is preserved unchanged; this adds one further guard.
--
-- ===========================================================================
-- THE DEFECT
-- ===========================================================================
-- generate_lease_rent_dues bills a period if the lease OVERLAPS it. Overlap is
-- not coverage.
--
--     2026-Q2 = 2026-04-01 .. 2026-06-30
--     a lease commencing 2026-06-01 overlaps by 30 of 91 days
--     -> billed the FULL quarter, due_date 2026-04-01
--
-- The tenancy did not exist on 1 April. Measured on the demo tenant's own
-- data, ten of sixteen quarterly leases commence mid-quarter, and the one that
-- commences in June would be overcharged 23,428.02 against a prorated basis.
--
-- It is not a quarterly problem. A MONTHLY lease commencing on the 15th is
-- overcharged in exactly the same way; quarterly is simply where the gap was
-- large enough to notice.
--
-- ===========================================================================
-- WHY FAIL-CLOSED AND NOT PRORATE
-- ===========================================================================
-- Prorating is the accurate answer and this schema cannot express it. There is
-- no part-period concept on a lease, no rounding rule, and nowhere to record
-- which convention a contract uses -- and real commercial leases genuinely
-- differ: some charge the full period regardless, some start at the first full
-- period, some prorate by days.
--
-- Picking one inside a SECURITY DEFINER function would be inventing an
-- accounting policy the data model cannot record, and inventing it in the
-- direction that bills more.
--
-- So the function refuses. Nothing is written -- no generation run, no due, no
-- journal entry -- and the caller is told what is missing. A refusal is
-- recoverable; a wrong posted entry is not.
--
-- ===========================================================================
-- WHAT THIS CHANGES FOR EXISTING CALLERS
-- ===========================================================================
-- A lease that fully covers the requested period is unaffected: same amount,
-- same dates, same idempotency, same return value. The 26 May 2026 monthly
-- obligations already posted were all full-coverage and would generate
-- identically today.
--
-- A period the lease does not touch at all still returns the benign
-- `period_outside_lease_range` skip. Only genuine partial coverage now raises.
--
-- ===========================================================================
-- HOW TO APPLY (ADR 0004 still prohibits `supabase db push`)
-- ===========================================================================
--   1. Apply through apply_migration, name `rent_partial_period_guard`.
--   2. Copy this file into supabase/migrations/ under the recorded version.
--   3. Add it to MIGRATION_FILES in tests/migration-directory-guard.test.ts.
--   4. Run tests/demo-partial-period-guard.integration.test.ts, which proves
--      2026-Q2 is refused for the mid-quarter lease and writes nothing.
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

  -- PARTIAL PERIOD. Added 2026-08-25.
  --
  -- Above, a period the lease does not touch at all is a benign skip. This is
  -- the other case: the lease touches the period but does not COVER it, because
  -- the tenancy began after the period started or ends before it finishes.
  --
  -- Until now that billed a full period. A quarterly lease commencing on 1 June
  -- was charged the whole of April-to-June, dated 1 April -- two months before
  -- the tenancy existed. The same applies to a monthly lease starting on the
  -- 15th; the quarterly case is only where it was noticed first.
  --
  -- Charging a full period for a partial one is a proration decision, and this
  -- schema has no proration policy in it: no part-period concept on a lease, no
  -- rounding rule, nowhere to record which convention a contract uses. A
  -- function must not invent an accounting rule that the data model cannot
  -- express, and it must not pick the convention that happens to favour the
  -- landlord.
  --
  -- So it fails closed. No generation run, no due, no journal entry -- the
  -- caller is told a policy is required and nothing is written on a guess.
  --
  -- Deliberately not restricted to QUARTERLY: the defect is about partial
  -- coverage, and MONTHLY and YEARLY leases can be partial in exactly the same
  -- way.
  --
  -- Lifting this means introducing a real proration policy, at which point this
  -- raise becomes the branch that consults it. See the defect note
  -- "Partial-period rent billing policy / proration".
  if v_lease.starts_on > lower(v_range)
     or coalesce(v_lease.ends_on, 'infinity'::date) < upper(v_range) then
    raise exception
      'PARTIAL_PERIOD_REQUIRES_POLICY: العقد لا يغطي الفترة بالكامل (% .. %) ولا توجد سياسة تقسيط زمني — lease % covers % .. %',
      lower(v_range), upper(v_range), p_lease_id, v_lease.starts_on, coalesce(v_lease.ends_on, 'infinity'::date)
      using errcode = '22023';
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
--   select prosrc like '%PARTIAL_PERIOD_REQUIRES_POLICY%'
--   from pg_proc where proname = 'generate_lease_rent_dues';
--
-- Then, as an authorized finance actor, against a lease commencing
-- mid-quarter, expect 22023 and zero rows written:
--   select public.generate_lease_rent_dues('<org>', '<lease>', '2026-Q2');
--
-- And confirm a full-coverage period still works: re-running the May 2026
-- monthly generation must still report idempotent, not raise.
