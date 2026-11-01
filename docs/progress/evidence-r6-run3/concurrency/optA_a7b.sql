\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'A7 reverse release first: '||(reverse_journal_entry((select id from journal_entries where description like '%A6 rel%' order by created_at desc limit 1), '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-04', 'A7 rel') is not null);
select 'A7 then reverse capitalisation: '||(reverse_journal_entry((select id from journal_entries where description like '%A6 cap%' order by created_at desc limit 1), '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-04', 'A7 cap') is not null);
reset role;
select 'A7 report R: '||'cap='||capitalised||' rel='||released||' wip='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000000e5');
