\set ON_ERROR_STOP 1
\echo ==== Concurrent holder: keep P117 locked for five seconds
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-00000000f203','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 concurrent retry holder','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f203',1,'aaaaaaa1-0000-4000-8000-000000000001',0,50,'bbbbbbb1-0000-4000-8000-00000000f117'),('dddddddd-0000-4000-8000-00000000f203',2,'aaaaaaa1-0000-4000-8000-000000000003',50,0,null);
select pg_sleep(5);
commit;
