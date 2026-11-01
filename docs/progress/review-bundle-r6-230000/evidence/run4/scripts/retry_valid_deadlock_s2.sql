\set ON_ERROR_STOP 0
\echo ==== S2 first attempt: lock PB, then request PA
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-06','R4 valid retry S2','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8',1,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'524b4df9-0085-4cbf-ab59-de201c64423e');
select pg_sleep(1);
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values ('58173864-8d6c-4d04-82dd-4f11f6d56ab8',2,'aaaaaaa1-0000-4000-8000-000000000001',0,100,'dfe19bc7-9f70-4789-9a1a-76ad76ed2aa2'),('58173864-8d6c-4d04-82dd-4f11f6d56ab8',3,'aaaaaaa1-0000-4000-8000-000000000003',200,0,null);
commit;
select 'S2 entry persisted='||exists(select 1 from public.journal_entries where id='58173864-8d6c-4d04-82dd-4f11f6d56ab8');
