\set ON_ERROR_STOP 0
\echo ==== CASE 3: cancelling a DRAFT WIP debit by status must not change the floor net
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('e2c229da-65f3-407f-b56c-cf043b550c74','11111111-1111-4111-8111-111111111111','R5-FLOOR-CANCEL','إلغاء مسودة مدينة','Cancelled debit draft','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('e2c229da-65f3-407f-b56c-cf043b550c74',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R5 floor cancel cap') as cap \gset
select public.release_project_wip('e2c229da-65f3-407f-b56c-cf043b550c74',600,'2026-03-10','R5 floor cancel release') as rel \gset
reset role;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status)
values ('32a621ea-c348-4c53-8cb2-e56280f8b50b','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','R5 floor draft debit 300','JOURNAL_VOUCHER','DRAFT'),
       ('fdac1dfd-15dc-4a2b-b53f-33e1c58b26ea','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','R5 floor draft credit 600','JOURNAL_VOUCHER','DRAFT');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id)
values ('32a621ea-c348-4c53-8cb2-e56280f8b50b',1,'aaaaaaa1-0000-4000-8000-000000000001',300,0,'e2c229da-65f3-407f-b56c-cf043b550c74'),
       ('32a621ea-c348-4c53-8cb2-e56280f8b50b',2,'aaaaaaa1-0000-4000-8000-000000000003',0,300,null),
       ('fdac1dfd-15dc-4a2b-b53f-33e1c58b26ea',1,'aaaaaaa1-0000-4000-8000-000000000001',0,600,'e2c229da-65f3-407f-b56c-cf043b550c74'),
       ('fdac1dfd-15dc-4a2b-b53f-33e1c58b26ea',2,'aaaaaaa1-0000-4000-8000-000000000003',600,0,null);
select public.project_wip_net('e2c229da-65f3-407f-b56c-cf043b550c74') as net_before_cancellation,
       public.project_wip_floor_net('e2c229da-65f3-407f-b56c-cf043b550c74') as floor_net_before_cancellation;
commit;

begin;
update public.journal_entries set status='REVERSED' where id='32a621ea-c348-4c53-8cb2-e56280f8b50b';
select public.project_wip_net('e2c229da-65f3-407f-b56c-cf043b550c74') as net_after_cancellation,
       public.project_wip_floor_net('e2c229da-65f3-407f-b56c-cf043b550c74') as floor_net_after_cancellation;
set constraints all immediate;
do $$ begin raise exception 'ASSERT_CANCELLED_DEBIT_STATUS_GUARD_FAILED: deferred constraints accepted floor_net=-200'; end $$;
rollback;
select public.project_wip_net('e2c229da-65f3-407f-b56c-cf043b550c74') as net_after_rollback,
       public.project_wip_floor_net('e2c229da-65f3-407f-b56c-cf043b550c74') as floor_net_after_rollback,
       (select status from public.journal_entries where id='32a621ea-c348-4c53-8cb2-e56280f8b50b') as draft_status_after_rollback;
do $$
declare
  v_net numeric := public.project_wip_net('e2c229da-65f3-407f-b56c-cf043b550c74');
  v_floor numeric := public.project_wip_floor_net('e2c229da-65f3-407f-b56c-cf043b550c74');
  v_ledger numeric;
  v_status text;
begin
  select coalesce(sum(l.debit-l.credit),0) into v_ledger
  from public.journal_entry_lines l
  where l.project_id='e2c229da-65f3-407f-b56c-cf043b550c74'
    and l.account_id='aaaaaaa1-0000-4000-8000-000000000001';
  select status into v_status from public.journal_entries where id='32a621ea-c348-4c53-8cb2-e56280f8b50b';
  if v_net is distinct from 100 or v_floor is distinct from 100 or v_ledger is distinct from 100 or v_status is distinct from 'DRAFT' then
    raise exception 'ASSERT_CANCELLED_DEBIT_STATUS_GUARD_FAILED: expected net=100 floor=100 ledger=100 status=DRAFT; actual net=% floor=% ledger=% status=%',v_net,v_floor,v_ledger,v_status;
  end if;
  raise notice 'ASSERT_CANCELLED_DEBIT_STATUS_GUARD_PASS: invalid cancellation refused at deferred constraints; committed net=100 floor=100 ledger=100 status=DRAFT';
end $$;

begin;
delete from public.journal_entries where id in (:'cap', :'rel', '32a621ea-c348-4c53-8cb2-e56280f8b50b', 'fdac1dfd-15dc-4a2b-b53f-33e1c58b26ea');
delete from public.projects where id='e2c229da-65f3-407f-b56c-cf043b550c74';
commit;
