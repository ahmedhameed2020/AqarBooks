-- Make money rounding currency-aware, for Gulf expansion alongside Egypt.
--
-- THE BUG THIS FIXES. compute_service_charge_allocations truncated every unit
-- share to 2 decimals and redistributed the remainder in units of 0.01. That
-- is correct for EGP, SAR, AED and QAR -- and wrong for KWD, BHD and OMR,
-- which are denominated in fils to THREE decimals.
--
-- The failure is not cosmetic. A 1,000.123 KWD levy allocated 1,000.12,
-- leaving a 0.003 gap, and issue_service_charge_levy refuses to bill a split
-- that does not tie -- correctly, since that guard is the whole point. So a
-- Kuwaiti, Bahraini or Omani operator could not issue a service charge at all
-- for any amount carrying fils precision. Verified before and after.
--
-- Storage was never the problem: every money column is numeric(19,4), which
-- holds three decimals fine. Only the rounding assumed two.

-- ISO 4217 minor units for the currencies this product targets, plus the
-- common zero-decimal ones so an unexpected code degrades sensibly rather
-- than silently mis-rounding. Anything unlisted falls back to 2, which is the
-- correct default for the overwhelming majority of currencies.
create or replace function public.currency_decimals(p_currency text)
returns int
language sql
immutable
parallel safe
set search_path = public
as $$
  select case upper(coalesce(p_currency, ''))
    -- Three decimals (fils): Kuwait, Bahrain, Oman, Jordan, Tunisia, Libya, Iraq
    when 'KWD' then 3
    when 'BHD' then 3
    when 'OMR' then 3
    when 'JOD' then 3
    when 'TND' then 3
    when 'LYD' then 3
    when 'IQD' then 3
    -- Zero decimals
    when 'JPY' then 0
    when 'KRW' then 0
    when 'VND' then 0
    -- Two decimals: EGP, SAR, AED, QAR, USD, EUR and the rest
    else 2
  end;
$$;

comment on function public.currency_decimals(text) is
  'ISO 4217 minor-unit exponent. Money rounding must use this rather than assuming 2, or fils-denominated currencies (KWD/BHD/OMR) mis-allocate.';

-- Currency-aware rebuild of the allocation engine. The largest-remainder
-- method is unchanged in substance -- truncate, count the shortfall, hand it
-- to the largest discarded fractions, ties broken by unit code -- but every
-- place that said "2" or "0.01" now derives its precision from the
-- organization's currency.
create or replace function public.compute_service_charge_allocations(
  p_levy_id uuid
)
returns table (
  unit_count int,
  allocated_total numeric,
  levy_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_levy record;
  v_basis_sum numeric;
  v_missing_area int;
  v_decimals int;
  v_step numeric;
  v_shortfall_units int;
begin
  select * into v_levy from public.service_charge_levies where id = p_levy_id;

  if v_levy.id is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.service_charges.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة رسوم الخدمة' using errcode = '42501';
  end if;

  if v_levy.status <> 'DRAFT' then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_DRAFT: لا يمكن إعادة حساب توزيع تحصيلة صادرة' using errcode = 'P0001';
  end if;

  select public.currency_decimals(o.default_currency) into v_decimals
  from public.organizations o where o.id = v_levy.organization_id;
  v_decimals := coalesce(v_decimals, 2);
  v_step := power(10::numeric, -v_decimals);   -- 0.01, or 0.001 for fils

  insert into public.service_charge_allocations (organization_id, levy_id, unit_id, basis_value)
  select v_levy.organization_id, v_levy.id, u.id,
         case v_levy.allocation_basis
           when 'AREA' then coalesce(u.area, 0)
           when 'EQUAL' then 1
           else coalesce(u.area, 0)
         end
  from public.units u
  where u.organization_id = v_levy.organization_id
    and u.property_id = v_levy.property_id
    and u.is_active
  on conflict (levy_id, unit_id) do update
    set basis_value = case v_levy.allocation_basis
                        when 'AREA' then excluded.basis_value
                        when 'EQUAL' then 1
                        else public.service_charge_allocations.basis_value
                      end;

  delete from public.service_charge_allocations a
  where a.levy_id = v_levy.id
    and not exists (
      select 1 from public.units u
      where u.id = a.unit_id and u.is_active and u.property_id = v_levy.property_id
    );

  if v_levy.allocation_basis = 'AREA' then
    select count(*) into v_missing_area
    from public.service_charge_allocations a
    join public.units u on u.id = a.unit_id
    where a.levy_id = v_levy.id and coalesce(u.area, 0) <= 0;

    if v_missing_area > 0 then
      raise exception
        'SERVICE_CHARGE_MISSING_AREA: % وحدة بلا مساحة مسجلة؛ سجّل مساحاتها أو استخدم أساس توزيع آخر', v_missing_area
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(basis_value), 0) into v_basis_sum
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_basis_sum <= 0 then
    raise exception 'SERVICE_CHARGE_ZERO_BASIS: مجموع أساس التوزيع صفر؛ لا يمكن توزيع المبلغ' using errcode = 'P0001';
  end if;

  with computed as (
    select a.id,
           trunc(v_levy.total_amount * a.basis_value / v_basis_sum, v_decimals) as floor_amt
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
  )
  update public.service_charge_allocations a
  set share_amount = c.floor_amt
  from computed c
  where a.id = c.id;

  -- Shortfall counted in the currency's own minor unit, not in piastres.
  select round((v_levy.total_amount - coalesce(sum(share_amount), 0)) / v_step)::int
  into v_shortfall_units
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_shortfall_units > 0 then
    with ranked as (
      select a.id,
             row_number() over (
               order by (v_levy.total_amount * a.basis_value / v_basis_sum) - a.share_amount desc,
                        u.code
             ) as rn
      from public.service_charge_allocations a
      join public.units u on u.id = a.unit_id
      where a.levy_id = v_levy.id
    )
    update public.service_charge_allocations a
    set share_amount = a.share_amount + v_step
    from ranked r
    where a.id = r.id and r.rn <= v_shortfall_units;
  end if;

  return query
  select count(*)::int, coalesce(sum(a.share_amount), 0), v_levy.total_amount
  from public.service_charge_allocations a
  where a.levy_id = v_levy.id;
