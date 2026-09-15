create table if not exists accsys_stage.member_map (acc_code text primary key, member_id uuid);

create or replace function accsys_stage.materialize()
returns table(step text, n bigint)
language plpgsql security definer set search_path to 'public, accsys_stage' as $fn$
declare v_org uuid; v_prop uuid;
begin
  insert into public.organizations (name, slug, status, default_currency, entity_type, governorate, is_demo)
  select 'اتحاد شاغلين قرية باجوش — ترحيل AccSys (تجريبي)', 'accsys-migration-demo',
         'TRIAL', 'EGP', 'OWNERS_ASSOCIATION', 'مطروح', true
  where not exists (select 1 from public.organizations where slug = 'accsys-migration-demo');
  select id into v_org from public.organizations where slug = 'accsys-migration-demo';
  insert into accsys_stage.ctx values ('org', v_org) on conflict (k) do update set v = excluded.v;

  insert into public.properties (organization_id, name, code, property_type, governorate, timezone)
  select v_org, 'القرية', 'VLG', 'resort', 'مطروح', 'Africa/Cairo'
  where not exists (select 1 from public.properties where organization_id = v_org and code = 'VLG');
  select id into v_prop from public.properties where organization_id = v_org and code = 'VLG';
  insert into accsys_stage.ctx values ('prop', v_prop) on conflict (k) do update set v = excluded.v;
  step := 'organization+property'; n := 1; return next;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category,
                                        normal_balance, is_group, parent_id)
  select v_org, c.code, c.name_ar, c.name_en, cat.v,
         case when cat.v in ('ASSET','EXPENSE') then 'DEBIT' else 'CREDIT' end,
         c.lvl < 4, null
  from accsys_stage.coa c
  cross join lateral (select case
        when c.code in ('1661000','2960001','2970001','2970002','2970003','3190001') then 'EQUITY'
        when left(c.code,1) = '1' then 'ASSET'  when left(c.code,1) = '2' then 'LIABILITY'
        when left(c.code,1) = '3' then 'REVENUE' when left(c.code,1) = '4' then 'EXPENSE'
        else 'EQUITY' end as v) cat
  where not exists (select 1 from public.chart_of_accounts a
                    where a.organization_id = v_org and a.code = c.code);
  update public.chart_of_accounts a set parent_id = p.id
    from accsys_stage.coa c
    join public.chart_of_accounts p on p.organization_id = v_org and p.code = c.parent_code
   where a.organization_id = v_org and a.code = c.code and a.parent_id is null;
  select count(*) into n from public.chart_of_accounts where organization_id = v_org;
  step := 'chart_of_accounts'; return next;

  insert into public.zones (organization_id, property_id, name_ar, name_en)
  select v_org, v_prop, z.name_ar, z.name_en from accsys_stage.zone z
  where not exists (select 1 from public.zones x
                    where x.organization_id = v_org and x.name_ar = z.name_ar);
  insert into public.units (organization_id, property_id, zone_id, code, unit_type)
  select v_org, v_prop, z.id, u.code, u.unit_type
  from accsys_stage.unit u
  left join accsys_stage.zone sz on sz.code = u.zone_code
  left join public.zones z on z.organization_id = v_org and z.name_ar = sz.name_ar
  where not exists (select 1 from public.units x where x.property_id = v_prop and x.code = u.code);
  select count(*) into n from public.units where property_id = v_prop;
  step := 'zones+units'; return next;

  insert into public.members (organization_id, full_name, is_company, customer_type, legal_name)
  select v_org, m.full_name, m.is_company,
         case when m.is_company then 'B2B' else 'B2C' end, m.acc_code
  from accsys_stage.member m
  where not exists (select 1 from public.members x
                    where x.organization_id = v_org and x.legal_name = m.acc_code);
  insert into accsys_stage.member_map (acc_code, member_id)
  select m.acc_code, x.id
  from accsys_stage.member m
  join public.members x on x.organization_id = v_org and x.legal_name = m.acc_code
  on conflict (acc_code) do nothing;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage,
                                      is_primary_contact, start_date)
  select v_org, u.id, mm.member_id, 100,
         row_number() over (partition by u.id order by mm.acc_code) = 1, date '2007-01-01'
  from accsys_stage.member m
  join accsys_stage.member_map mm on mm.acc_code = m.acc_code
  join public.units u on u.property_id = v_prop and u.code = m.unit_code
  where not exists (select 1 from public.unit_ownerships o
                    where o.unit_id = u.id and o.member_id = mm.member_id);
  select count(*) into n from public.members where organization_id = v_org;
  step := 'members+ownerships'; return next;

  insert into public.fiscal_years (organization_id, name, start_date, end_date, status)
  select v_org, f.name, f.start_date, f.end_date, f.status from accsys_stage.fy f
  where not exists (select 1 from public.fiscal_years y
                    where y.organization_id = v_org and y.name = f.name);
  insert into public.fiscal_periods (organization_id, fiscal_year_id, period_number, name,
                                     start_date, end_date, status)
  select v_org, y.id, mm, y.name || '-' || lpad(mm::text, 2, '0'),
         make_date(y.name::int, mm, 1),
         (make_date(y.name::int, mm, 1) + interval '1 month - 1 day')::date, y.status
  from public.fiscal_years y cross join generate_series(1, 12) mm
  where y.organization_id = v_org
    and not exists (select 1 from public.fiscal_periods p
                    where p.fiscal_year_id = y.id and p.period_number = mm);
  select count(*) into n from public.fiscal_periods where organization_id = v_org;
  step := 'fiscal_periods'; return next;

  insert into public.journal_entries (organization_id, property_id, fiscal_period_id, entry_number,
                                      entry_date, description, source_type, status,
                                      idempotency_key, posted_at)
  select v_org, v_prop, p.id, e.seq, d.dt, e.descr,
         case e.src when 'R' then 'RECEIPT_VOUCHER' when 'P' then 'PAYMENT_VOUCHER'
                    else 'JOURNAL_VOUCHER' end,
         'POSTED', 'accsys:' || e.seq, now()
  from accsys_stage.je e
  cross join lateral (select to_date(e.edate, 'YYYYMMDD') as dt) d
  join public.fiscal_periods p on p.organization_id = v_org
                              and d.dt between p.start_date and p.end_date
  where not exists (select 1 from public.journal_entries j
                    where j.organization_id = v_org and j.idempotency_key = 'accsys:' || e.seq);
  select count(*) into n from public.journal_entries where organization_id = v_org;
  step := 'journal_entries'; return next;

  insert into public.journal_entry_lines (journal_entry_id, line_number, account_id, debit, credit)
  select j.id, row_number() over (partition by l.seq order by l.ctid),
         a.id, greatest(l.amt, 0), greatest(-l.amt, 0)
  from accsys_stage.jel l
  join public.journal_entries j on j.organization_id = v_org
                               and j.idempotency_key = 'accsys:' || l.seq
  join public.chart_of_accounts a on a.organization_id = v_org and a.code = l.acc_code
  where not exists (select 1 from public.journal_entry_lines x where x.journal_entry_id = j.id);
  select count(*) into n from public.journal_entry_lines x
    join public.journal_entries j on j.id = x.journal_entry_id where j.organization_id = v_org;
  step := 'journal_entry_lines'; return next;

  update public.chart_of_accounts a set is_used = true
   where a.organization_id = v_org and not a.is_used
     and exists (select 1 from public.journal_entry_lines l where l.account_id = a.id);
  get diagnostics n = row_count; step := 'coa_marked_used'; return next;
  return;
end $fn$;;
