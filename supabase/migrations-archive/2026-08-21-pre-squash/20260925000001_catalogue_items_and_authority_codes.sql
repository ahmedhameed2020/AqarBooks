-- كتالوج الأصناف وأكواد السلطة — آخر بند برمجي يفصلنا عن مستند ETA حقيقي.
--
-- ETA لا تقبل وصفًا نصيًا حرًا لسطر الفاتورة: تشترط كود صنف (EGS أو GS1)، ولا
-- مسار بديل. فالمستند الذي يخرج اليوم صحيح بنيويًا وناقص هذا الحقل وحده.
--
-- ═══ الربط صريح، كعادة هذا النظام ═══
--
-- نوع المستحق يُربط بصنف **يدويًا**، تمامًا كما يُربط بطبيعة إيراد: لا اشتقاق
-- من الاسم، ولا صنف افتراضي يملأ الفراغ. والنوع بلا صنف يظهر في جاهزية الإصدار
-- بدل أن يمر صامتًا ثم يُرفض عند السلطة.
--
-- ═══ ما يُفحص وما لا يُفحص — وهذا مقصود ═══
--
-- `GS1` رقمي بأطوال معروفة (8، 12، 13، 14)، فيُفحص في القاعدة.
-- أما `EGS` فلم أتحقق من بنيته من مصدر رسمي في هذا العمل، **فلا أخترع له فحصًا**:
-- يُقبل غير فارغ، ويُسجَّل نوعه. فحص مبني على تخمين أسوأ من غيابه، لأنه يوهم
-- بضمان ويرفض أكوادًا صحيحة.
--
-- والكود ونوعه يأتيان معًا أو لا يأتيان: كود بلا نوع لا يُعرف كيف يُرسَل، ونوع
-- بلا كود ادّعاء بلا مضمون.
--
-- ═══ جاهزية الإصدار منفصلة عن جاهزية الإنفاذ ═══
--
-- كود الصنف لا يلزم لترحيل قيد محاسبي، بل لإرسال مستند. وخلط الفحصين يجعل نقصًا
-- في أحدهما يعطّل الآخر بلا سبب — القاعدة نفسها التي فصلت ضريبة المدخلات عن
-- المخرجات.

create table if not exists public.catalogue_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  name_ar         text not null,
  name_en         text not null,
  unit_code       text not null default 'EA',
  item_code_type  text check (item_code_type is null or item_code_type in ('EGS', 'GS1')),
  item_code       text,
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint catalogue_items_code_unique unique (organization_id, code),
  constraint catalogue_items_code_pairs_with_type check (
    (item_code is null and item_code_type is null)
    or (nullif(btrim(item_code), '') is not null and item_code_type is not null)
  ),
  constraint catalogue_items_gs1_shape check (
    item_code_type is distinct from 'GS1'
    or item_code ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
  )
);

comment on table public.catalogue_items is
  'كتالوج الأصناف وأكواد السلطة (EGS/GS1). ETA لا تقبل نصًا حرًا، فالمستند بلا كود صنف غير قابل للإرسال.';
comment on column public.catalogue_items.item_code is
  'كود السلطة. GS1 مفحوص بالطول والأرقام؛ EGS يُقبل غير فارغ دون ادعاء تحقق من بنيته.';

create index if not exists idx_catalogue_items_org on public.catalogue_items (organization_id);

alter table public.catalogue_items enable row level security;

drop policy if exists catalogue_items_select on public.catalogue_items;
create policy catalogue_items_select on public.catalogue_items
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
    or public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.manage')
  );

alter table public.due_types
  add column if not exists catalogue_item_id uuid references public.catalogue_items(id);

comment on column public.due_types.catalogue_item_id is
  'الصنف الذي يمثله نوع المستحق في المستند الإلكتروني. الربط صريح — لا يُشتق من الاسم كما لا تُشتق طبيعة الإيراد.';

