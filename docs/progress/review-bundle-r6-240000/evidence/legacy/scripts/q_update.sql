\set ON_ERROR_STOP 0
\echo ==== Q1 committed DRAFT credit 600 on W14 (balance 1000 -> net 400)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-0000000003d1','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-07','Q1 draft','JOURNAL_VOUCHER','DRAFT');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-0000000003d1',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000114'),('dddddddd-0000-4000-8000-0000000003d1',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null);
commit;
select 'after draft: W14 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
\echo ==== Q2 UPDATE the committed draft line credit 600 -> 1500 (net would be 1000-1500 = -500)
begin;
update journal_entry_lines set credit=1500 where journal_entry_id='dddddddd-0000-4000-8000-0000000003d1' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
update journal_entry_lines set debit=1500 where journal_entry_id='dddddddd-0000-4000-8000-0000000003d1' and account_id='aaaaaaa1-0000-4000-8000-000000000003';
commit;
select 'after update: W14 balance='||wip_balance||' (pending counted)' from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
select 'W14 net incl drafts='||(wip_balance+coalesce((select sum(l.debit-l.credit) from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id where l.project_id='bbbbbbb1-0000-4000-8000-000000000114' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and je.status not in ('POSTED','REVERSED')),0)) from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
