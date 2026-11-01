\set ON_ERROR_STOP 0
\echo ==== S1 first attempt: lock PA, then request PB
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('10f1fec7-0ba5-403b-ae92-558017a6c818','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 valid retry S1','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('10f1fec7-0ba5-403b-ae92-558017a6c818',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2');
select pg_sleep(3);
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('10f1fec7-0ba5-403b-ae92-558017a6c818',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'524b4df9-0085-4cbf-ab59-de201c64423e'),('10f1fec7-0ba5-403b-ae92-558017a6c818',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
select 'S1 entry persisted='||exists(select 1 from public.journal_entries where id='10f1fec7-0ba5-403b-ae92-558017a6c818');
