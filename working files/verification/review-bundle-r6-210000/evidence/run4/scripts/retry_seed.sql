\set ON_ERROR_STOP 1
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values
  ('bbbbbbb1-0000-4000-8000-00000000f117','11111111-1111-4111-8111-111111111111','R4-117','اختبار إعادة المحاولة 117','Retry 117','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
  ('bbbbbbb1-0000-4000-8000-00000000f118','11111111-1111-4111-8111-111111111111','R4-118','اختبار إعادة المحاولة 118','Retry 118','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
  ('cccccccc-0000-4000-8000-00000000f117','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R4 retry seed 117','JOURNAL_VOUCHER','POSTED'),
  ('cccccccc-0000-4000-8000-00000000f118','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R4 retry seed 118','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
  ('cccccccc-0000-4000-8000-00000000f117',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'bbbbbbb1-0000-4000-8000-00000000f117'),
  ('cccccccc-0000-4000-8000-00000000f117',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null),
  ('cccccccc-0000-4000-8000-00000000f118',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'bbbbbbb1-0000-4000-8000-00000000f118'),
  ('cccccccc-0000-4000-8000-00000000f118',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null);
select 'P117 initial='||wip_balance from public.project_wip_summary('bbbbbbb1-0000-4000-8000-00000000f117');
select 'P118 initial='||wip_balance from public.project_wip_summary('bbbbbbb1-0000-4000-8000-00000000f118');
