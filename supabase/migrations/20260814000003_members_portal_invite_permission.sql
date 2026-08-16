-- Permission to invite owners (members) to create accounts in the owner portal.
-- Granted to the four management/oversight roles that should manage member onboarding:
-- TENANT_OWNER (can invite other owners in their organization), FINANCE_MANAGER,
-- ACCOUNTANT, and PROPERTY_MANAGER (all have member management responsibilities).

insert into public.permissions (key, description)
values ('members.portal.invite', 'دعوة عضو (مالك) لإنشاء حساب في بوابة الملاك الذاتية')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'members.portal.invite'),
  ('FINANCE_MANAGER', 'members.portal.invite'),
  ('ACCOUNTANT', 'members.portal.invite'),
  ('PROPERTY_MANAGER', 'members.portal.invite')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'members.portal.invite'
on conflict do nothing;
