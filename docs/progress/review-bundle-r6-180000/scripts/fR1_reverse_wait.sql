\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'F7 reverse cap: '||(reverse_journal_entry('', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'final F7 reverse') is not null);
