\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select capitalise_project_cost('bbbbbbb1-0000-4000-8000-000000000121', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'rg cap Q1') is not null as a;
select capitalise_project_cost('bbbbbbb1-0000-4000-8000-000000000122', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'rg cap Q2') is not null as b;
