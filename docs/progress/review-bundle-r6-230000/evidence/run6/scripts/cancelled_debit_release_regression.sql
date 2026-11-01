\set ON_ERROR_STOP 0
\echo ==== CANCELLED WIP DEBIT: release must use posted balance only
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('e74266d2-7047-4f0b-bf87-8d57cb6f5021','11111111-1111-4111-8111-111111111111','R6-CANCEL-RELEASE','إلغاء ثم إطلاق','Cancelled debit then release','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('e74266d2-7047-4f0b-bf87-8d57cb6f5021',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R6 cancelled debit release cap') as cap \gset
reset role;
insert into public.journal_entries(id,organization_id,fiscal_period_id,entry_date,description,source_type,status)
values ('f3a8f36e-1971-4f1c-9db3-892f31ba248a','11111111-1111-4111-8111-111111111111','57c9ef44-56e4-491c-b3a8-2402a3b8d185','2026-03-08','R6 cancelled WIP debit 500','JOURNAL_VOUCHER','DRAFT');
insert into public.journal_entry_lines(journal_entry_id,line_number,account_id,debit,credit,project_id)
values ('f3a8f36e-1971-4f1c-9db3-892f31ba248a',1,'aaaaaaa1-0000-4000-8000-000000000001',500,0,'e74266d2-7047-4f0b-bf87-8d57cb6f5021'),
       ('f3a8f36e-1971-4f1c-9db3-892f31ba248a',2,'aaaaaaa1-0000-4000-8000-000000000003',0,500,null);
update public.journal_entries set status='REVERSED' where id='f3a8f36e-1971-4f1c-9db3-892f31ba248a';
select capitalised,released,wip_balance from public.project_wip_summary('e74266d2-7047-4f0b-bf87-8d57cb6f5021');
set role authenticated;
do $$
declare
  v_refused boolean := false;
  v_error text := '';
  v_before integer;
  v_after integer;
begin
  select count(distinct l.journal_entry_id) into v_before
  from public.journal_entry_lines l where l.project_id='e74266d2-7047-4f0b-bf87-8d57cb6f5021';
  begin
    perform public.release_project_wip('e74266d2-7047-4f0b-bf87-8d57cb6f5021',1500,'2026-03-11','R6 must not use cancelled debit');
  exception when others then
    v_error := sqlerrm;
    v_refused := sqlerrm like 'PROJECT_RELEASE_EXCEEDS_WIP%';
  end;
  if not v_refused then
    raise exception 'ASSERT_CANCELLED_DEBIT_RELEASE_FAILED: over-posted release was not refused correctly; error=%',v_error;
  end if;
  select count(distinct l.journal_entry_id) into v_after
  from public.journal_entry_lines l where l.project_id='e74266d2-7047-4f0b-bf87-8d57cb6f5021';
  if v_after<>v_before then
    raise exception 'ASSERT_CANCELLED_DEBIT_RELEASE_FAILED: refused release wrote an entry; before=% after=%',v_before,v_after;
  end if;

  perform public.release_project_wip('e74266d2-7047-4f0b-bf87-8d57cb6f5021',600,'2026-03-12','R6 valid posted-only release');
  raise notice 'ASSERT_RELEASE_ATTEMPTS_PASS: over-posted release refused without writing; valid posted-only release executed';
end $$;
reset role;
select capitalised,released,wip_balance from public.project_wip_summary('e74266d2-7047-4f0b-bf87-8d57cb6f5021');
do $$
declare
  s record;
  v_ledger numeric;
begin
  select * into s from public.project_wip_summary('e74266d2-7047-4f0b-bf87-8d57cb6f5021');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger
  from public.journal_entry_lines l
  join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='e74266d2-7047-4f0b-bf87-8d57cb6f5021'
    and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  if s.capitalised<>1000 or s.released<>600 or s.wip_balance<>400 or v_ledger<>400 then
    raise exception 'ASSERT_CANCELLED_DEBIT_RELEASE_FAILED: expected cap=1000 rel=600 wip=400 ledger=400; actual cap=% rel=% wip=% ledger=%',s.capitalised,s.released,s.wip_balance,v_ledger;
  end if;
  raise notice 'ASSERT_CANCELLED_DEBIT_RELEASE_PASS: over-posted release refused without writing; valid release gives cap=1000 rel=600 wip=400 ledger=400';
end $$;
rollback;
