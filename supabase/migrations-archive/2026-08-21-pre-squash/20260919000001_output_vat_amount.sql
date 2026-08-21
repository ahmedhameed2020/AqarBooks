-- مبلغ ضريبة المخرجات — أول بند في مراجعة الاكتمال.
--
-- مرحلة التصنيف بنت **الحُكم** ولم تبنِ **المبلغ**: القرار الضريبي يقول «خاضع
-- 14%» ولا يوجد في النظام حقل واحد يحمل ضريبة مخرجات. هذا الملف يبني المبلغ.
--
-- ═══ السؤال الذي لم أُخمّنه ═══
--
-- هل `dues.amount` صافٍ تُضاف الضريبة فوقه، أم شامل تُستخرج منه؟ الفرق ليس
-- تفصيلًا حسابيًا: في الحالة الأولى **يرتفع ما يدين به العميل**، وفي الثانية
-- **ينخفض الإيراد المعترف به**. وأي افتراض هنا يغيّر مالًا حقيقيًا.
--
-- ولا يوجد جواب واحد صحيح لكل المستأجرين: بعضهم يسجّل أسعارًا شاملة وبعضهم
-- صافية، وقد يختلف ذلك بين نوعَي مستحق في المؤسسة نفسها. فالأساس **إقرار صريح
-- لكل نوع مستحق** يمر بمسار المراجعة القائم نفسه — لا افتراض ولا إعداد عام.
--
-- ولهذا لا تُلمس `dues`: المبلغ المسجَّل يبقى كما هو، وما يُضاف هو **تفسيره**.
--
-- ═══ ما لم يُفعل هنا عمدًا ═══
--
-- **الترحيل المحاسبي لضريبة المخرجات.** المبلغ يُحسب ويُختم ويُدقَّق، ولا يُرحَّل
-- إلى الدفتر بعد. سببه أن الترحيل يحتاج حساب ضريبة مخرجات لكل مؤسسة، ويغيّر
-- شكل القيد نفسه (مدين ذمم بالإجمالي / دائن إيراد بالصافي / دائن الضريبة).
-- وهذا قرار محاسبي بحسابه، لا امتداد لهذا التغيير.
--
-- **وأثره الواجب إعلانه:** حتى يتم ذلك، المستحق ذو الأساس `GROSS` يُرحَّل إلى
-- الإيراد **بكامل مبلغه** بينما القرار يقول إن جزءًا منه ضريبة. الرقم صحيح في
-- القرار وغير مُرحَّل في الدفتر — وهو نقص معلن لا خطأ صامت.

alter table public.due_type_revenue_natures
  add column if not exists amount_basis text
    check (amount_basis is null or amount_basis in ('NET', 'GROSS'));

comment on column public.due_type_revenue_natures.amount_basis is
  'هل مبلغ المستحق صافٍ تُضاف الضريبة فوقه (NET) أم شامل تُستخرج منه (GROSS)؟ إلزامي للمعالجة الخاضعة، ولا يُخمَّن.';

alter table public.tax_decisions
  add column if not exists amount_basis text
    check (amount_basis is null or amount_basis in ('NET', 'GROSS')),
  add column if not exists taxable_base numeric(19,4),
  add column if not exists vat_amount numeric(19,4),
  add column if not exists gross_amount numeric(19,4);

-- الهوية المحاسبية مفروضة في القاعدة لا محسوبة في التطبيق: التقريب المزدوج
-- (تقريب الأساس ثم تقريب الضريبة) يفتح فرقًا لا يظهر إلا في التجميع.
alter table public.tax_decisions drop constraint if exists tax_decision_amounts_consistent;
alter table public.tax_decisions
  add constraint tax_decision_amounts_consistent check (
    (taxable_base is null and vat_amount is null and gross_amount is null)
    or (taxable_base is not null and vat_amount is not null and gross_amount is not null
        and vat_amount >= 0
        and gross_amount = taxable_base + vat_amount)
  );

