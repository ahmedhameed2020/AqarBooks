\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
\echo A1 tagged single-line-style manual entry must be refused
select create_journal_entry('11111111-1111-4111-8111-111111111111', null, '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-05', 'manual tagged', 'JOURNAL_VOUCHER', '[{"account_id":"aaaaaaa1-0000-4000-8000-000000000001","debit":100,"credit":0,"project_id":"bbbbbbb1-0000-4000-8000-0000000000e5"},{"account_id":"aaaaaaa1-0000-4000-8000-000000000003","debit":0,"credit":100}]'::jsonb, 'optA-a1');
\echo A2 untagged two-line manual entry must be accepted
select 'A2 entry: '||create_journal_entry('11111111-1111-4111-8111-111111111111', null, '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-05', 'manual untagged', 'JOURNAL_VOUCHER', '[{"account_id":"aaaaaaa1-0000-4000-8000-000000000004","debit":100,"credit":0},{"account_id":"aaaaaaa1-0000-4000-8000-000000000003","debit":0,"credit":100}]'::jsonb, 'optA-a2');
\echo A3 untagged three-line manual entry must be accepted
select 'A3 entry: '||create_journal_entry('11111111-1111-4111-8111-111111111111', null, '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-05', 'manual 3-line', 'JOURNAL_VOUCHER', '[{"account_id":"aaaaaaa1-0000-4000-8000-000000000001","debit":100,"credit":0},{"account_id":"aaaaaaa1-0000-4000-8000-000000000004","debit":50,"credit":0},{"account_id":"aaaaaaa1-0000-4000-8000-000000000003","debit":0,"credit":150}]'::jsonb, 'optA-a3');
\echo A4 three-line entry with ONE tagged line must be refused whole
select create_journal_entry('11111111-1111-4111-8111-111111111111', null, '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-05', 'manual 3-line tagged', 'JOURNAL_VOUCHER', '[{"account_id":"aaaaaaa1-0000-4000-8000-000000000001","debit":100,"credit":0,"project_id":"bbbbbbb1-0000-4000-8000-0000000000e5"},{"account_id":"aaaaaaa1-0000-4000-8000-000000000004","debit":50,"credit":0},{"account_id":"aaaaaaa1-0000-4000-8000-000000000003","debit":0,"credit":150}]'::jsonb, 'optA-a4');
reset role;
\echo A5 no partial rows from A4 (count of entries described 'manual 3-line tagged')
select 'A5 partial entries: '||count(*) from journal_entries where description='manual 3-line tagged';
\echo A6 project postings still work through the internal path (capitalise then release)
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'A6 cap: '||(capitalise_project_cost('bbbbbbb1-0000-4000-8000-0000000000e5', 50, 'aaaaaaa1-0000-4000-8000-000000000003', '2026-03-02', 'A6 cap') is not null);
select 'A6 rel: '||(release_project_wip('bbbbbbb1-0000-4000-8000-0000000000e5', 20, '2026-03-03', 'A6 rel') is not null);
reset role;
\echo A7 reversal of a tagged project posting still works (not via the wrapper)
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'A7 reversal: '||(reverse_journal_entry((select id from journal_entries where description='A6 cap' order by created_at desc limit 1), '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-04', 'A7') is not null);
