\set ON_ERROR_STOP 1
\timing on
select not exists(select 1 from public.journal_entries where id='dddddddd-0000-4000-8000-00000000f201') as needs_s1,
       not exists(select 1 from public.journal_entries where id='dddddddd-0000-4000-8000-00000000f202') as needs_s2 \gset
\echo ==== Retry only the transaction whose first attempt rolled back
\if :needs_s1
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-00000000f201','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 retry S1','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f201',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f117');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f201',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f118'),('dddddddd-0000-4000-8000-00000000f201',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
\endif
\if :needs_s2
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('dddddddd-0000-4000-8000-00000000f202','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 retry S2','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f202',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f118');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('dddddddd-0000-4000-8000-00000000f202',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'bbbbbbb1-0000-4000-8000-00000000f117'),('dddddddd-0000-4000-8000-00000000f202',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
\endif
select id, status from public.journal_entries where id in ('dddddddd-0000-4000-8000-00000000f201','dddddddd-0000-4000-8000-00000000f202') order by id;
select 'P117 final='||wip_balance from public.project_wip_summary('bbbbbbb1-0000-4000-8000-00000000f117');
select 'P118 final='||wip_balance from public.project_wip_summary('bbbbbbb1-0000-4000-8000-00000000f118');
select 'unbalanced retry entries='||count(*) from (select journal_entry_id from public.journal_entry_lines where journal_entry_id in ('dddddddd-0000-4000-8000-00000000f201','dddddddd-0000-4000-8000-00000000f202','dddddddd-0000-4000-8000-00000000f203') group by journal_entry_id having sum(debit)<>sum(credit)) x;
