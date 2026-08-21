-- Same class of gap as finance.dues.read / finance.payments.read /
-- finance.expenses.read: suppliers, purchase_requests, purchase_orders,
-- supplier_invoices, supplier_payments, and supplier_payment_allocations
-- all had SELECT RLS gated on organization membership only -- no
-- finance-specific permission, despite carrying commercial-relationship
-- and financial data (supplier pricing, invoice amounts, payment history).
--
-- Granted to every role already involved in purchasing/supplier writes
-- (PURCHASING_MANAGER, GENERAL_MANAGER, FINANCE_MANAGER, ACCOUNTANT) plus
-- the read-only AUDITOR role, matching the pattern already used for
-- finance.expenses.read. TENANT_OWNER is granted explicitly in the same
-- migration this time -- 20260812000019 forgot this and needed a separate
-- follow-up (20260812000020) after a live account got redirected out of
-- /finance/expenses; not repeating that mistake here.

insert into public.permissions (key, description)
values ('finance.suppliers.read', 'قراءة بيانات الموردين وطلبات وأوامر الشراء والفواتير والدفعات')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.suppliers.read'),
  ('PURCHASING_MANAGER', 'finance.suppliers.read'),
  ('GENERAL_MANAGER', 'finance.suppliers.read'),
  ('FINANCE_MANAGER', 'finance.suppliers.read'),
  ('ACCOUNTANT', 'finance.suppliers.read'),
  ('AUDITOR', 'finance.suppliers.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.suppliers.read'
on conflict do nothing;

drop policy if exists "suppliers_select_member" on public.suppliers;
drop policy if exists "suppliers_select_permission" on public.suppliers;
create policy "suppliers_select_permission"
  on public.suppliers for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

drop policy if exists "purchase_requests_select_member" on public.purchase_requests;
drop policy if exists "purchase_requests_select_permission" on public.purchase_requests;
create policy "purchase_requests_select_permission"
  on public.purchase_requests for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

drop policy if exists "purchase_orders_select_member" on public.purchase_orders;
drop policy if exists "purchase_orders_select_permission" on public.purchase_orders;
create policy "purchase_orders_select_permission"
  on public.purchase_orders for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

drop policy if exists "supplier_invoices_select_member" on public.supplier_invoices;
drop policy if exists "supplier_invoices_select_permission" on public.supplier_invoices;
create policy "supplier_invoices_select_permission"
  on public.supplier_invoices for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

drop policy if exists "supplier_payments_select_member" on public.supplier_payments;
drop policy if exists "supplier_payments_select_permission" on public.supplier_payments;
create policy "supplier_payments_select_permission"
  on public.supplier_payments for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

drop policy if exists "supplier_payment_allocations_select_member" on public.supplier_payment_allocations;
drop policy if exists "supplier_payment_allocations_select_permission" on public.supplier_payment_allocations;
create policy "supplier_payment_allocations_select_permission"
  on public.supplier_payment_allocations for select
  using (
    exists (
      select 1 from public.supplier_payments sp
      where sp.id = payment_id
        and public.has_permission(auth.uid(), sp.organization_id, 'finance.suppliers.read')
    )
  );
