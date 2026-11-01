\set ON_ERROR_STOP 0
\echo ==== SETUP: isolated positive project M=1000 and pre-existing negative project N=-500
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values
 ('c38e52a6-44a7-4b8b-9c2d-731a60e40001','11111111-1111-4111-8111-111111111111','R8-POSITIVE','سالب ممنوع','Negative refused','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
 ('c38e52a6-44a7-4b8b-9c2d-731a60e40002','11111111-1111-4111-8111-111111111111','R8-OLD-NEGATIVE','سالب قديم','Old negative','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50101','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R8 positive seed','JOURNAL_VOUCHER','POSTED'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50102','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R8 negative cap seed','JOURNAL_VOUCHER','POSTED'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50103','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-01','R8 negative bypass credit','JOURNAL_VOUCHER','POSTED');
set session_replication_role = replica;
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50101',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'c38e52a6-44a7-4b8b-9c2d-731a60e40001'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50101',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50102',1,'aaaaaaa1-0000-4000-8000-000000000001',1000,0,'c38e52a6-44a7-4b8b-9c2d-731a60e40002'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50102',2,'aaaaaaa1-0000-4000-8000-000000000003',0,1000,null),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50103',1,'aaaaaaa1-0000-4000-8000-000000000001',0,1500,'c38e52a6-44a7-4b8b-9c2d-731a60e40002'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50103',2,'aaaaaaa1-0000-4000-8000-000000000003',1500,0,null);
commit;
set session_replication_role = origin;
select public.project_wip_floor_net('c38e52a6-44a7-4b8b-9c2d-731a60e40001') as positive_baseline,
       public.project_wip_floor_net('c38e52a6-44a7-4b8b-9c2d-731a60e40002') as negative_baseline;

\echo ==== NONNEGATIVE 1000 -> -500: credit 1500 must be refused atomically
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50104','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','R8 must create negative','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50104',1,'aaaaaaa1-0000-4000-8000-000000000001',0,1500,'c38e52a6-44a7-4b8b-9c2d-731a60e40001'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50104',2,'aaaaaaa1-0000-4000-8000-000000000003',1500,0,null);
set constraints all immediate;
commit;
do $$
declare v_net numeric := public.project_wip_floor_net('c38e52a6-44a7-4b8b-9c2d-731a60e40001');
begin
  if v_net is distinct from 1000 or exists(select 1 from public.journal_entries where id='d49f63b7-55b8-4c9c-8d3e-842b71f50104') then
    raise exception 'ASSERT_NONNEGATIVE_TO_NEGATIVE_REFUSED_FAILED: net=% entry_exists=%',v_net,exists(select 1 from public.journal_entries where id='d49f63b7-55b8-4c9c-8d3e-842b71f50104');
  end if;
  raise notice 'ASSERT_NONNEGATIVE_TO_NEGATIVE_REFUSED_PASS: net remains 1000 and rejected entry wrote nothing';
end $$;

\echo ==== PRE-EXISTING NEGATIVE -500 -> -400: debit 100 must be accepted
begin;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50105','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-05','R8 improve old negative','JOURNAL_VOUCHER','POSTED');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id) values
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50105',1,'aaaaaaa1-0000-4000-8000-000000000001',100,0,'c38e52a6-44a7-4b8b-9c2d-731a60e40002'),
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50105',2,'aaaaaaa1-0000-4000-8000-000000000003',0,100,null);
commit;
do $$
declare v_net numeric := public.project_wip_floor_net('c38e52a6-44a7-4b8b-9c2d-731a60e40002');
begin
  if v_net is distinct from -400 then
    raise exception 'ASSERT_NEGATIVE_IMPROVEMENT_ACCEPTED_FAILED: expected -400 actual=%',v_net;
  end if;
  raise notice 'ASSERT_NEGATIVE_IMPROVEMENT_ACCEPTED_PASS: old negative improved from -500 to -400';
end $$;

begin;
delete from public.journal_entries where id in
 ('d49f63b7-55b8-4c9c-8d3e-842b71f50101','d49f63b7-55b8-4c9c-8d3e-842b71f50102','d49f63b7-55b8-4c9c-8d3e-842b71f50103','d49f63b7-55b8-4c9c-8d3e-842b71f50104','d49f63b7-55b8-4c9c-8d3e-842b71f50105');
delete from public.projects where id in ('c38e52a6-44a7-4b8b-9c2d-731a60e40001','c38e52a6-44a7-4b8b-9c2d-731a60e40002');
commit;
