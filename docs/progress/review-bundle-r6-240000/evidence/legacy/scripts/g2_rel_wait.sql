\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'F10 release: '||(release_project_wip('bbbbbbb1-0000-4000-8000-0000000000fa', 600, '2026-03-10', 'final2 F10 release') is not null);