create or replace function public.upsert_catalogue_item(
  p_organization_id uuid,
  p_code text,
  p_name_ar text,
  p_name_en text,
  p_unit_code text default 'EA',
  p_item_code_type text default null,
  p_item_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_before record;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة كتالوج الأصناف'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_code, '')), '') is null then
    raise exception 'CATALOGUE_ITEM_CODE_REQUIRED: كود الصنف الداخلي مطلوب' using errcode = '22023';
  end if;

  if (p_item_code is not null) <> (p_item_code_type is not null) then
    raise exception
      'ITEM_CODE_TYPE_MISMATCH: كود السلطة ونوعه يأتيان معًا أو لا يأتيان'
      using errcode = '22023';
  end if;

  select id, item_code, item_code_type into v_before
  from public.catalogue_items
  where organization_id = p_organization_id and code = btrim(p_code);

  insert into public.catalogue_items (
    organization_id, code, name_ar, name_en, unit_code, item_code_type, item_code, created_by
  ) values (
    p_organization_id, btrim(p_code), p_name_ar, p_name_en, coalesce(p_unit_code, 'EA'),
    p_item_code_type, nullif(btrim(coalesce(p_item_code, '')), ''), auth.uid()
  )
  on conflict (organization_id, code) do update
  set name_ar = excluded.name_ar,
      name_en = excluded.name_en,
      unit_code = excluded.unit_code,
      item_code_type = excluded.item_code_type,
      item_code = excluded.item_code,
      updated_at = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'catalogue_item.upserted', 'catalogue_item', v_id,
    jsonb_build_object(
      'code', btrim(p_code),
      'item_code_from', v_before.item_code, 'item_code_to', p_item_code,
      'item_code_type_from', v_before.item_code_type, 'item_code_type_to', p_item_code_type
    )
  );

  return v_id;
end;
$$;

create or replace function public.set_due_type_catalogue_item(
  p_due_type_id uuid,
  p_catalogue_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_item_org uuid;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بربط الأصناف'
      using errcode = '42501';
  end if;

  if p_catalogue_item_id is not null then
    select organization_id into v_item_org
    from public.catalogue_items where id = p_catalogue_item_id and is_active;
    if v_item_org is null or v_item_org <> v_org then
      raise exception
        'CATALOGUE_ITEM_NOT_IN_ORGANIZATION: الصنف غير موجود أو لا يتبع هذه المؤسسة'
        using errcode = '22023';
    end if;
  end if;

  update public.due_types set catalogue_item_id = p_catalogue_item_id where id = p_due_type_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'due_type_catalogue_item.set', 'due_type', p_due_type_id,
    jsonb_build_object('catalogue_item_id', p_catalogue_item_id)
  );
end;
$$;

create or replace function public.check_einvoice_emission_readiness(p_organization_id uuid)
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
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بفحص جاهزية الإصدار'
      using errcode = '42501';
  end if;

  select o.tax_id, o.tax_jurisdiction into v_org
  from public.organizations o where o.id = p_organization_id;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    return query select 'SELLER_TAX_ID_MISSING'::text,
      'لا يُصدَر مستند بلا رقم ضريبي للمؤسسة'::text;
  end if;

  return query
  select 'ITEM_LINK_MISSING'::text,
         ('نوع مستحق نشط بلا صنف مرتبط: ' || dt.name_ar)::text
  from public.due_types dt
  where dt.organization_id = p_organization_id and dt.is_active
    and dt.catalogue_item_id is null;

  return query
  select 'ITEM_CODE_MISSING'::text,
         ('صنف بلا كود سلطة (EGS/GS1): ' || ci.name_ar)::text
  from public.due_types dt
  join public.catalogue_items ci on ci.id = dt.catalogue_item_id
  where dt.organization_id = p_organization_id and dt.is_active
    and nullif(btrim(coalesce(ci.item_code, '')), '') is null;

  return query
  select 'BUYER_TAX_ID_MISSING'::text,
         (count(*)::text || ' مشتريًا منشأةً بلا رقم تسجيل؛ فاتورته لا تُصدَر')::text
  from public.members m
  where m.organization_id = p_organization_id and m.customer_type = 'B2B'
    and nullif(btrim(coalesce(m.tax_registration_number, '')), '') is null
  having count(*) > 0;
end;
$$;

