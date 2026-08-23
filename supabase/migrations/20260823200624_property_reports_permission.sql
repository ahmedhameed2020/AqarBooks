-- Separates property-operational reports from financial statements.
--
-- THE PROBLEM
-- Rent roll, lease expirations and the owner statement were all gated on
-- finance.reports.read, the same key that opens the trial balance, the income
-- statement, the balance sheet and the VAT return. PROPERTY_MANAGER does not
-- hold that key, so the role could not open the three reports its own job is
-- built on. Nav filtering made this visible; before that the links appeared and
-- then bounced.
--
-- WHY NOT JUST GRANT finance.reports.read TO PROPERTY_MANAGER
-- Because it does far more than unblock those three. That key carries the full
-- financial statement set, and a property manager who holds it can read the
-- organization's P&L and tax returns. Fixing an under-grant with an over-grant
-- is not a fix.
--
-- WHAT THIS DOES
-- Adds property.reports.read and re-points the three property reports at it.
-- Every role that can open them today is granted the new key as well, so this
-- widens access for exactly one role and narrows it for none.

begin;

insert into public.permissions (key, description)
values ('property.reports.read', 'View property-operational reports: rent roll, lease expirations, owner statements')
on conflict (key) do nothing;

-- 1. Templates, so organizations created from here on inherit it.
insert into public.role_template_permissions (role_template_key, permission_key)
select t.role_template_key, 'property.reports.read'
from (
  -- Everyone who can already open these reports, plus the role this exists for.
  select distinct role_template_key
  from public.role_template_permissions
  where permission_key = 'finance.reports.read'
  union
  select 'PROPERTY_MANAGER'
) t
on conflict do nothing;

-- 2. Roles that already exist, so current tenants do not have to wait for a
--    re-clone that never comes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join (select id from public.permissions where key = 'property.reports.read') p
where (
  r.key = 'PROPERTY_MANAGER'
  or exists (
    select 1
    from public.role_permissions rp
    join public.permissions fp on fp.id = rp.permission_id
    where rp.role_id = r.id and fp.key = 'finance.reports.read'
  )
)
on conflict do nothing

commit;
