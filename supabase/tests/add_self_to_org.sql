-- Add the platform admin account as TENANT_OWNER of "مرسى باجوش الساحل الشمالي".

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

select public.add_organization_member(
  '503fd05d-03c4-4b4e-b180-9288ca85a63e',
  'b66490aa-a3a7-4005-add2-1112c660b0b4',
  'TENANT_OWNER'
);

-- Confirm it worked.
select om.status, r.key as role_key
from public.organization_memberships om
join public.user_role_assignments ura on ura.user_id = om.user_id and ura.organization_id = om.organization_id
join public.roles r on r.id = ura.role_id
where om.organization_id = '503fd05d-03c4-4b4e-b180-9288ca85a63e'
  and om.user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4';
