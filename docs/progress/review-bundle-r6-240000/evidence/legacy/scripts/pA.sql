\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000a1', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'concurrency: posting after an edit');
