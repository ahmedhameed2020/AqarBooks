\set ON_ERROR_STOP 0
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000f1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','D S1 improve','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000f1',1,'aaaaaaa1-0000-4000-8000-000000000001',100,0,'bbbbbbb1-0000-4000-8000-0000000002a5');
select pg_sleep(3);
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000f1',2,'aaaaaaa1-0000-4000-8000-000000000003',0,100,null);
commit;
