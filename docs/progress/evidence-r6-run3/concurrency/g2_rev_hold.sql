\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
begin;
select 'F10 reverse cap: '||(reverse_journal_entry('5a40cf4f-1410-4ccf-91a9-6db27f8be3ff', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'final2 F10 reverse') is not null);
select pg_sleep(4);
commit;
