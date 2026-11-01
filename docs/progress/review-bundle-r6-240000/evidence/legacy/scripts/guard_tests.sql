\set ON_ERROR_STOP 0
\echo ==== T1 one POSTED entry, one statement, two WIP credits 600+600 on W1 (sum 1200 > balance 1000)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','GT T1','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('dddddddd-0000-4000-8000-000000000001',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000101'),('dddddddd-0000-4000-8000-000000000001',2,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000101'),('dddddddd-0000-4000-8000-000000000001',3,'aaaaaaa1-0000-4000-8000-000000000003',1200,0,null);
commit;
\echo ==== T2 one POSTED entry on W2: WIP debit 500 and WIP credit 1200 (net -700, final 300 should be accepted)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','GT T2','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('dddddddd-0000-4000-8000-000000000002',1,'aaaaaaa1-0000-4000-8000-000000000001',500,0,'bbbbbbb1-0000-4000-8000-000000000102'),('dddddddd-0000-4000-8000-000000000002',2,'aaaaaaa1-0000-4000-8000-000000000001',0,1200,'bbbbbbb1-0000-4000-8000-000000000102'),('dddddddd-0000-4000-8000-000000000002',3,'aaaaaaa1-0000-4000-8000-000000000003',700,0,null);
commit;
\echo ==== T3 two DRAFT entries on W3, each WIP credit 600 (pending sum 1200 > balance 1000), same transaction
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','GT T3a','JOURNAL_VOUCHER','DRAFT'),('dddddddd-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','GT T3b','JOURNAL_VOUCHER','DRAFT');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('dddddddd-0000-4000-8000-000000000003',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000103'),('dddddddd-0000-4000-8000-000000000003',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null),
 ('dddddddd-0000-4000-8000-000000000004',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000103'),('dddddddd-0000-4000-8000-000000000004',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null);
commit;
\echo ==== STATE after the three cases
select 'W1 balance='||wip_balance||' lines='||(select count(*) from journal_entry_lines where project_id='bbbbbbb1-0000-4000-8000-000000000101') from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000101');
select 'W2 balance='||wip_balance||' lines='||(select count(*) from journal_entry_lines where project_id='bbbbbbb1-0000-4000-8000-000000000102') from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000102');
select 'W3 balance='||wip_balance||' lines='||(select count(*) from journal_entry_lines where project_id='bbbbbbb1-0000-4000-8000-000000000103') from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000103');
select 'unbalanced test entries: '||count(*) from (select journal_entry_id from journal_entry_lines where journal_entry_id::text like 'dddddddd%' group by journal_entry_id having sum(debit)<>sum(credit)) x;
