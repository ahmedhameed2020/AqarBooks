\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'F7 cap: '||capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000f7', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'final F7 cap') as c7 \gset
select 'F8 cap: '||capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000f8', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'final F8 cap') as c8 \gset
select :'c7' as c7_entry \gset
