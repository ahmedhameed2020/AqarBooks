\set ON_ERROR_STOP 0
insert into projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values ('bbbbbbb1-0000-4000-8000-000000000105','11111111-1111-4111-8111-111111111111','GT-4','g4','g4','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000) on conflict do nothing;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('cccccccc-0000-4000-8000-00000000d001','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','GT seed W4','JOURNAL_VOUCHER','POSTED') on conflict do nothing;
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('cccccccc-0000-4000-8000-00000000d001',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'bbbbbbb1-0000-4000-8000-000000000105'),('cccccccc-0000-4000-8000-00000000d001',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null) on conflict do nothing;
\echo ==== T2b same net as T2 (final 300) but the credit 1200 comes FIRST, debit 500 second
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','GT T2b','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('dddddddd-0000-4000-8000-000000000005',1,'aaaaaaa1-0000-4000-8000-000000000001',0,1200,'bbbbbbb1-0000-4000-8000-000000000105'),('dddddddd-0000-4000-8000-000000000005',2,'aaaaaaa1-0000-4000-8000-000000000001',500,0,'bbbbbbb1-0000-4000-8000-000000000105'),('dddddddd-0000-4000-8000-000000000005',3,'aaaaaaa1-0000-4000-8000-000000000003',700,0,null);
commit;
select 'W4 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000105');
