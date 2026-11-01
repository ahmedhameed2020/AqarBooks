\set ON_ERROR_STOP 0
\echo ==== C1 pre-existing negative (-500): debit 100 must be ACCEPTED (-> -400, improves)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000e1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C1 neg','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000e1',1,'aaaaaaa1-0000-4000-8000-000000000001',100,0,'bbbbbbb1-0000-4000-8000-0000000002a0'),('dddddddd-0000-4000-8000-0000000000e1',2,'aaaaaaa1-0000-4000-8000-000000000003',0,100,null);
commit;
select 'NG-after-C1 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-0000000002a0' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000002a0');
\echo ==== C2 negative (-400): credit 50 must be REFUSED (worsens)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000e2','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C2 neg','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000e2',1,'aaaaaaa1-0000-4000-8000-000000000001',0,50,'bbbbbbb1-0000-4000-8000-0000000002a0'),('dddddddd-0000-4000-8000-0000000000e2',2,'aaaaaaa1-0000-4000-8000-000000000003',50,0,null);
commit;
select 'NG-after-C2 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-0000000002a0' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000002a0');
\echo ==== C3 negative (-400): debit 600 must be ACCEPTED (-> +200)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000e3','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C3 neg','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000e3',1,'aaaaaaa1-0000-4000-8000-000000000001',600,0,'bbbbbbb1-0000-4000-8000-0000000002a0'),('dddddddd-0000-4000-8000-0000000000e3',2,'aaaaaaa1-0000-4000-8000-000000000003',0,600,null);
commit;
select 'NG-after-C3 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-0000000002a0' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-0000000002a0');
