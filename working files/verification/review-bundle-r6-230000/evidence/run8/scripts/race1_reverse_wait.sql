\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.reverse_journal_entry('f6b185d9-77da-4ebe-8f5a-a64d93b71101','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-15','R8 order 1 reverse waits') as reversal_id;
