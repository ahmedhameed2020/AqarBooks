\set ON_ERROR_STOP 0
\echo ==== CANCELLED WIP CREDIT 800: valid release 600 must use posted balance 1000 only
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('a17c30d4-22e4-4f5f-9c95-81072e0df501','11111111-1111-4111-8111-111111111111','R7-CANCEL-CREDIT-RELEASE','إلغاء دائن ثم إطلاق','Cancelled credit then release','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('a17c30d4-22e4-4f5f-9c95-81072e0df501',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R7 cancelled credit base cap') as cap;
reset role;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status)
values ('b28d41e5-33f5-4a6a-8d16-92183f1ea612','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','R7 cancelled WIP credit 800','JOURNAL_VOUCHER','DRAFT');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id)
values ('b28d41e5-33f5-4a6a-8d16-92183f1ea612',1,'aaaaaaa1-0000-4000-8000-000000000001',0,800,'a17c30d4-22e4-4f5f-9c95-81072e0df501'),
       ('b28d41e5-33f5-4a6a-8d16-92183f1ea612',2,'aaaaaaa1-0000-4000-8000-000000000003',800,0,null);
update public.journal_entries set status='REVERSED' where id='b28d41e5-33f5-4a6a-8d16-92183f1ea612';
select je.status,je.reversed_entry_id,
       exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id) as has_reversal_entry
from public.journal_entries je where je.id='b28d41e5-33f5-4a6a-8d16-92183f1ea612';
select capitalised,released,wip_balance from public.project_wip_summary('a17c30d4-22e4-4f5f-9c95-81072e0df501');
select public.project_wip_net('a17c30d4-22e4-4f5f-9c95-81072e0df501') as all_status_floor_net;
set role authenticated;
do $$
declare
  v_release_id uuid;
  v_error text := '';
begin
  begin
    select public.release_project_wip('a17c30d4-22e4-4f5f-9c95-81072e0df501',600,'2026-03-12','R7 valid release after cancelled credit') into v_release_id;
  exception when others then
    v_error := sqlerrm;
  end;
  if v_release_id is null then
    raise exception 'ASSERT_CANCELLED_CREDIT_RELEASE_FAILED: valid release 600 was rejected; error=%',v_error;
  end if;
  raise notice 'ASSERT_CANCELLED_CREDIT_RELEASE_ACCEPTED: release_id=%',v_release_id;
end $$;
reset role;
select capitalised,released,wip_balance from public.project_wip_summary('a17c30d4-22e4-4f5f-9c95-81072e0df501');
select je.id,je.status,sum(l.debit) as debit,sum(l.credit) as credit,
       sum(l.debit-l.credit) as net,
       count(*) filter (where l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and l.credit=600 and l.project_id='a17c30d4-22e4-4f5f-9c95-81072e0df501') as wip_credit_lines,
       count(*) filter (where l.account_id='aaaaaaa1-0000-4000-8000-000000000004' and l.debit=600 and l.project_id is null) as cost_debit_lines
from public.journal_entries je
join public.journal_entry_lines l on l.journal_entry_id=je.id
where je.description='R7 valid release after cancelled credit'
group by je.id,je.status;
do $$
declare
  s record;
  r record;
  v_ledger numeric;
begin
  select * into s from public.project_wip_summary('a17c30d4-22e4-4f5f-9c95-81072e0df501');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger
  from public.journal_entry_lines l
  join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='a17c30d4-22e4-4f5f-9c95-81072e0df501'
    and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries x where x.reversed_entry_id=je.id)));
  select je.status,sum(l.debit) as debit,sum(l.credit) as credit,
         count(*) filter (where l.account_id='aaaaaaa1-0000-4000-8000-000000000001' and l.credit=600 and l.project_id='a17c30d4-22e4-4f5f-9c95-81072e0df501') as wip_credit_lines,
         count(*) filter (where l.account_id='aaaaaaa1-0000-4000-8000-000000000004' and l.debit=600 and l.project_id is null) as cost_debit_lines
  into r
  from public.journal_entries je
  join public.journal_entry_lines l on l.journal_entry_id=je.id
  where je.description='R7 valid release after cancelled credit'
  group by je.id,je.status;
  if s.capitalised<>1000 or s.released<>600 or s.wip_balance<>400 or v_ledger<>400 then
    raise exception 'ASSERT_CANCELLED_CREDIT_RELEASE_FAILED: expected cap=1000 rel=600 wip=400 ledger=400; actual cap=% rel=% wip=% ledger=%',s.capitalised,s.released,s.wip_balance,v_ledger;
  end if;
  if r.status<>'POSTED' or r.debit<>600 or r.credit<>600 or r.wip_credit_lines<>1 or r.cost_debit_lines<>1 then
    raise exception 'ASSERT_CANCELLED_CREDIT_RELEASE_FAILED: release entry invalid; status=% debit=% credit=% wip_lines=% cost_lines=%',r.status,r.debit,r.credit,r.wip_credit_lines,r.cost_debit_lines;
  end if;
  raise notice 'ASSERT_CANCELLED_CREDIT_RELEASE_PASS: accepted release gives cap=1000 rel=600 wip=400 ledger=400; entry POSTED and balanced 600/600';
end $$;
rollback;
