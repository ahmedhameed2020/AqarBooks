-- New permission for cancel_supplier_invoice/void_supplier_payment,
-- deliberately separate from finance.entries.create (recording an invoice/
-- payment vs. reversing one are different trust levels) -- same rationale
-- as finance.payments.void for member payments. Granted to TENANT_OWNER
-- (explicit here, not left to the role-template backfill -- that backfill
-- only ever covered permissions that existed AT THE TIME it ran, so any
-- permission created afterward, like this one, needs an explicit grant in
-- its own migration or it silently never reaches TENANT_OWNER; this
-- project has been bitten by that exact gap twice already) and
-- FINANCE_MANAGER only -- explicitly NOT PURCHASING_MANAGER/ACCOUNTANT, so
-- the person who posted the invoice or recorded the payment can't
-- unilaterally undo it.

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
