\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
begin;
select 'S1 reverse: '||reverse_journal_entry('d3c2ecc7-151a-4a2e-a8dc-d5cec69bcbee', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'reverse held');
select pg_sleep(4);
commit;
