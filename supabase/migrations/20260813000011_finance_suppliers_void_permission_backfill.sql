-- Third instance of the same pattern found twice already today
-- (20260813000009): a migration's FUNCTION bodies made it to the live
-- database (cancel_supplier_invoice/void_supplier_payment both check
-- has_financial_permission(..., 'finance.suppliers.void', ...), confirmed
-- live), but the migration that was supposed to create the permission
-- itself -- 20260812000028_finance_suppliers_void_permission.sql -- never
-- actually ran. Confirmed directly: `select * from permissions where key
-- = 'finance.suppliers.void'` returns zero rows on the live database.
--
-- Consequence, more severe than the 17-call-site audit assumed: this
-- isn't "safe today because only TENANT_OWNER/FINANCE_MANAGER hold it" --
-- NOBODY holds it, because the key doesn't exist to be granted at all.
-- cancel_supplier_invoice/void_supplier_payment have been completely
-- unusable by any role, including TENANT_OWNER, since the day they were
-- written. This migration carries over 20260812000028's content verbatim
-- (idempotent via ON CONFLICT, safe to run regardless of partial state).

insert into public.permissions (key, description)
values ('finance.suppliers.void', 'إلغاء فاتورة مورد أو عكس دفعة مسددة له (عكس محاسبي دون حذف)')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.suppliers.void'),
  ('FINANCE_MANAGER', 'finance.suppliers.void')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.suppliers.void'
on conflict do nothing;

notify pgrst, 'reload schema';
