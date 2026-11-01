\set ON_ERROR_STOP 0
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select 'S2 reverse: '||reverse_journal_entry('c5c8f447-e953-4bcc-8210-347f752a3dfd', '57c9ef44-56e4-491c-b3a8-2402a3b8d185', '2026-03-15', 'race order 1');
