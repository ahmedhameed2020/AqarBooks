-- Fixes a real RBAC gap: due_schedules / dues / due_generation_runs RLS only
-- ever required organization membership, even though finance.dues.read,
-- finance.schedules.read, and finance.schedules.manage were already defined
-- and assigned to roles in 20260811000005_phase11_financial_rbac.sql --
-- they were simply never wired into RLS on these three tables (due_schedules
-- and due_generation_runs predate that migration; dues' policy was written
-- even earlier). Net effect before this fix: a CASHIER (who has
-- finance.dues.read + finance.schedules.read but is explicitly denied
-- finance.schedules.manage) or a plain member with zero finance.*
-- permissions could read every unit's dues org-wide, and could directly
-- INSERT/UPDATE due_schedules rows -- tampering with recurring billing
-- amounts/accounts -- entirely bypassing the permission checks already
-- enforced inside issue_dues/generate_recurring_dues.
--
-- No data is modified. has_permission() is the same publicly-executable,
-- SECURITY DEFINER, non-recursive helper already used by every other
-- RLS policy in this schema (units_manage, members_manage, resorts_manage,
-- due_types_manage) -- not has_financial_permission(), which has EXECUTE
-- revoked from `authenticated` and is only safe to call from inside other
-- SECURITY DEFINER RPCs, never from an RLS expression evaluated as the
-- querying role.

drop policy if exists "Org members can select due_schedules" on public.due_schedules;
drop policy if exists "Org members can insert due_schedules" on public.due_schedules;
drop policy if exists "Org members can update due_schedules" on public.due_schedules;

create policy "due_schedules_select_permission"
  on public.due_schedules for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.schedules.read'));

-- Single "for all" policy covers insert/update/delete (no delete UI exists
-- today, but this closes the same direct-client gap the report flagged for
-- insert/update rather than leaving delete on an inconsistent footing).
create policy "due_schedules_manage"
  on public.due_schedules for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.schedules.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.schedules.manage')
    and public.organization_is_active(organization_id)
    -- A schedule's resort must actually belong to the same organization --
    -- blocks a schedule row claiming a resort_id that lives in another
    -- tenant, regardless of which organization_id the client sends.
    and exists (
      select 1 from public.resorts r
      where r.id = due_schedules.resort_id
        and r.organization_id = due_schedules.organization_id
    )
  );

drop policy if exists "dues_select_member" on public.dues;
create policy "dues_select_permission"
  on public.dues for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.dues.read'));

drop policy if exists "Org members can view due_generation_runs" on public.due_generation_runs;
create policy "due_generation_runs_select_permission"
  on public.due_generation_runs for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.schedules.read'));

-- Nothing here touches issue_dues / generate_recurring_dues / void_due --
-- all three are SECURITY DEFINER and run as their owner, so they bypass
-- these SELECT-only RLS policies entirely (as they already did before this
-- migration) and keep working for both interactive users and the
-- run_due_schedules() cron wrapper (which calls generate_recurring_dues
-- with auth.uid() null, a path that already skips its own permission check
-- by design).
