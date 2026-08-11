-- One-time manual seed: grant PLATFORM_SUPER_ADMIN to the first user.
-- Not a tracked migration (depends on a specific auth.users row created via
-- the Dashboard) -- run once by hand in the SQL Editor.
insert into public.user_role_assignments (user_id, role_id, organization_id, resort_id)
select u.id, r.id, null, null
from auth.users u
cross join public.roles r
where u.email = 'a.abdelhamid0706@gmail.com'
  and r.key = 'PLATFORM_SUPER_ADMIN'
  and r.organization_id is null
on conflict do nothing
returning user_id, role_id;
