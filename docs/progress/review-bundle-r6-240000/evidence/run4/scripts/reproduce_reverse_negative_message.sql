\set ON_ERROR_STOP 0
\echo ==== Existing Q1 fixture: release committed, reversal of capitalisation must be refused
select id, status, reversed_entry_id from public.journal_entries where id = 'c80f6b57-7440-479d-a21a-eb4a56c674de';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.reverse_journal_entry('c80f6b57-7440-479d-a21a-eb4a56c674de', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'run4 reverse negative message');
reset role;
select id, status, reversed_entry_id from public.journal_entries where id = 'c80f6b57-7440-479d-a21a-eb4a56c674de';
