\set ON_ERROR_STOP 0
select capitalised,released,wip_balance from public.project_wip_summary('e5a074c8-66c9-4dad-9e4f-953c82a61002');
do $$
declare s record; v_ledger numeric; v_unbalanced integer;
begin
  select * into s from public.project_wip_summary('e5a074c8-66c9-4dad-9e4f-953c82a61002');
  select coalesce(sum(l.debit-l.credit),0) into v_ledger from public.journal_entry_lines l join public.journal_entries je on je.id=l.journal_entry_id
  where l.project_id='e5a074c8-66c9-4dad-9e4f-953c82a61002' and l.account_id='aaaaaaa1-0000-4000-8000-000000000001'
    and (je.status='POSTED' or (je.status='REVERSED' and exists(select 1 from public.journal_entries r where r.reversed_entry_id=je.id)));
  select count(*) into v_unbalanced from (select je.id from public.journal_entries je join public.journal_entry_lines l on l.journal_entry_id=je.id
    where exists(select 1 from public.journal_entry_lines p where p.journal_entry_id=je.id and p.project_id='e5a074c8-66c9-4dad-9e4f-953c82a61002')
    group by je.id having sum(l.debit)<>sum(l.credit)) x;
  if s.capitalised<>0 or s.released<>0 or s.wip_balance<>0 or v_ledger<>0 or v_unbalanced<>0 then
    raise exception 'ASSERT_RACE_ORDER2_FAILED: cap=% rel=% wip=% ledger=% unbalanced=%',s.capitalised,s.released,s.wip_balance,v_ledger,v_unbalanced;
  end if;
  if (select status from public.journal_entries where id='f6b185d9-77da-4ebe-8f5a-a64d93b71102')<>'REVERSED' then
    raise exception 'ASSERT_RACE_ORDER2_FAILED: first reversal did not commit';
  end if;
  if exists(select 1 from public.journal_entries where description like '%R8 order 2 release waits') then
    raise exception 'ASSERT_RACE_ORDER2_FAILED: release after reversal wrote an entry';
  end if;
  raise notice 'ASSERT_RACE_ORDER2_PASS: reversal committed; later release refused without writing; cap=0 rel=0 wip=0 ledger=0 unbalanced=0';
end $$;
