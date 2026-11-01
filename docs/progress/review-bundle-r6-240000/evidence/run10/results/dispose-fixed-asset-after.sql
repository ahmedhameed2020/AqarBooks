Output format is unaligned.
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_disposal_date date, p_proceeds numeric, p_proceeds_account_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_asset public.fixed_assets;
  v_ready boolean;
  v_gain uuid;
  v_loss uuid;
  v_reason text;
  v_period public.fiscal_periods;
  v_accumulated numeric;
  v_nbv numeric;
  v_result numeric;
  v_scale int;
  v_currency text;
  v_lines jsonb;
  v_entry_id uuid;
  v_proceeds_account_id uuid;
begin
  select * into v_asset from public.fixed_assets where id = p_asset_id;
  if not found then
    raise exception 'FIXED_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_asset.organization_id, 'finance.assets.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باستبعاد الأصول'
      using errcode = '42501';
  end if;

  if v_asset.status = 'DISPOSED' then
    raise exception 'ASSET_ALREADY_DISPOSED: الأصل (%) مستبعَد بالفعل بتاريخ %',
      v_asset.code, v_asset.disposal_date
      using errcode = 'P0001';
  end if;

  if p_proceeds < 0 then
    raise exception 'DISPOSAL_PROCEEDS_NEGATIVE: المتحصلات لا تكون سالبة'
      using errcode = '22023';
  end if;

  if p_disposal_date < v_asset.acquisition_date then
    raise exception
      'DISPOSAL_BEFORE_ACQUISITION: تاريخ الاستبعاد (%) قبل تاريخ الاقتناء (%)',
      p_disposal_date, v_asset.acquisition_date
      using errcode = '22023';
  end if;

  select r.ready, r.gain_account_id, r.loss_account_id, r.reason
  into v_ready, v_gain, v_loss, v_reason
  from public.check_asset_disposal_readiness(v_asset.organization_id) r;

  if not v_ready then
    raise exception '%: عيّن حسابي أرباح وخسائر الاستبعاد قبل استبعاد أي أصل', v_reason
      using errcode = 'P0001';
  end if;

  if p_proceeds > 0 then
    select a.id into v_proceeds_account_id
    from public.chart_of_accounts a
    where a.id = p_proceeds_account_id
      and a.organization_id = v_asset.organization_id
      and a.category = 'ASSET'
      and a.is_active
      and not a.is_group
      and a.is_cash_equivalent
      and not a.requires_cost_center
      and a.id <> v_asset.asset_account_id
      and a.id <> v_asset.accumulated_depreciation_account_id;

    if not found then
      raise exception 'DISPOSAL_PROCEEDS_ACCOUNT_INVALID: حساب الحصيلة يجب أن يكون نقدية أو بنكًا نشطًا داخل المؤسسة، ولا يجوز أن يكون حساب الأصل أو مجمع إهلاكه أو حسابًا يطلب مركز تكلفة'
        using errcode = '22023';
    end if;
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_asset.organization_id
    and fp.status = 'OPEN'
    and p_disposal_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_period.id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ الاستبعاد (%)', p_disposal_date
      using errcode = 'P0001';
  end if;

  select coalesce(sum(d.amount), 0) into v_accumulated
  from public.fixed_asset_depreciation d where d.fixed_asset_id = p_asset_id;

  select o.default_currency into v_currency
  from public.organizations o where o.id = v_asset.organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));

  v_nbv := round(v_asset.acquisition_cost - v_accumulated, v_scale);
  v_result := round(p_proceeds - v_nbv, v_scale);

  v_lines := jsonb_build_array();
  if v_accumulated > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id,
                         'debit', v_accumulated, 'credit', 0));
  end if;
  if p_proceeds > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', p_proceeds_account_id,
                         'debit', p_proceeds, 'credit', 0));
  end if;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_id', v_asset.asset_account_id,
                       'debit', 0, 'credit', v_asset.acquisition_cost));

  if v_result > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_gain, 'debit', 0, 'credit', v_result));
  elsif v_result < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_loss, 'debit', -v_result, 'credit', 0));
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_asset.organization_id,
    v_asset.property_id,
    v_period.id,
    p_disposal_date,
    'Disposal — ' || v_asset.code || ' ' || v_asset.name_en
      || coalesce(' — ' || p_reason, ''),
    'JOURNAL_VOUCHER',
    v_lines,
    'asset_disposal:' || p_asset_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.fixed_assets
  set status = 'DISPOSED',
      disposal_date = p_disposal_date,
      disposal_proceeds = p_proceeds
  where id = p_asset_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_asset.organization_id, 'fixed_asset.disposed', 'fixed_asset', p_asset_id,
    jsonb_build_object('code', v_asset.code, 'cost', v_asset.acquisition_cost,
      'accumulated', v_accumulated, 'net_book_value', v_nbv,
      'proceeds', p_proceeds, 'result', v_result, 'journal_entry_id', v_entry_id)
  );

  return v_entry_id;
end;
$function$

