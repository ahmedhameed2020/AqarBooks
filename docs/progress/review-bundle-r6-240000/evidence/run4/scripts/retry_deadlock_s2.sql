\set ON_ERROR_STOP 0
\echo ==== S2 first attempt: lock P118, then request P117
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-00000000f202','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 retry S2','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f202',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f118');
select pg_sleep(1);
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f202',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f117'),('dddddddd-0000-4000-8000-00000000f202',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
select 'S2 entry persisted='||exists(select 1 from public.journal_entries where id='dddddddd-0000-4000-8000-00000000f202');
