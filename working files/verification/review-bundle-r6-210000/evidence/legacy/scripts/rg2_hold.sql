\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
begin;
select 'Q2 reverse capitalisation: '||(reverse_journal_entry('3be2525b-9718-4983-b5eb-76110267df5e', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'rg Q2 reverse') is not null);
select pg_sleep(4);
commit;