create or replace function public.set_due_type_revenue_nature(
  p_due_type_id uuid,
  p_revenue_nature text,
  p_notes text default null,
  p_amount_basis text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
  v_before record;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بربط أنواع المستحقات'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.revenue_natures where code = p_revenue_nature) then
    raise exception 'REVENUE_NATURE_UNKNOWN: طبيعة إيراد غير معروفة (%)', p_revenue_nature
      using errcode = '22023';
  end if;

  if p_amount_basis is not null and p_amount_basis not in ('NET', 'GROSS') then
    raise exception 'TAX_AMOUNT_BASIS_INVALID: أساس المبلغ إما NET أو GROSS' using errcode = '22023';
  end if;

  select revenue_nature, status into v_before
  from public.due_type_revenue_natures
  where organization_id = v_org and due_type_id = p_due_type_id;

  insert into public.due_type_revenue_natures (
    organization_id, due_type_id, revenue_nature, status, notes, amount_basis, created_by
  ) values (
    v_org, p_due_type_id, p_revenue_nature, 'REVIEW_REQUIRED', p_notes, p_amount_basis, auth.uid()
  )
  on conflict (organization_id, due_type_id) do update
  set revenue_nature = excluded.revenue_nature,
      notes          = excluded.notes,
      -- تغيير الأساس يغيّر المبلغ المستحق فعليًا، فيُلغي الاعتماد كما يفعل تغيير
      -- الطبيعة تمامًا. إبقاؤه معتمدًا يجعل تغييرًا ماليًا يمر بلا مراجعة.
      amount_basis   = excluded.amount_basis,
      status         = 'REVIEW_REQUIRED',
      approved_by    = null,
      approved_at    = null,
      updated_at     = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'tax_mapping.set', 'due_type_revenue_nature', v_id,
    jsonb_build_object(
      'due_type_id',         p_due_type_id,
      'revenue_nature_from', v_before.revenue_nature,
      'revenue_nature_to',   p_revenue_nature,
      'amount_basis',        p_amount_basis,
      'status_from',         v_before.status,
      'status_to',           'REVIEW_REQUIRED',
      'approval_revoked',    coalesce(v_before.status = 'APPROVED', false)
    )
  );

  return v_id;
end;
$$;

-- التوقيع الثلاثي يُحذف: بقاؤه يسمح بربط بلا أساس عبر مسار لا يعرف بوجوده.
drop function if exists public.set_due_type_revenue_nature(uuid, text, text);

