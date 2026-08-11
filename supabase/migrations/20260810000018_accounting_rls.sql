-- Phase 3 RLS. Default-deny throughout.
--
-- journal_entries / journal_entry_lines deliberately get a SELECT policy
-- only -- no INSERT/UPDATE/DELETE policy exists for the authenticated role
-- at all. Every write must go through create_journal_entry /
-- submit_journal_entry_for_review / post_journal_entry / reverse_journal_entry,
-- which run SECURITY DEFINER and validate every invariant themselves. This
-- is what makes "posted entries cannot be edited/deleted" and "posting is
-- atomic" actually true rather than a convention client code might skip.
--
-- document_sequences has no client-facing policy at all: it is purely an
-- internal counter touched only by next_sequence_value().

alter table public.document_sequences enable row level security;
alter table public.cost_centers enable row level security;
alter table public.projects enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.fiscal_years enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

create policy "cost_centers_select_member"
  on public.cost_centers for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "cost_centers_manage"
  on public.cost_centers for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage'))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage'));

create policy "projects_select_member"
  on public.projects for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "projects_manage"
  on public.projects for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage'))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage'));

create policy "chart_of_accounts_select_member"
  on public.chart_of_accounts for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "chart_of_accounts_manage"
  on public.chart_of_accounts for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage')
    and public.organization_is_active(organization_id)
  );

create policy "fiscal_years_select_member"
  on public.fiscal_years for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "fiscal_years_manage"
  on public.fiscal_years for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.periods.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.periods.manage')
    and public.organization_is_active(organization_id)
  );

create policy "fiscal_periods_select_member"
  on public.fiscal_periods for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "fiscal_periods_manage"
  on public.fiscal_periods for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.periods.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.periods.manage')
    and public.organization_is_active(organization_id)
  );

create policy "journal_entries_select_member"
  on public.journal_entries for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "journal_entry_lines_select_member"
  on public.journal_entry_lines for select
  using (
    exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_id
        and public.is_org_member(auth.uid(), je.organization_id)
    )
  );
