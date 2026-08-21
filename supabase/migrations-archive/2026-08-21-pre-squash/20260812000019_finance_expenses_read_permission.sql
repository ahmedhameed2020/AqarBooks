-- New read permission for /finance/expenses -- expenses_select_member
-- previously allowed any organization member to read every expense
-- voucher org-wide (amounts, categories, payment accounts), with no
-- finance-specific permission gating it at all. Same class of gap already
-- fixed for dues/schedules/payments (20260812000009/000012).
--
-- Granted to every role that already has finance.entries.create (recording
-- an expense requires being able to see the categories/accounts/log
-- anyway), plus the read-only finance roles (AUDITOR, VIEWER, TENANT_ADMIN,
-- PROPERTY_MANAGER did NOT get finance.entries.create and have no expense
-- involvement, so they are deliberately excluded here unless already
-- covered by TENANT_OWNER's blanket grant).

insert into public.permissions (key, description)
values ('finance.expenses.read', 'قراءة سجل المصروفات وسندات الصرف')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('FINANCE_MANAGER', 'finance.expenses.read'),
  ('ACCOUNTANT', 'finance.expenses.read'),
  ('AUDITOR', 'finance.expenses.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.expenses.read'
on conflict do nothing;

drop policy if exists "expenses_select_member" on public.expenses;
drop policy if exists "expenses_select_permission" on public.expenses;
create policy "expenses_select_permission"
  on public.expenses for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.expenses.read'));