-- الجاهزية تكشف غياب الأساس قبل التفعيل. بدونه يمر التفعيل ثم ينهار أول إصدار
-- مستحق خاضع — القنبلة الموقوتة نفسها التي فُرض من أجلها اشتراط ربط كل نوع نشط.
create or replace function public.check_tax_enforcement_readiness(p_organization_id uuid)
returns table (gap_code text, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org record;
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بفحص جاهزية الإنفاذ الضريبي'
      using errcode = '42501';
  end if;

  select o.tax_id, o.tax_jurisdiction into v_org
  from public.organizations o where o.id = p_organization_id;

  if nullif(btrim(coalesce(v_org.tax_jurisdiction, '')), '') is null then
    return query select 'JURISDICTION_MISSING'::text,
      'لم يُسجَّل الاختصاص الضريبي للمؤسسة'::text;
  end if;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    return query select 'TAX_IDENTITY_MISSING'::text,
      'لم يُسجَّل الرقم الضريبي للمؤسسة'::text;
  end if;

  return query
  select 'MAPPING_MISSING'::text,
         ('نوع مستحق نشط بلا ربط معتمد: ' || dt.name_ar)::text
  from public.due_types dt
  left join public.due_type_revenue_natures m
    on m.due_type_id = dt.id and m.organization_id = dt.organization_id
  where dt.organization_id = p_organization_id
    and dt.is_active
    and (m.id is null or m.status <> 'APPROVED');

  return query
  select 'RULE_MISSING'::text,
         ('لا قاعدة سارية اليوم لطبيعة: ' || m.revenue_nature)::text
  from (
    select distinct m2.revenue_nature
    from public.due_type_revenue_natures m2
    join public.due_types dt2 on dt2.id = m2.due_type_id and dt2.is_active
    where m2.organization_id = p_organization_id and m2.status = 'APPROVED'
  ) m
  where not exists (
    select 1 from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
    where r.id is not null and r.tax_treatment <> 'REVIEW_REQUIRED'
  );

  return query
  select 'AMOUNT_BASIS_MISSING'::text,
         ('لم يُحدَّد هل المبلغ صافٍ أم شامل للضريبة لنوع مستحق خاضع: ' || dt.name_ar)::text
  from public.due_type_revenue_natures m
  join public.due_types dt
    on dt.id = m.due_type_id and dt.organization_id = m.organization_id and dt.is_active
  where m.organization_id = p_organization_id
    and m.status = 'APPROVED'
    and m.amount_basis is null
    and exists (
      select 1
      from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
      where r.tax_treatment = 'TAXABLE'
    );
end;
$$;

-- الحساب. ثلاثة تفاصيل تُخطئ صامتةً لو تُركت للتطبيق:
--
--   ١. الاستخراج من مبلغ شامل قسمةٌ على (100 + النسبة) لا ضربٌ في النسبة.
--      الخطأ الشائع يعطي 172.5 بدل 150 على 1150 بنسبة 15%.
--   ٢. تُحسب الضريبة أولًا ثم يُشتق الطرف الآخر منها طرحًا أو جمعًا، فيتطابق
--      المجموع مع الإجمالي حتمًا بدل أن يعتمد على حظ التقريب.
--   ٣. التقريب بخانات العملة عبر `currency_decimals` — الدينار الكويتي ثلاث
--      خانات، وافتراض خانتين يبتلع فلوسًا في كل سطر.
create or replace function public.record_tax_decision_for_due_internal(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_jurisdiction text;
  v_currency text;
  v_decimals integer;
  v_map record;
  v_rule public.tax_rule_versions;
  v_active record;
  v_previous_id uuid;
  v_id uuid;
  v_base numeric(19,4);
  v_vat numeric(19,4);
  v_gross numeric(19,4);
  v_basis text;
begin
  select d.id, d.organization_id, d.due_type_id, d.issue_date, d.status, d.amount
  into v_due
  from public.dues d where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if v_due.status = 'VOID' then
    raise exception 'DUE_VOID: لا يُسجَّل قرار ضريبي لمستحق ملغى' using errcode = 'P0001';
  end if;

  if v_due.due_type_id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: المستحق بلا نوع، فلا سبيل إلى طبيعة إيراد' using errcode = 'P0001';
  end if;

  select nullif(btrim(tax_jurisdiction), ''), default_currency
  into v_jurisdiction, v_currency
  from public.organizations where id = v_due.organization_id;

  if v_jurisdiction is null then
    raise exception
      'TAX_JURISDICTION_MISSING: لم يُسجَّل الاختصاص الضريبي للمؤسسة؛ سجّله قبل أي قرار ضريبي'
      using errcode = 'P0001';
  end if;

  select * into v_map
  from public.due_type_revenue_natures
  where organization_id = v_due.organization_id and due_type_id = v_due.due_type_id;

  if v_map.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: نوع المستحق غير مربوط بطبيعة إيراد؛ الربط الصريح مطلوب قبل الترحيل'
      using errcode = 'P0001';
  end if;
  if v_map.status <> 'APPROVED' then
    raise exception 'TAX_REVIEW_REQUIRED: ربط نوع المستحق لم يُعتمد بعد' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_jurisdiction), hashtext(v_map.revenue_nature));

  select td.* into v_active
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;

  if v_active.id is not null then
    return v_active.id;
  end if;

  select td.id into v_previous_id
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions s where s.replaces_decision_id = td.id)
  order by td.decided_at desc limit 1;

  select * into v_rule
  from public.resolve_tax_rule(v_jurisdiction, v_map.revenue_nature, v_due.issue_date);

  if v_rule.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: لا توجد قاعدة ضريبية معتمدة لـ(%) في (%) بتاريخ %',
      v_map.revenue_nature, v_jurisdiction, v_due.issue_date
      using errcode = 'P0001';
  end if;

  if v_rule.tax_treatment = 'REVIEW_REQUIRED' then
    raise exception
      'TAX_REVIEW_REQUIRED: المعالجة الضريبية لـ(%) ما تزال قيد المراجعة', v_map.revenue_nature
      using errcode = 'P0001';
  end if;

  v_decimals := public.currency_decimals(coalesce(v_currency, 'EGP'));

  if v_rule.tax_treatment = 'TAXABLE' then
    if v_map.amount_basis is null then
      raise exception
        'TAX_AMOUNT_BASIS_REQUIRED: المعالجة خاضعة (%) ولم يُحدَّد هل مبلغ نوع المستحق صافٍ أم شامل للضريبة',
        v_map.revenue_nature
        using errcode = 'P0001';
    end if;
    v_basis := v_map.amount_basis;

    if v_basis = 'NET' then
      v_base  := round(v_due.amount, v_decimals);
      v_vat   := round(v_base * v_rule.vat_rate / 100, v_decimals);
      v_gross := v_base + v_vat;
    else
      v_gross := round(v_due.amount, v_decimals);
      v_vat   := round(v_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), v_decimals);
      v_base  := v_gross - v_vat;
    end if;
  else
    -- المعفى وخارج النطاق: لا ضريبة، والأساس هو المبلغ. تسجيل الأصفار صراحةً
    -- أوضح من تركها فارغة — «صفر ضريبة» حكم، و«لا قيمة» غموض.
    v_basis := v_map.amount_basis;
    v_base  := round(v_due.amount, v_decimals);
    v_vat   := 0;
    v_gross := v_base;
  end if;

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    replaces_decision_id, decided_by, amount_basis, taxable_base, vat_amount, gross_amount
  ) values (
    v_due.organization_id, 'DUE', p_due_id, v_map.revenue_nature, v_jurisdiction,
    v_due.issue_date, v_rule.id, v_rule.rule_hash,
    jsonb_build_object(
      'jurisdiction', v_rule.jurisdiction, 'revenue_nature', v_rule.revenue_nature,
      'tax_treatment', v_rule.tax_treatment, 'vat_rate', v_rule.vat_rate,
      'e_document_type', v_rule.e_document_type, 'issuer_scope', v_rule.issuer_scope,
      'effective_from', v_rule.effective_from, 'version', v_rule.version,
      'rule_hash', v_rule.rule_hash, 'legal_reference', v_rule.legal_reference,
      'source_issue_date', v_due.issue_date, 'source_amount', v_due.amount,
      'currency', coalesce(v_currency, 'EGP'), 'currency_decimals', v_decimals,
      'amount_basis', v_basis, 'taxable_base', v_base, 'vat_amount', v_vat,
      'gross_amount', v_gross, 'decided_at', now()
    ),
    v_previous_id, auth.uid(), v_basis, v_base, v_vat, v_gross
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_due.organization_id, 'tax_decision.recorded', 'tax_decision', v_id,
    jsonb_build_object(
      'source_type', 'DUE', 'source_id', p_due_id,
      'revenue_nature', v_map.revenue_nature, 'tax_treatment', v_rule.tax_treatment,
      'transaction_date', v_due.issue_date, 'tax_rule_version_id', v_rule.id,
      'amount_basis', v_basis, 'taxable_base', v_base,
      'vat_amount', v_vat, 'gross_amount', v_gross,
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;
