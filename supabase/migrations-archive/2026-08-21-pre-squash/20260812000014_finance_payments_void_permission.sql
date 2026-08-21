-- New permission for void_payment, deliberately separate from
-- finance.payments.create: recording a collection and reversing one are
-- different levels of trust. Granted only to TENANT_OWNER (already gets
-- every non-platform permission via the 20260812000005 backfill) and
-- FINANCE_MANAGER -- explicitly NOT CASHIER/ACCOUNTANT/COLLECTOR, so the
-- person who took the payment can't unilaterally undo it.

insert into public.permissions (key, description)
values ('finance.payments.void', 'إلغاء دفعة مسجَّلة (عكس محاسبي دون حذف)')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values ('FINANCE_MANAGER', 'finance.payments.void')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.payments.void'
on conflict do nothing;
