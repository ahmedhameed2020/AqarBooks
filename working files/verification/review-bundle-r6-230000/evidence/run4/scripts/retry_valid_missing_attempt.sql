\set ON_ERROR_STOP 1
\timing on
select not exists(select 1 from public.journal_entries where id='10f1fec7-0ba5-403b-ae92-558017a6c818') as needs_s1,
       not exists(select 1 from public.journal_entries where id='58173864-8d6c-4d04-82dd-4f11f6d56ab8') as needs_s2 \gset
\echo ==== Retry only the transaction whose first attempt rolled back
\if :needs_s1
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('10f1fec7-0ba5-403b-ae92-558017a6c818','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 valid retry S1','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('10f1fec7-0ba5-403b-ae92-558017a6c818',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('10f1fec7-0ba5-403b-ae92-558017a6c818',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'524b4df9-0085-4cbf-ab59-de201c64423e'),('10f1fec7-0ba5-403b-ae92-558017a6c818',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
\endif
\if :needs_s2
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 valid retry S2','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'524b4df9-0085-4cbf-ab59-de201c64423e');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2'),('58173864-8d6c-4d04-82dd-4f11f6d56ab8',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
\endif
select id, status from public.journal_entries where id in ('10f1fec7-0ba5-403b-ae92-558017a6c818','58173864-8d6c-4d04-82dd-4f11f6d56ab8') order by id;
select 'PA final='||wip_balance from public.project_wip_summary('dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2');
select 'PB final='||wip_balance from public.project_wip_summary('524b4df9-0085-4cbf-ab59-de201c64423e');
select 'unbalanced retry entries='||count(*) from (select journal_entry_id from public.journal_entry_lines where journal_entry_id in ('10f1fec7-0ba5-403b-ae92-558017a6c818','58173864-8d6c-4d04-82dd-4f11f6d56ab8','9c3f5a6d-6854-433a-b61d-4c91233a6053') group by journal_entry_id having sum(debit)<>sum(credit)) x;
