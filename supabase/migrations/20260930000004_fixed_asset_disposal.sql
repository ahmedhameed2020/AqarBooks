-- استبعاد الأصول الثابتة (المرحلة ٤أ — إكمال).
--
-- الاستبعاد ليس حذفًا. الأصل يخرج من الدفاتر **بقيمته الأصلية**، ومجمع إهلاكه
-- يُقفل معه، ويدخل ما قُبض، والفرق ربح أو خسارة. حذف الصف كان سيُخفي تكلفة
-- تاريخية وإهلاكًا مُرحَّلًا، ويترك ميزان المراجعة غير متوازن.
--
-- حسابا الربح والخسارة قابلان للضبط ويجوز أن يشيرا إلى الحساب نفسه — نفس قاعدة
-- فروق الصرف، ولنفس السبب: الفصل أو الدمج قرار محاسبي لا هندسي. والترحيل يرفض
-- حتى يُضبطا.
--
-- تنبيه مقصود لم أُخفِه في الكود: الدالة تُقفل **مجمع الإهلاك المُرحَّل فعلًا**.
-- فإن كانت هناك فترات لم يُرحَّل إهلاكها بعد، فالقيمة الدفترية عند الاستبعاد
-- أعلى من الحقيقية والفرق يظهر خسارة أكبر. تشغيل الإهلاك حتى تاريخ الاستبعاد
-- قبل الاستبعاد قرار تشغيلي، ولذلك تُعيد `list_fixed_assets` عدد الأقساط
-- المُرحَّلة مقابل العمر حتى يراه المشغّل قبل أن يقرر.

alter table public.organizations
  add column if not exists asset_disposal_gain_account_id uuid references public.chart_of_accounts(id),
  add column if not exists asset_disposal_loss_account_id uuid references public.chart_of_accounts(id);


create or replace function public.set_asset_disposal_accounts(
  p_organization_id uuid,
  p_gain_account_id uuid,
  p_loss_account_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حسابات استبعاد الأصول'
      using errcode = '42501';
  end if;

  if p_gain_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_gain_account_id and a.organization_id = p_organization_id
      and a.category = 'REVENUE' and not a.is_group and a.is_active
  ) then
    raise exception
      'DISPOSAL_GAIN_ACCOUNT_INVALID: حساب أرباح الاستبعاد يجب أن يكون إيرادًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  if p_loss_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_loss_account_id and a.organization_id = p_organization_id
      and a.category = 'EXPENSE' and not a.is_group and a.is_active
  ) then
    raise exception
      'DISPOSAL_LOSS_ACCOUNT_INVALID: حساب خسائر الاستبعاد يجب أن يكون مصروفًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  select jsonb_build_object('gain', asset_disposal_gain_account_id,
                            'loss', asset_disposal_loss_account_id)
  into v_before from public.organizations where id = p_organization_id;

  update public.organizations
  set asset_disposal_gain_account_id = p_gain_account_id,
      asset_disposal_loss_account_id = p_loss_account_id
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'asset_disposal_accounts.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before,
      'to', jsonb_build_object('gain', p_gain_account_id, 'loss', p_loss_account_id))
  );
end;
$$;


create or replace function public.check_asset_disposal_readiness(p_organization_id uuid)
returns table (ready boolean, gain_account_id uuid, loss_account_id uuid, reason text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gain uuid;
  v_loss uuid;
begin
  select o.asset_disposal_gain_account_id, o.asset_disposal_loss_account_id
  into v_gain, v_loss
  from public.organizations o where o.id = p_organization_id;

  if v_gain is null and v_loss is null then
    return query select false, null::uuid, null::uuid, 'DISPOSAL_ACCOUNTS_NOT_SET'::text;
  elsif v_gain is null then
    return query select false, v_gain, v_loss, 'DISPOSAL_GAIN_ACCOUNT_NOT_SET'::text;
  elsif v_loss is null then
    return query select false, v_gain, v_loss, 'DISPOSAL_LOSS_ACCOUNT_NOT_SET'::text;
  else
    return query select true, v_gain, v_loss, null::text;
  end if;
end;
$$;


-- استبعاد أصل.
--
-- القيد:
--   مدين  مجمع الإهلاك        (بما رُحِّل فعلًا)
--   مدين  حساب المتحصلات      (ما قُبض، وقد يكون صفرًا في الخردة)
--   دائن  حساب الأصل          (التكلفة الأصلية كاملة)
--   والفرق: دائن أرباح استبعاد، أو مدين خسائر استبعاد.
--
-- ويتوازن بالبناء: الربح = المتحصلات − (التكلفة − المجمع)، فيصير
--   المجمع + المتحصلات = التكلفة + الربح
-- متطابقًا جبريًا لا تقريبًا.
create or replace function public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_proceeds numeric,
  p_proceeds_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
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
begin
  select * into v_asset from public.fixed_assets where id = p_asset_id;
  if not found then
    raise exception 'FIXED_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_asset.organization_id, 'finance.assets.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باستبعاد الأصول'
      using errcode = '42501';
  end if;

  -- الاستبعاد حدث لا حالة: أصل مستبعَد لا يُستبعَد ثانية.
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
$$;

grant execute on function public.set_asset_disposal_accounts(uuid, uuid, uuid) to authenticated;
grant execute on function public.check_asset_disposal_readiness(uuid) to authenticated;
grant execute on function public.dispose_fixed_asset(uuid, date, numeric, uuid, text) to authenticated;
