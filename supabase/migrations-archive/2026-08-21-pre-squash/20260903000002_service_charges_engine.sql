-- Service charges, part 2 of 2: allocation and issuance.
--
-- THE ROUNDING PROBLEM, which is the entire reason this is a database
-- function and not a loop in application code.
--
-- Splitting 100,000.00 across 37 units by area gives shares with more than two
-- decimals. Round each one independently and the parts no longer sum to the
-- whole: the operator budgeted 100,000.00 and billed 99,999.97. Three piastres
-- looks like nothing until it recurs every quarter across every property and
-- someone has to explain why the service-charge revenue account never ties to
-- the maintenance budget.
--
-- The fix is the LARGEST REMAINDER method:
--   1. exact_i   = total * weight_i / Σweight
--   2. floor_i   = exact_i truncated to 2 decimals   (always under-allocates)
--   3. shortfall = total - Σfloor_i, in piastres     (a whole number < unit count)
--   4. hand one extra piastre to the `shortfall` units with the largest
--      discarded fractions, ties broken by unit code so the outcome is
--      deterministic and reproducible rather than dependent on scan order.
-- Σshare_i is then exactly total, and the unit that gave up the most in
-- truncation is the one compensated -- the fairest place to put the remainder.

-- Build (or rebuild) a DRAFT levy's allocation rows and compute every share.
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
  v_shortfall_piastres int;
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

  -- Seed a row per active unit. ON CONFLICT preserves operator-entered CUSTOM
  -- weights across a recompute; only the derived bases are refreshed.
  insert into public.service_charge_allocations (organization_id, levy_id, unit_id, basis_value)
  select v_levy.organization_id, v_levy.id, u.id,
         case v_levy.allocation_basis
           when 'AREA' then coalesce(u.area, 0)
           when 'EQUAL' then 1
           else coalesce(u.area, 0)   -- CUSTOM seeds from area, then is edited
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

  -- Drop rows for units that have since been deactivated or removed from the
  -- property, so a recompute reflects the property as it stands now.
  delete from public.service_charge_allocations a
  where a.levy_id = v_levy.id
    and not exists (
      select 1 from public.units u
      where u.id = a.unit_id and u.is_active and u.property_id = v_levy.property_id
    );

  -- Under AREA, a unit with no recorded area is not a zero-share unit -- it is
  -- an unknown. Silently treating it as zero would quietly shift its share
  -- onto every other owner, so refuse and name the count.
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

  -- Step 1-2: exact share, then truncate to piastres.
  with computed as (
    select a.id,
           trunc(v_levy.total_amount * a.basis_value / v_basis_sum, 2) as floor_amt,
           (v_levy.total_amount * a.basis_value / v_basis_sum)
             - trunc(v_levy.total_amount * a.basis_value / v_basis_sum, 2) as remainder,
           u.code as unit_code
    from public.service_charge_allocations a
    join public.units u on u.id = a.unit_id
    where a.levy_id = v_levy.id
  )
  update public.service_charge_allocations a
  set share_amount = c.floor_amt
  from computed c
  where a.id = c.id;

  -- Step 3: how many piastres the truncation left unallocated.
  select round((v_levy.total_amount - coalesce(sum(share_amount), 0)) * 100)::int
  into v_shortfall_piastres
  from public.service_charge_allocations where levy_id = v_levy.id;

  -- Step 4: distribute them, largest discarded fraction first.
  if v_shortfall_piastres > 0 then
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
    set share_amount = a.share_amount + 0.01
    from ranked r
    where a.id = r.id and r.rn <= v_shortfall_piastres;
  end if;

  return query
  select count(*)::int, coalesce(sum(a.share_amount), 0), v_levy.total_amount
  from public.service_charge_allocations a
  where a.levy_id = v_levy.id;
end;
$$;

-- Turn a computed levy into dues. Each due's ledger entry is produced by the
-- trg_dues_post_to_ledger trigger, so service charges accrue exactly like
-- every other receivable with no special-casing here.
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

  -- Refuse to bill a split that does not add up. This is the guarantee the
  -- largest-remainder allocation exists to provide, re-checked at the moment
  -- it actually matters rather than trusted from whenever it was computed.
  select coalesce(sum(share_amount), 0) into v_allocated
  from public.service_charge_allocations where levy_id = v_levy.id;

  if abs(v_allocated - v_levy.total_amount) >= 0.005 then
    raise exception
      'SERVICE_CHARGE_NOT_BALANCED: مجموع الأنصبة (%) لا يساوي إجمالي التحصيلة (%)؛ أعد حساب التوزيع',
      v_allocated, v_levy.total_amount
      using errcode = 'P0001';
  end if;

  for v_row in
    select a.id, a.unit_id, a.share_amount
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
      and a.share_amount > 0      -- a zero weight is a deliberate exclusion
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

-- Allocation detail for the review screen: what each unit will be billed and
-- why, so the split is inspected before it becomes receivables.
create or replace function public.get_service_charge_allocations(
  p_levy_id uuid
)
returns table (
  allocation_id uuid,
  unit_id uuid,
  unit_code text,
  unit_type text,
  basis_value numeric,
  share_amount numeric,
  share_percent numeric,
  due_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_total numeric;
begin
  select organization_id, total_amount into v_org, v_total
  from public.service_charge_levies where id = p_levy_id;

  if v_org is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'finance.service_charges.read')
    or public.has_permission(auth.uid(), v_org, 'finance.service_charges.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على رسوم الخدمة' using errcode = '42501';
  end if;

  return query
  select a.id, u.id, u.code, u.unit_type, a.basis_value, a.share_amount,
         case when v_total > 0 then round(a.share_amount * 100 / v_total, 4) else 0 end,
         a.due_id
  from public.service_charge_allocations a
  join public.units u on u.id = a.unit_id
  where a.levy_id = p_levy_id
  order by u.code;
end;
$$;
