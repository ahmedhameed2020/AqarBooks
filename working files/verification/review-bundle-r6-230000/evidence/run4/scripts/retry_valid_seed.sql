\set ON_ERROR_STOP 1
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values
  ('dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2','11111111-1111-4111-8111-111111111111','R4R-2AA2','اختبار إعادة المحاولة 2AA2','Retry 2AA2','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
  ('524b4df9-0085-4cbf-ab59-de201c64423e','11111111-1111-4111-8111-111111111111','R4R-423E','اختبار إعادة المحاولة 423E','Retry 423E','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
  ('16ea7a94-e594-456c-9f3b-3d2821fdb34e','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R4 valid retry seed A','JOURNAL_VOUCHER','POSTED'),
  ('4a65c999-c8c7-41a5-9fb3-a4bf31d45c69','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R4 valid retry seed B','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
  ('16ea7a94-e594-456c-9f3b-3d2821fdb34e',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2'),
  ('16ea7a94-e594-456c-9f3b-3d2821fdb34e',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null),
  ('4a65c999-c8c7-41a5-9fb3-a4bf31d45c69',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'524b4df9-0085-4cbf-ab59-de201c64423e'),
  ('4a65c999-c8c7-41a5-9fb3-a4bf31d45c69',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null);
commit;
select 'PA initial='||wip_balance from public.project_wip_summary('dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2');
select 'PB initial='||wip_balance from public.project_wip_summary('524b4df9-0085-4cbf-ab59-de201c64423e');
