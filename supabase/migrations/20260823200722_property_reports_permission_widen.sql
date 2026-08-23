-- Widens property.reports.read to match the OR it replaces.
--
-- 20260823200624 granted the new key to PROPERTY_MANAGER and to every role
-- holding finance.reports.read. But the three pages also admitted
-- finance.dues.read and, for the rent roll, property.units.view -- so roles
-- like COLLECTOR could open them without ever holding finance.reports.read.
--
-- Collapsing that OR to a single key would have quietly removed their access.
-- This grants the new key to every role satisfying any branch, so the switch
-- widens access for PROPERTY_MANAGER and narrows it for nobody.

begin;

-- The three pages guard with an OR that also admits finance.dues.read and
-- (rent roll) property.units.view. Collapsing that OR to this single key must
-- not narrow it, so every role satisfying any branch is granted it too.
insert into public.role_template_permissions (role_template_key, permission_key)
select distinct role_template_key, 'property.reports.read'
from public.role_template_permissions
where permission_key in ('finance.dues.read', 'property.units.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, np.id
from public.roles r
join public.role_permissions rp on rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id
cross join (select id from public.permissions where key = 'property.reports.read') np
where p.key in ('finance.dues.read', 'property.units.view')
on conflict do nothing;

commit;
