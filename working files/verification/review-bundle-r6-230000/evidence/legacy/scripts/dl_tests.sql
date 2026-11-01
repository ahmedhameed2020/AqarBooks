\set ON_ERROR_STOP 0
\echo ==== A1 privileged DELETE of P1 capitalisation debit 1000 (net 400 -> -600, must be refused)
begin;
delete from journal_entry_lines where journal_entry_id='cccccccc-0000-4000-8000-00000000f201' and account_id='aaaaaaa1-0000-4000-8000-000000000001' and debit=1000;
commit;
select 'P1-after-A1 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000201' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000201');
\echo ==== A2 privileged DELETE of P1 release credit 600 (net 400 -> 1000, must be accepted)
begin;
delete from journal_entry_lines where journal_entry_id='cccccccc-0000-4000-8000-00000000f202' and account_id='aaaaaaa1-0000-4000-8000-000000000001' and credit=600;
commit;
select 'P1-after-A2 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000201' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000201');
\echo ==== B atomicity: in ONE transaction move P2 capitalisation debit 1000 to P3 (P2 would go -600) AND insert an unrelated line on P4
begin;
update journal_entry_lines set project_id='bbbbbbb1-0000-4000-8000-000000000203' where journal_entry_id='cccccccc-0000-4000-8000-00000000f203' and account_id='aaaaaaa1-0000-4000-8000-000000000001' and debit=1000;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000b1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','B unrelated','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000b1',1,'aaaaaaa1-0000-4000-8000-000000000001',200,0,'bbbbbbb1-0000-4000-8000-000000000204'),('dddddddd-0000-4000-8000-0000000000b1',2,'aaaaaaa1-0000-4000-8000-000000000003',0,200,null);
commit;
select 'P2-after-B net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000202' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000202');
select 'P3-after-B net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000203' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000203');
select 'P4 lines after B (unchanged expected = 1 seed + 0 unrelated): '||count(*) from journal_entry_lines where project_id='bbbbbbb1-0000-4000-8000-000000000204';
\echo ==== C1 pre-existing negative N (net -500 from a bypass): debit 100 must be ACCEPTED (-500 -> -400)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000c1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C1','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000c1',1,'aaaaaaa1-0000-4000-8000-000000000001',100,0,'bbbbbbb1-0000-4000-8000-000000000205'),('dddddddd-0000-4000-8000-0000000000c1',2,'aaaaaaa1-0000-4000-8000-000000000003',0,100,null);
commit;
select 'N-after-C1 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000205' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000205');
\echo ==== C2 pre-existing negative N (now -400): credit 50 must be REFUSED (worsens)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000c2','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C2','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000c2',1,'aaaaaaa1-0000-4000-8000-000000000001',0,50,'bbbbbbb1-0000-4000-8000-000000000205'),('dddddddd-0000-4000-8000-0000000000c2',2,'aaaaaaa1-0000-4000-8000-000000000003',50,0,null);
commit;
select 'N-after-C2 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000205' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000205');
\echo ==== C3 pre-existing negative N (-400): debit 600 must be ACCEPTED (-> +200, nonnegative)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000c3','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C3','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000c3',1,'aaaaaaa1-0000-4000-8000-000000000001',600,0,'bbbbbbb1-0000-4000-8000-000000000205'),('dddddddd-0000-4000-8000-0000000000c3',2,'aaaaaaa1-0000-4000-8000-000000000003',0,600,null);
commit;
select 'N-after-C3 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000205' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000205');
\echo ==== C4 NON-negative M (1000) credit 1500 must be REFUSED (transition nonnegative -> negative)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000000c4','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','C4','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000000c4',1,'aaaaaaa1-0000-4000-8000-000000000001',0,1500,'bbbbbbb1-0000-4000-8000-000000000206'),('dddddddd-0000-4000-8000-0000000000c4',2,'aaaaaaa1-0000-4000-8000-000000000003',1500,0,null);
commit;
select 'M-after-C4 net='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000206' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000206');