end;
$$;

-- The issue-time guard had the same assumption baked into its tolerance: half
-- a piastre. On a fils currency that would wave through a genuine 0.004 KWD
-- discrepancy. Tolerance is now half of the currency's own minor unit.
create or replace function public.issue_service_charge_levy(
  p_levy_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_levy record;
  v_allocated numeric;
  v_tolerance numeric;
  v_row record;
  v_due_id uuid;
  v_count int := 0;
begin
  select * into v_levy from public.service_charge_levies where id = p_levy_id for update;

  if v_levy.id is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.service_charges.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار رسوم الخدمة' using errcode = '42501';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.dues.issue') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' using errcode = '42501';
  end if;

  if v_levy.status <> 'DRAFT' then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_DRAFT: التحصيلة صادرة بالفعل' using errcode = 'P0001';
  end if;

  select power(10::numeric, -public.currency_decimals(o.default_currency)) / 2
  into v_tolerance
  from public.organizations o where o.id = v_levy.organization_id;
  v_tolerance := coalesce(v_tolerance, 0.005);

  select coalesce(sum(share_amount), 0) into v_allocated
  from public.service_charge_allocations where levy_id = v_levy.id;

  if abs(v_allocated - v_levy.total_amount) >= v_tolerance then
    raise exception
      'SERVICE_CHARGE_NOT_BALANCED: مجموع الأنصبة (%) لا يساوي إجمالي التحصيلة (%)؛ أعد حساب التوزيع',
      v_allocated, v_levy.total_amount
      using errcode = 'P0001';
  end if;

  for v_row in
    select a.id, a.unit_id, a.share_amount
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
      and a.share_amount > 0
      and a.due_id is null
    order by a.unit_id
  loop
    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, created_by
    ) values (
      v_levy.organization_id, v_levy.property_id, v_row.unit_id,
      v_levy.due_type_id, v_levy.receivable_account_id,
      v_row.share_amount, v_levy.issue_date, v_levy.due_date,
      v_levy.name, 'ISSUED', auth.uid()
    )
    returning id into v_due_id;

    update public.service_charge_allocations
    set due_id = v_due_id where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  update public.service_charge_levies
  set status = 'ISSUED', issued_at = now(), issued_by = auth.uid()
  where id = p_levy_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_levy.organization_id, v_levy.property_id,
    'service_charge_levy.issued', 'service_charge_levy', p_levy_id,
    jsonb_build_object('total_amount', v_levy.total_amount, 'units_billed', v_count,
                       'allocation_basis', v_levy.allocation_basis)
  );

  return v_count;
end;
$$;

-- Same assumption in the bank reconciliation sign-off: a half-piastre
-- tolerance would let a real fils-level discrepancy be signed off as
-- reconciled, which is exactly what that gate exists to prevent.
create or replace function public.finalize_bank_reconciliation(
  p_statement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
  v_difference numeric;
  v_tolerance numeric;
begin
  select organization_id, status into v_org, v_status
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: كشف الحساب معتمد بالفعل' using errcode = 'P0001';
  end if;

  select difference into v_difference
  from public.get_bank_reconciliation_summary(p_statement_id);

  select power(10::numeric, -public.currency_decimals(o.default_currency)) / 2
  into v_tolerance
  from public.organizations o where o.id = v_org;
  v_tolerance := coalesce(v_tolerance, 0.005);

  if abs(v_difference) >= v_tolerance then
    raise exception 'RECONCILIATION_NOT_BALANCED: لا يمكن اعتماد المطابقة والفرق % غير صفري', v_difference
      using errcode = 'P0001';
  end if;

  update public.bank_statements
  set status = 'RECONCILED',
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = p_statement_id;
end;
$$;
