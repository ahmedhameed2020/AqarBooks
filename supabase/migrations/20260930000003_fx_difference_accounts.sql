-- حسابا فرق الصرف، وآلة ترحيل الفرق (المرحلة ٤ب).
--
-- **لماذا حسابان وليس واحدًا، ولماذا لا يختار الكود:**
-- بعض المؤسسات تريد حسابًا واحدًا «فروق عملة» بصافي الحركة، وبعضها يفصل الربح عن
-- الخسارة لأن الفصل مطلوب في عرض القوائم أو في الضريبة. الاثنان صحيحان، والاختيار
-- محاسبي لا هندسي. فالحقلان منفصلان **ويجوز أن يشيرا إلى الحساب نفسه** — من أراد
-- واحدًا ضبطهما على واحد. لم يُفترض شيء نيابةً عن المحاسب.
--
-- والترحيل **يرفض** حتى يُضبطا، على نفس قاعدة جاهزية الفوترة الإلكترونية: نظام
-- يرفض أوضح من نظام يُرحّل الفرق إلى حساب اخترعه لنفسه.

alter table public.organizations
  add column if not exists fx_gain_account_id uuid references public.chart_of_accounts(id),
  add column if not exists fx_loss_account_id uuid references public.chart_of_accounts(id);


-- الربح إيراد والخسارة مصروف. هذا ليس تفضيلًا بل تعريف: الفرق الموجب يزيد حقوق
-- الملكية والسالب ينقصها، فلا يجوز قبول حساب أصل أو التزام لأيٍّ منهما.
create or replace function public.set_fx_difference_accounts(
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
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حسابات فروق الصرف'
      using errcode = '42501';
  end if;

  if p_gain_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_gain_account_id and a.organization_id = p_organization_id
      and a.category = 'REVENUE' and not a.is_group and a.is_active
  ) then
    raise exception
      'FX_GAIN_ACCOUNT_INVALID: حساب ربح فرق العملة يجب أن يكون إيرادًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  if p_loss_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_loss_account_id and a.organization_id = p_organization_id
      and a.category = 'EXPENSE' and not a.is_group and a.is_active
  ) then
    raise exception
      'FX_LOSS_ACCOUNT_INVALID: حساب خسارة فرق العملة يجب أن يكون مصروفًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  select jsonb_build_object('gain', fx_gain_account_id, 'loss', fx_loss_account_id)
  into v_before from public.organizations where id = p_organization_id;

  update public.organizations
  set fx_gain_account_id = p_gain_account_id,
      fx_loss_account_id = p_loss_account_id
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'fx_difference_accounts.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before,
      'to', jsonb_build_object('gain', p_gain_account_id, 'loss', p_loss_account_id))
  );
end;
$$;


-- الجاهزية معلنة لا مستنتجة: الشاشة تسأل قبل أن تعرض زرًّا، والترحيل يسأل قبل
-- أن يبني قيدًا.
create or replace function public.check_fx_readiness(p_organization_id uuid)
returns table (ready boolean, gain_account_id uuid, loss_account_id uuid, reason text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gain uuid;
  v_loss uuid;
begin
  select o.fx_gain_account_id, o.fx_loss_account_id into v_gain, v_loss
  from public.organizations o where o.id = p_organization_id;

  if v_gain is null and v_loss is null then
    return query select false, null::uuid, null::uuid,
      'FX_ACCOUNTS_NOT_SET'::text;
  elsif v_gain is null then
    return query select false, v_gain, v_loss, 'FX_GAIN_ACCOUNT_NOT_SET'::text;
  elsif v_loss is null then
    return query select false, v_gain, v_loss, 'FX_LOSS_ACCOUNT_NOT_SET'::text;
  else
    return query select true, v_gain, v_loss, null::text;
  end if;
end;
$$;


-- ترحيل فرق صرف محقق.
--
-- `p_difference` موجب = ربح، سالب = خسارة، بعملة المؤسسة. الطرف المقابل
-- (`p_counter_account_id`) هو الحساب الذي نشأ عنده الفرق — ذمم المورد مثلًا حين
-- تُسدَّد فاتورة بعملة أجنبية بسعر يختلف عن سعر يوم التسجيل.
--
-- صفر لا يُرحَّل: قيد بصفرين ليس قيدًا، وتركه يمرّ يملأ الدفتر بضجيج يخفي الحركة.
create or replace function public.post_fx_difference(
  p_organization_id uuid,
  p_property_id uuid,
  p_fiscal_period_id uuid,
  p_entry_date date,
  p_difference numeric,
  p_counter_account_id uuid,
  p_description text,
  p_idempotency_key text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_ready boolean;
  v_gain uuid;
  v_loss uuid;
  v_reason text;
  v_scale int;
  v_currency text;
  v_diff numeric;
  v_entry_id uuid;
begin
  select r.ready, r.gain_account_id, r.loss_account_id, r.reason
  into v_ready, v_gain, v_loss, v_reason
  from public.check_fx_readiness(p_organization_id) r;

  if not v_ready then
    raise exception
      '%: عيّن حسابي ربح وخسارة فرق العملة قبل ترحيل أي فرق', v_reason
      using errcode = 'P0001';
  end if;

  select o.default_currency into v_currency from public.organizations o where o.id = p_organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));
  v_diff := round(p_difference, v_scale);

  if v_diff = 0 then
    return null;
  end if;

  if v_diff > 0 then
    -- ربح: ينقص الطرف المقابل مدينًا ويُعترف بالإيراد.
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', p_counter_account_id, 'debit', v_diff, 'credit', 0),
        jsonb_build_object('account_id', v_gain, 'debit', 0, 'credit', v_diff)
      ),
      p_idempotency_key
    );
  else
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_loss, 'debit', -v_diff, 'credit', 0),
        jsonb_build_object('account_id', p_counter_account_id, 'debit', 0, 'credit', -v_diff)
      ),
      p_idempotency_key
    );
  end if;

  perform public.post_journal_entry_internal(v_entry_id);
  return v_entry_id;
end;
$$;

grant execute on function public.set_fx_difference_accounts(uuid, uuid, uuid) to authenticated;
grant execute on function public.check_fx_readiness(uuid) to authenticated;
grant execute on function public.post_fx_difference(uuid, uuid, uuid, date, numeric, uuid, text, text) to authenticated;
