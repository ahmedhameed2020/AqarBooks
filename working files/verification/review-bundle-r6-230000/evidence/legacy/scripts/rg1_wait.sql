\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'Q1 reverse capitalisation: '||(reverse_journal_entry('c80f6b57-7440-479d-a21a-eb4a56c674de', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'rg Q1 reverse') is not null);
