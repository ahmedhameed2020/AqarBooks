-- Phase 6 RLS. Default-deny throughout. purchase_requests, purchase_orders,
-- supplier_invoices, supplier_payments, supplier_payment_allocations, and
-- expenses get SELECT only -- functions are the only writer.

alter table public.suppliers enable row level security;
alter table public.expense_categories enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;
alter table public.expenses enable row level security;

create policy "suppliers_select_member" on public.suppliers for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "suppliers_manage" on public.suppliers for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "expense_categories_select_member" on public.expense_categories for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "expense_categories_manage" on public.expense_categories for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "purchase_requests_select_member" on public.purchase_requests for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "purchase_orders_select_member" on public.purchase_orders for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "supplier_invoices_select_member" on public.supplier_invoices for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "supplier_payments_select_member" on public.supplier_payments for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "supplier_payment_allocations_select_member" on public.supplier_payment_allocations for select
  using (
    exists (
      select 1 from public.supplier_payments sp
      where sp.id = payment_id and public.is_org_member(auth.uid(), sp.organization_id)
    )
  );

create policy "expenses_select_member" on public.expenses for select
  using (public.is_org_member(auth.uid(), organization_id));
