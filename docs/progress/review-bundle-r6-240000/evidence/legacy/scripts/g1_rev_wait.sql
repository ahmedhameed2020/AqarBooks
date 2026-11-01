\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'F9 reverse cap: '||(reverse_journal_entry('3c5204cd-b8cd-4612-984b-aa01881999a0', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'final2 F9 reverse') is not null);
