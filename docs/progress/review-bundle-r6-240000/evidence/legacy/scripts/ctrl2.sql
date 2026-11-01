\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000e6', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'ctrl2 cap') as cap \gset
select release_project_wip('bbbbbbb1-0000-4000-8000-0000000000e6', 600, '2026-03-10', 'ctrl2 rel') as rel \gset
select reverse_journal_entry(:'rel', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'ctrl2 reverse rel');
reset role;
\echo CONTROL-BEFORE-FIX
select 'report: cap='||capitalised||' rel='||released||' wip='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000000e6');
