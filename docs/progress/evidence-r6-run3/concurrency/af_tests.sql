\set ON_ERROR_STOP 0
\echo ==== T1 (same as before) one POSTED entry, two WIP credits 600+600 on W11
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000111','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T1','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-000000000111',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000111'),('dddddddd-0000-4000-8000-000000000111',2,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000111'),('dddddddd-0000-4000-8000-000000000111',3,'aaaaaaa1-0000-4000-8000-000000000003',1200,0,null);
commit;
\echo ==== T2 (same as before) POSTED entry on W12: WIP debit 500 then WIP credit 1200 (net final 300, must be accepted)
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000112','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T2','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-000000000112',1,'aaaaaaa1-0000-4000-8000-000000000001',500,0,'bbbbbbb1-0000-4000-8000-000000000112'),('dddddddd-0000-4000-8000-000000000112',2,'aaaaaaa1-0000-4000-8000-000000000001',0,1200,'bbbbbbb1-0000-4000-8000-000000000112'),('dddddddd-0000-4000-8000-000000000112',3,'aaaaaaa1-0000-4000-8000-000000000003',700,0,null);
commit;
\echo ==== T2b (credit first, same net) on W13: must be accepted, same as T2
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000113','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T2b','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-000000000113',1,'aaaaaaa1-0000-4000-8000-000000000001',0,1200,'bbbbbbb1-0000-4000-8000-000000000113'),('dddddddd-0000-4000-8000-000000000113',2,'aaaaaaa1-0000-4000-8000-000000000001',500,0,'bbbbbbb1-0000-4000-8000-000000000113'),('dddddddd-0000-4000-8000-000000000113',3,'aaaaaaa1-0000-4000-8000-000000000003',700,0,null);
commit;
\echo ==== T3 two DRAFT entries on W14, each WIP credit 600 (pending 1200 > 1000): must be refused at commit
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000114','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T3a','JOURNAL_VOUCHER','DRAFT'),('dddddddd-0000-4000-8000-000000000115','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T3b','JOURNAL_VOUCHER','DRAFT');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-000000000114',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000114'),('dddddddd-0000-4000-8000-000000000114',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null),('dddddddd-0000-4000-8000-000000000115',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000114'),('dddddddd-0000-4000-8000-000000000115',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null);
commit;
\echo ==== T4 one statement, lines tagged to TWO projects (W15 debit 0 credit 600, W16 credit 600), POSTED, balanced
begin;
insert into journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-000000000116','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','AF T4','JOURNAL_VOUCHER','POSTED');
insert into journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-000000000116',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000115'),('dddddddd-0000-4000-8000-000000000116',2,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'bbbbbbb1-0000-4000-8000-000000000116'),('dddddddd-0000-4000-8000-000000000116',3,'aaaaaaa1-0000-4000-8000-000000000003',1200,0,null);
commit;
\echo ==== T5 opposite lock order: S1 tags W15 then W16; S2 tags W16 then W15 (run in two sessions, see af_t5_*.sql)
\echo ==== STATE
select 'W11 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000111');
select 'W12 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000112');
select 'W13 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000113');
select 'W14 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000114');
select 'W15 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000115');
select 'W16 balance='||wip_balance from project_wip_summary('bbbbbbb1-0000-4000-8000-000000000116');
select 'unbalanced AF entries: '||count(*) from (select journal_entry_id from journal_entry_lines where journal_entry_id::text like 'dddddddd-0000-4000-8000-0000000001%' group by journal_entry_id having sum(debit)<>sum(credit)) x;
