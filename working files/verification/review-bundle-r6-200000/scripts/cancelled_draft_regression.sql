\set ON_ERROR_STOP 0
\echo ==== CASE 1: a DRAFT cancelled by status alone must not become released cost
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('2b584366-f0e7-4d45-951c-6229d5c91b7a','11111111-1111-4111-8111-111111111111','R5-CANCEL','مسودة ملغاة','Cancelled draft','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('2b584366-f0e7-4d45-951c-6229d5c91b7a',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R5 cancel base cap') as cap \gset
select public.release_project_wip('2b584366-f0e7-4d45-951c-6229d5c91b7a',600,'2026-03-10','R5 cancel base release') as rel \gset
reset role;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status)
values ('fd84be88-9298-4961-8703-bcd2c9561df5','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','R5 draft 300 cancelled by status','JOURNAL_VOUCHER','DRAFT');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id)
values ('fd84be88-9298-4961-8703-bcd2c9561df5',1,'aaaaaaa1-0000-4000-8000-000000000001',0,300,'2b584366-f0e7-4d45-951c-6229d5c91b7a'),
       ('fd84be88-9298-4961-8703-bcd2c9561df5',2,'aaaaaaa1-0000-4000-8000-000000000003',300,0,null);
update public.journal_entries set status='REVERSED' where id='fd84be88-9298-4961-8703-bcd2c9561df5';
select je.status, je.reversed_entry_id,
       exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id) as has_reversal_entry
from public.journal_entries je where je.id='fd84be88-9298-4961-8703-bcd2c9561df5';
select capitalised, released, wip_balance from public.project_wip_summary('2b584366-f0e7-4d45-951c-6229d5c91b7a');
do $$
declare
  s record;
  v_ledger numeric;
begin
  select * into s from public.project_wip_summary('2b584366-f0e7-4d45-951c-6229d5c91b7a');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger
  from public.journal_entry_lines l
  join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='2b584366-f0e7-4d45-951c-6229d5c91b7a'
    and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  if s.capitalised<>1000 or s.released<>600 or s.wip_balance<>400 or v_ledger<>400 then
    raise exception 'ASSERT_CANCELLED_DRAFT_FAILED: expected cap=1000 rel=600 wip=400 ledger=400; actual cap=% rel=% wip=% ledger=%', s.capitalised, s.released, s.wip_balance, v_ledger;
  end if;
  raise notice 'ASSERT_CANCELLED_DRAFT_PASS: cap=1000 rel=600 wip=400 ledger=400';
end $$;
rollback;
