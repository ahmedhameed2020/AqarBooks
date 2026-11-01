\set ON_ERROR_STOP 0
insert into projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values ('bbbbbbb1-0000-4000-8000-000000000118','11111111-1111-4111-8111-111111111111','UPD-18','u','u','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000) on conflict do nothing;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('cccccccc-0000-4000-8000-00000000f118','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','UPD seed','JOURNAL_VOUCHER','POSTED') on conflict do nothing;
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('cccccccc-0000-4000-8000-00000000f118',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'bbbbbbb1-0000-4000-8000-000000000118'),('cccccccc-0000-4000-8000-00000000f118',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null) on conflict do nothing;
\echo ==== Q2 (after fix) committed DRAFT credit 600 on W18, then UPDATE it to 1500 (net would be -500)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000018d1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-07','Q2 draft W18','JOURNAL_VOUCHER','DRAFT');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000018d1',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000118'),('dddddddd-0000-4000-8000-0000000018d1',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null);
commit;
begin;
update journal_entry_lines set credit=1500 where journal_entry_id='dddddddd-0000-4000-8000-0000000018d1' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
update journal_entry_lines set debit=1500 where journal_entry_id='dddddddd-0000-4000-8000-0000000018d1' and account_id='aaaaaaa1-0000-4000-8000-000000000003';
commit;
select 'W18 net after attempt (should be 400, the update must be refused): '||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000118' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000118');
\echo ==== Q3 pre-existing negative on W14 (net already -500 from the bypass before this fix)
select 'W14 before: net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000114' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000014e1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','Q3 debit 100','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000014e1',1,'aaaaaaa1-0000-4000-8000-000000000001',100,0,'bbbbbbb1-0000-4000-8000-000000000114'),('dddddddd-0000-4000-8000-0000000014e1',2,'aaaaaaa1-0000-4000-8000-000000000003',0,100,null);
commit;
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000014e2','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','Q3 debit 600','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000014e2',1,'aaaaaaa1-0000-4000-8000-000000000001',600,0,'bbbbbbb1-0000-4000-8000-000000000114'),('dddddddd-0000-4000-8000-0000000014e2',2,'aaaaaaa1-0000-4000-8000-000000000003',0,600,null);
commit;
select 'W14 after both debits: net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000114' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
