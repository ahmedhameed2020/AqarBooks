\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
\echo STEP 1 capitalise 1000
select capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000e5', 1000, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-01', 'wip seq capitalise') as cap \gset
\echo STEP 2 release 600
select release_project_wip('bbbbbbb1-0000-4000-8000-0000000000e5', 600, '2026-03-10', 'wip seq release') as rel \gset
\echo STEP 3 report after release
\c postgres
select 'report: cap='||capitalised||' rel='||released||' wip='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000000e5');
\echo STEP 4 reverse the release
select reverse_journal_entry(:'rel', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'wip seq reverse release');
\c postgres
select 'report: cap='||capitalised||' rel='||released||' wip='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000000e5');
\echo STEP 5 reverse the capitalisation
select reverse_journal_entry(:'cap', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-16', 'wip seq reverse cap');
\c postgres
select 'report: cap='||capitalised||' rel='||released||' wip='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000000e5');
select 'ledger WIP net: '||coalesce(sum(debit-credit),0) from journal_entry_lines where project_id='bbbbbbb1-0000-4000-8000-0000000000e5' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
