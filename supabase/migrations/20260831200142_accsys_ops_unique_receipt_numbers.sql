create or replace function accsys_stage.materialize_operations()
returns table(step text, n bigint)
language plpgsql security definer set search_path to 'public, accsys_stage' as $fn$
declare v_org uuid; v_prop uuid; v_base bigint;
begin
  select v into v_org from accsys_stage.ctx where k = 'org';
  select v into v_prop from accsys_stage.ctx where k = 'prop';
  if v_org is null then raise exception 'run materialize() first'; end if;

  alter table public.dues disable trigger trg_dues_post_to_ledger;
  alter table public.dues disable trigger trg_dues_01_tax_decision;

  create temp table _line on commit drop as
  select j.id je_id, j.entry_date, j.source_type, j.entry_number,
         l.debit, l.credit, a.code, a.id account_id, a.category
  from public.journal_entries j
  join public.journal_entry_lines l on l.journal_entry_id = j.id
  join public.chart_of_accounts a on a.id = l.account_id
  where j.organization_id = v_org;
  create index on _line(je_id);

  create temp table _rev on commit drop as
  select distinct on (je_id) je_id, account_id rev_account
  from _line where category = 'REVENUE' and credit > 0
  order by je_id, credit desc;

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  select distinct v_org, a.name_ar, a.name_en, a.id
  from _rev r join public.chart_of_accounts a on a.id = r.rev_account
  where not exists (select 1 from public.due_types d
                    where d.organization_id = v_org and d.default_revenue_account_id = a.id);
  select count(*) into n from public.due_types where organization_id = v_org;
  step := 'due_types'; return next;

  insert into public.dues (organization_id, property_id, unit_id, due_type_id, receivable_account_id,
                           amount, issue_date, due_date, description, status, journal_entry_id,
                           source_type, source_id)
  select v_org, v_prop, u.id, dt.id, l.account_id, l.debit, l.entry_date, l.entry_date,
         'AccSys — قيد رقم ' || l.entry_number, 'ISSUED', l.je_id, 'ACCSYS_MIGRATION', l.je_id
  from _line l
  join _rev r on r.je_id = l.je_id
  join public.due_types dt on dt.organization_id = v_org and dt.default_revenue_account_id = r.rev_account
  join accsys_stage.member m on m.acc_code = l.code
  join public.units u on u.property_id = v_prop and u.code = m.unit_code
  where l.debit > 0 and l.code like '14%'
    and not exists (select 1 from public.dues d
                    where d.journal_entry_id = l.je_id and d.receivable_account_id = l.account_id
                      and d.amount = l.debit);
  select count(*) into n from public.dues where organization_id = v_org;
  step := 'dues'; return next;

  -- receipt_number is unique per organization, but one voucher can settle several units,
  -- so the voucher number goes in receipt_no/memo and the number itself is a fresh sequence
  select coalesce(max(receipt_number), 0) into v_base from public.payments where organization_id = v_org;
  insert into public.payments (organization_id, property_id, member_id, unit_id, amount, method,
                               payment_date, receipt_number, deposit_account_id, journal_entry_id,
                               status, memo, unallocated_amount, receipt_no)
  select v_org, v_prop, s.member_id, s.unit_id, s.credit, s.method, s.entry_date,
         v_base + row_number() over (order by s.entry_date, s.entry_number, s.account_id),
         s.dep_account, s.je_id, 'POSTED', 'AccSys — سند قبض ' || s.entry_number,
         s.credit, s.entry_number::text
  from (
    select l.je_id, l.entry_date, l.entry_number, l.credit, l.account_id,
           mm.member_id, u.id unit_id, dep.account_id dep_account,
           case when dep.code like '151%' or dep.code like '152%' or dep.code like '153%'
                then 'BANK_TRANSFER' else 'CASH' end as method
    from _line l
    join accsys_stage.member m on m.acc_code = l.code
    join accsys_stage.member_map mm on mm.acc_code = m.acc_code
    join public.units u on u.property_id = v_prop and u.code = m.unit_code
    join lateral (select account_id, code from _line d2
                   where d2.je_id = l.je_id and d2.debit > 0 and d2.code like '15%'
                   order by d2.debit desc limit 1) dep on true
    where l.credit > 0 and l.code like '14%' and l.source_type = 'RECEIPT_VOUCHER'
      and not exists (select 1 from public.payments p
                      where p.journal_entry_id = l.je_id and p.member_id = mm.member_id
                        and p.amount = l.credit)) s;
  select count(*) into n from public.payments where organization_id = v_org;
  step := 'payments'; return next;

  with d as (
    select d.id, d.receivable_account_id acc, d.amount,
           sum(d.amount) over (partition by d.receivable_account_id
                               order by d.issue_date, d.id) - d.amount as lo,
           sum(d.amount) over (partition by d.receivable_account_id
                               order by d.issue_date, d.id) as hi
    from public.dues d where d.organization_id = v_org),
  p as (
    select p.id, a.id acc, p.amount,
           sum(p.amount) over (partition by a.id order by p.payment_date, p.id) - p.amount as lo,
           sum(p.amount) over (partition by a.id order by p.payment_date, p.id) as hi
    from public.payments p
    join accsys_stage.member_map mm on mm.member_id = p.member_id
    join public.chart_of_accounts a on a.organization_id = v_org and a.code = mm.acc_code
    where p.organization_id = v_org)
  insert into public.payment_allocations (payment_id, due_id, amount)
  select p.id, d.id, round(least(p.hi, d.hi) - greatest(p.lo, d.lo), 2)
  from p join d on d.acc = p.acc and least(p.hi, d.hi) - greatest(p.lo, d.lo) > 0.005
  where not exists (select 1 from public.payment_allocations x
                    where x.payment_id = p.id and x.due_id = d.id);
  select count(*) into n from public.payment_allocations x
    join public.payments p on p.id = x.payment_id where p.organization_id = v_org;
  step := 'payment_allocations'; return next;

  update public.dues d set status = case
      when coalesce(al.paid, 0) >= d.amount - 0.005 then 'PAID'
      when coalesce(al.paid, 0) > 0.005 then 'PARTIALLY_PAID' else 'ISSUED' end
   from (select due_id, sum(amount) paid from public.payment_allocations group by due_id) al
  where d.organization_id = v_org and d.id = al.due_id;
  get diagnostics n = row_count; step := 'dues_status'; return next;

  update public.payments p set unallocated_amount = greatest(p.amount - coalesce(al.a, 0), 0)
   from (select payment_id, sum(amount) a from public.payment_allocations group by payment_id) al
  where p.organization_id = v_org and p.id = al.payment_id;
  get diagnostics n = row_count; step := 'payments_unallocated'; return next;

  alter table public.dues enable trigger trg_dues_post_to_ledger;
  alter table public.dues enable trigger trg_dues_01_tax_decision;
  return;
end $fn$;;
