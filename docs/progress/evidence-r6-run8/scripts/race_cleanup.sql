\set ON_ERROR_STOP 0
begin;
delete from public.journal_entries where id='f6b185d9-77da-4ebe-8f5a-a64d93b71101'
   or id='f6b185d9-77da-4ebe-8f5a-a64d93b71102'
   or reversed_entry_id in ('f6b185d9-77da-4ebe-8f5a-a64d93b71101','f6b185d9-77da-4ebe-8f5a-a64d93b71102')
   or description like '%R8 order 1 release held'
   or description like '%R8 order 2 release waits';
delete from public.projects where id in ('e5a074c8-66c9-4dad-9e4f-953c82a61001','e5a074c8-66c9-4dad-9e4f-953c82a61002');
commit;
