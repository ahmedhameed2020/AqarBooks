-- Phase 5 RLS. Default-deny throughout. cashier_sessions, cash_transactions,
-- cheques, cheque_status_history get SELECT only -- functions are the only
-- writer, same pattern as every other financial table so far.

alter table public.cashboxes enable row level security;
alter table public.cashier_sessions enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.banks enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.cheques enable row level security;
alter table public.cheque_status_history enable row level security;

create policy "cashboxes_select_member" on public.cashboxes for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "cashboxes_manage" on public.cashboxes for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "cashier_sessions_select_member" on public.cashier_sessions for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "cash_transactions_select_member" on public.cash_transactions for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "banks_select_member" on public.banks for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "banks_manage" on public.banks for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "bank_accounts_select_member" on public.bank_accounts for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "bank_accounts_manage" on public.bank_accounts for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "cheques_select_member" on public.cheques for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "cheque_status_history_select_member" on public.cheque_status_history for select
  using (
    exists (
      select 1 from public.cheques c
      where c.id = cheque_id and public.is_org_member(auth.uid(), c.organization_id)
    )
  );
