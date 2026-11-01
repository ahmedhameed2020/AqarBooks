\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'F5 post after edit: '||(capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000f5', 300, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-02', 'final F5 post') is not null);
