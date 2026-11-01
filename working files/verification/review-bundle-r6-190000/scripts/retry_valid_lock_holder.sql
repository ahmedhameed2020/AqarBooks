\set ON_ERROR_STOP 1
\echo ==== Concurrent holder: keep PA locked for five seconds
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('9c3f5a6d-6854-433a-b61d-4c91233a6053','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 valid concurrent retry holder','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('9c3f5a6d-6854-433a-b61d-4c91233a6053',1,'aaaaaaa1-0000-4000-8000-000000000001',0,50,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2'),('9c3f5a6d-6854-433a-b61d-4c91233a6053',2,'aaaaaaa1-0000-4000-8000-000000000003',50,0,null);
select pg_sleep(5);
commit;
