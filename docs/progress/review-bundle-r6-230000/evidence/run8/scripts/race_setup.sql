\set ON_ERROR_STOP 1
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values
 ('e5a074c8-66c9-4dad-9e4f-953c82a61001','11111111-1111-4111-8111-111111111111','R8-RACE-1','سباق أول','Race one','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
 ('e5a074c8-66c9-4dad-9e4f-953c82a61002','11111111-1111-4111-8111-111111111111','R8-RACE-2','سباق ثان','Race two','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71101','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R8 race 1 capitalisation','JOURNAL_VOUCHER','POSTED'),
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71102','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R8 race 2 capitalisation','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71101',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'e5a074c8-66c9-4dad-9e4f-953c82a61001'),
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71101',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null),
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71102',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'e5a074c8-66c9-4dad-9e4f-953c82a61002'),
 ('f6b185d9-77da-4ebe-8f5a-a64d93b71102',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null);
commit;
select 'RACE_SETUP_PASS' as result;
