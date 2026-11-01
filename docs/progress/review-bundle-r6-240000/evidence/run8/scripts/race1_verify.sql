\set ON_ERROR_STOP 0
select capitalised,released,wip_balance from public.project_wip_summary('e5a074c8-66c9-4dad-9e4f-953c82a61001');
do $$
declare s record; v_ledger numeric; v_unbalanced integer;
begin
  select * into s from public.project_wip_summary('e5a074c8-66c9-4dad-9e4f-953c82a61001');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger from public.journal_entry_lines l join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='e5a074c8-66c9-4dad-9e4f-953c82a61001' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  select count(*) into v_unbalanced from (select je.id from public.journal_entries je join public.journal_entry_lines l on l.journal_entry_id=je.id
    where exists(select 1 from public.journal_entry_lines p where p.journal_entry_id=je.id and p.project_id='e5a074c8-66c9-4dad-9e4f-953c82a61001')
    group by je.id having sum(l.debit)<>sum(l.credit)) x;
  if s.capitalised<>1000 or s.released<>600 or s.wip_balance<>400 or v_ledger<>400 or v_unbalanced<>0 then
    raise exception 'ASSERT_RACE_ORDER1_FAILED: cap=% rel=% wip=% ledger=% unbalanced=%',s.capitalised,s.released,s.wip_balance,v_ledger,v_unbalanced;
  end if;
  if (select status from public.journal_entries where id='f6b185d9-77da-4ebe-8f5a-a64d93b71101')<>'POSTED' then
    raise exception 'ASSERT_RACE_ORDER1_FAILED: negative capitalisation reversal was not refused';
  end if;
  raise notice 'ASSERT_RACE_ORDER1_PASS: release committed; later reversal refused; cap=1000 rel=600 wip=400 ledger=400 unbalanced=0';
end $$;
