\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.release_project_wip('e5a074c8-66c9-4dad-9e4f-953c82a61002',600,'2026-03-10','R8 order 2 release waits') as release_id;