create or replace function public.get_einvoice_source_for_due(p_due_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_org record;
  v_item record;
  v_decision record;
  v_snap jsonb;
  v_doc_type text;
  v_number text;
  v_decimals integer;
begin
  select d.id, d.organization_id, d.description, d.issue_date, d.amount, d.status,
         dt.catalogue_item_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_due.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار مستندات إلكترونية'
      using errcode = '42501';
  end if;

  if v_due.status = 'VOID' then
    raise exception 'DUE_VOID: لا يُصدَر مستند لمستحق ملغى' using errcode = 'P0001';
  end if;

  select o.name, o.tax_id, o.tax_jurisdiction, o.default_currency,
         o.governorate, o.city, o.address
  into v_org
  from public.organizations o where o.id = v_due.organization_id;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لا يُصدَر مستند بلا رقم ضريبي للمؤسسة'
      using errcode = 'P0001';
  end if;

  select td.* into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;

  if v_decision.id is null then
    raise exception
      'TAX_DECISION_MISSING: لا مستند بلا قرار ضريبي مختوم لهذا المستحق'
      using errcode = 'P0001';
  end if;

  v_snap := v_decision.tax_decision_snapshot;
  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));

  select ci.name_ar, ci.name_en, ci.unit_code, ci.item_code, ci.item_code_type
  into v_item
  from public.catalogue_items ci where ci.id = v_due.catalogue_item_id;

  v_doc_type := case
    when v_snap->>'e_document_type' = 'E_INVOICE' then 'INVOICE'
    when v_snap->>'e_document_type' = 'E_RECEIPT' then 'RECEIPT'
    when v_snap->>'e_document_type' = 'BY_CUSTOMER_TYPE' then
      case when v_snap->>'buyer_customer_type' = 'B2B' then 'INVOICE' else 'RECEIPT' end
    else null
  end;

  if v_doc_type is null then
    raise exception
      'EINVOICE_DOCUMENT_TYPE_UNRESOLVED: نوع المستند الإلكتروني غير محسوم لهذه المعالجة'
      using errcode = 'P0001';
  end if;

  if v_doc_type = 'INVOICE'
     and nullif(btrim(coalesce(v_snap->>'buyer_tax_registration_number', '')), '') is null then
    raise exception
      'EINVOICE_BUYER_TAX_ID_MISSING: الفاتورة بين المنشآت تستلزم رقم تسجيل المشتري'
      using errcode = 'P0001';
  end if;

  v_number := public.allocate_document_number(
    v_due.organization_id, v_doc_type, 'DUE', p_due_id, v_due.issue_date);

  return jsonb_build_object(
    'documentType', v_doc_type,
    'documentNumber', v_number,
    'issuedAt', v_due.issue_date,
    'currency', coalesce(v_org.default_currency, 'EGP'),
    'currencyDecimals', v_decimals,
    'seller', jsonb_build_object(
      'name', v_org.name,
      'taxId', v_org.tax_id,
      'countryCode', case when v_org.tax_jurisdiction = 'SA' then 'SA' else 'EG' end,
      'governorate', v_org.governorate,
      'city', v_org.city,
      'street', v_org.address
    ),
    'buyer', jsonb_build_object(
      'name', coalesce(v_snap->>'buyer_legal_name', 'غير محدد'),
      'taxId', v_snap->>'buyer_tax_registration_number',
      'countryCode', coalesce(v_snap->>'buyer_country_code', 'EG'),
      'street', v_snap->>'buyer_billing_address'
    ),
    'lines', jsonb_build_array(jsonb_build_object(
      'description', coalesce(v_due.description, v_item.name_ar, v_snap->>'revenue_nature'),
      -- الكود من الكتالوج، ويبقى null إن لم يُربط الصنف أو لم يحمل كودًا —
      -- لا يُملأ بما يبدو معقولًا، ومحوّل ETA يجب أن يرفض عليه.
      'itemCode', v_item.item_code,
      'itemCodeType', v_item.item_code_type,
      'quantity', 1,
      'unitCode', coalesce(v_item.unit_code, 'EA'),
      'unitPrice', v_decision.taxable_base,
      'discount', 0,
      'taxRate', coalesce((v_snap->>'vat_rate')::numeric, 0),
      'taxAmount', v_decision.vat_amount,
      'lineTotal', v_decision.gross_amount
    )),
    'totals', jsonb_build_object(
      'netAmount', v_decision.taxable_base,
      'discountAmount', 0,
      'taxAmount', v_decision.vat_amount,
      'grandTotal', v_decision.gross_amount
    ),
    'taxDecisionId', v_decision.id,
    'taxTreatment', v_snap->>'tax_treatment',
    'revenueNature', v_decision.revenue_nature
  );
end;
$$;
