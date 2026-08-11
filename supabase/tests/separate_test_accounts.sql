-- Separate the two test accounts: platform admin stays platform-only,
-- ahmedhameed2020@gmail.com becomes the tenant (TENANT_OWNER) account.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

-- 1) Remove the platform admin's membership in "مرسى باجوش الساحل الشمالي".
delete from public.user_role_assignments
where user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4'
  and organization_id = '503fd05d-03c4-4b4e-b180-9288ca85a63e';

delete from public.organization_memberships
where user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4'
  and organization_id = '503fd05d-03c4-4b4e-b180-9288ca85a63e';

-- 2) Add ahmedhameed2020@gmail.com as TENANT_OWNER.
select public.add_organization_member(
  '503fd05d-03c4-4b4e-b180-9288ca85a63e',
  '11d45b6f-1162-433e-8324-ebaf7cd0e618',
  'TENANT_OWNER'
);

-- 3) add_organization_member() sets status = 'invited' (the real invite flow,
--    which sends a confirmation email, doesn't exist yet -- Phase 2's known
--    gap). Since this account was created directly via the Dashboard rather
--    than through that flow, activate the membership immediately so
--    is_org_member() actually grants access.
update public.organization_memberships
set status = 'active'
where organization_id = '503fd05d-03c4-4b4e-b180-9288ca85a63e'
  and user_id = '11d45b6f-1162-433e-8324-ebaf7cd0e618';

-- Confirm: platform admin should have zero org memberships left; the new
-- tenant account should show status=active, role_key=TENANT_OWNER.
select 'admin_remaining_memberships' as check_name, count(*)::text as result
from public.organization_memberships
where user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4'
union all
select 'tenant_membership_status', om.status || ' / ' || r.key
from public.organization_memberships om
join public.user_role_assignments ura on ura.user_id = om.user_id and ura.organization_id = om.organization_id
join public.roles r on r.id = ura.role_id
where om.organization_id = '503fd05d-03c4-4b4e-b180-9288ca85a63e'
  and om.user_id = '11d45b6f-1162-433e-8324-ebaf7cd0e618';
