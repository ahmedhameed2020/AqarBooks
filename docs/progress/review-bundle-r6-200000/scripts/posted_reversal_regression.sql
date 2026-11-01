\set ON_ERROR_STOP 0
\echo ==== CASE 2: genuine POSTED-then-REVERSED entries retain classification and reversal effect
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('d215e791-66f5-4dec-96fe-d18cf1d47ea4','11111111-1111-4111-8111-111111111111','R5-REVERSE','قيد مرحل معكوس','Posted reversal','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('d215e791-66f5-4dec-96fe-d18cf1d47ea4',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R5 reverse cap') as cap \gset
select public.release_project_wip('d215e791-66f5-4dec-96fe-d18cf1d47ea4',600,'2026-03-10','R5 reverse release') as rel \gset
select public.reverse_journal_entry(:'rel','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-15','R5 reverse release first') as reverse_rel \gset
reset role;
select capitalised, released, wip_balance from public.project_wip_summary('d215e791-66f5-4dec-96fe-d18cf1d47ea4');
do $$
declare s record; v_ledger numeric;
begin
  select * into s from public.project_wip_summary('d215e791-66f5-4dec-96fe-d18cf1d47ea4');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger from public.journal_entry_lines l join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='d215e791-66f5-4dec-96fe-d18cf1d47ea4' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  if s.capitalised<>1000 or s.released<>0 or s.wip_balance<>1000 or v_ledger<>1000 then
    raise exception 'ASSERT_REVERSED_RELEASE_FAILED: expected cap=1000 rel=0 wip=1000 ledger=1000; actual cap=% rel=% wip=% ledger=%',s.capitalised,s.released,s.wip_balance,v_ledger;
  end if;
  raise notice 'ASSERT_REVERSED_RELEASE_PASS: cap=1000 rel=0 wip=1000 ledger=1000';
end $$;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.reverse_journal_entry(:'cap','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-16','R5 reverse cap second') as reverse_cap \gset
reset role;
select capitalised, released, wip_balance from public.project_wip_summary('d215e791-66f5-4dec-96fe-d18cf1d47ea4');
do $$
declare s record; v_ledger numeric;
begin
  select * into s from public.project_wip_summary('d215e791-66f5-4dec-96fe-d18cf1d47ea4');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger from public.journal_entry_lines l join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='d215e791-66f5-4dec-96fe-d18cf1d47ea4' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  if s.capitalised<>0 or s.released<>0 or s.wip_balance<>0 or v_ledger<>0 then
    raise exception 'ASSERT_REVERSED_CAP_FAILED: expected cap=0 rel=0 wip=0 ledger=0; actual cap=% rel=% wip=% ledger=%',s.capitalised,s.released,s.wip_balance,v_ledger;
  end if;
  raise notice 'ASSERT_REVERSED_CAP_PASS: cap=0 rel=0 wip=0 ledger=0';
end $$;
select je.description, je.status, je.reversed_entry_id,
       exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id) as has_reversal_entry
from public.journal_entries je
where je.id in (:'cap',:'rel',:'reverse_rel',:'reverse_cap') order by je.created_at,je.id;
rollback;
