-- القرار يشتق المشتري ويختمه، ويحجب **الخاضع وحده** عند نقص الهوية.
-- (الجزء الأول في 20260921000001 — حقول الهوية على `members` واشتقاق المشتري.)
--
-- الحجب انتقائي بقرار معتمد: المعفى والخارج عن النطاق يمران بلا هوية مشترٍ،
-- لأن الإعفاء لا يستلزم فاتورة ضريبية تحمل رقم تسجيل المشتري. أما الخاضع فلا
-- يُصدَر إلا لمشترٍ محدَّد ومصنَّف — ومنشأةٍ برقم تسجيل.
--
-- ولقطة المشتري تُختم وقت الإصدار، فلا يُعاد العرض من قيمة `members` الحالية:
-- تغيير الاسم أو الرقم لاحقًا لا يجوز أن يغيّر فاتورة صدرت.
--
-- **ورقم الهوية الشخصية لا يُنسخ في اللقطة عمدًا.** `tax_decisions` غير قابل
-- للتعديل بحكم التصميم، فرقم شخصي يُكتب فيه لا يُصحَّح ولا يُمحى أبدًا. يُسجَّل
-- نوعه ووجوده، ويُقرأ الرقم من مصدره وقت بناء المستند. أما رقم التسجيل الضريبي
-- فيُنسخ لأنه معرّف منشأة ومن متطلبات الفاتورة نفسها.

alter table public.tax_decisions
  add column if not exists buyer_member_id uuid references public.members(id);

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
  v_account uuid;
  v_buyer record;
  v_member record;
  v_buyer_snapshot jsonb := '{}'::jsonb;
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

  -- المشتري يُشتق ويُختم دائمًا، والحجب للخاضع وحده.
  select * into v_buyer from public.resolve_due_buyer(p_due_id);
  if v_buyer.member_id is not null then
    select m.customer_type, m.tax_registration_number, m.identity_document_type,
           m.identity_document_number, m.legal_name, m.full_name, m.country_code,
           m.billing_address, m.identity_verified_at, m.identity_verification_source
    into v_member
    from public.members m where m.id = v_buyer.member_id;
  end if;

  if v_rule.tax_treatment = 'TAXABLE' then
    if v_buyer.member_id is null then
      raise exception
        'TAX_BUYER_UNRESOLVED: لا يمكن تحديد المشتري لهذا المستحق (%)',
        coalesce(v_buyer.ambiguity, 'UNKNOWN') using errcode = 'P0001';
    end if;

    if v_member.customer_type = 'UNRESOLVED' then
      raise exception
        'TAX_BUYER_STATUS_UNRESOLVED: تصنيف المشتري (منشأة أم فرد) غير محسوم؛ لا يُستنتج من الاسم'
        using errcode = 'P0001';
    end if;

    if v_member.customer_type = 'B2B'
       and nullif(btrim(coalesce(v_member.tax_registration_number, '')), '') is null then
      raise exception
        'TAX_BUYER_TAX_ID_MISSING: المشتري منشأة بلا رقم تسجيل ضريبي؛ لا تُصدر فاتورة خاضعة له'
        using errcode = 'P0001';
    end if;
  end if;

  v_decimals := public.currency_decimals(coalesce(v_currency, 'EGP'));

  if v_rule.tax_treatment = 'TAXABLE' then
    if v_map.amount_basis is null then
      raise exception
        'TAX_AMOUNT_BASIS_REQUIRED: المعالجة خاضعة (%) ولم يُحدَّد هل مبلغ نوع المستحق صافٍ أم شامل للضريبة',
        v_map.revenue_nature using errcode = 'P0001';
    end if;
    v_basis := v_map.amount_basis;

    if v_basis = 'NET' then
      raise exception
        'TAX_NET_BASIS_NOT_POSTABLE: أساس صافٍ لنوع خاضع غير قابل للترحيل؛ مبلغ المستحق يجب أن يكون شاملًا للضريبة حتى تطابق الذمم ما يدين به العميل'
        using errcode = 'P0001';
    end if;

    v_gross := round(v_due.amount, v_decimals);
    v_vat   := round(v_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), v_decimals);
    v_base  := v_gross - v_vat;

    v_account := public.resolve_output_tax_account(v_due.organization_id);
    if v_account is null then
      raise exception
        'OUTPUT_TAX_ACCOUNT_MISSING: لا يوجد حساب ضريبة مخرجات صالح للمؤسسة'
        using errcode = 'P0001';
    end if;
  else
    v_basis := v_map.amount_basis;
    v_base  := round(v_due.amount, v_decimals);
    v_vat   := 0;
    v_gross := v_base;
    v_account := null;
  end if;

  if v_buyer.member_id is not null then
    v_buyer_snapshot := jsonb_build_object(
      'buyer_member_id', v_buyer.member_id,
      'buyer_resolved_via', v_buyer.resolved_via,
      'buyer_customer_type', v_member.customer_type,
      'buyer_legal_name', coalesce(v_member.legal_name, v_member.full_name),
      'buyer_country_code', v_member.country_code,
      'buyer_billing_address', v_member.billing_address,
      'buyer_tax_registration_number', v_member.tax_registration_number,
      'buyer_identity_document_type', v_member.identity_document_type,
      'buyer_identity_document_on_file',
        nullif(btrim(coalesce(v_member.identity_document_number, '')), '') is not null,
      'buyer_identity_verified_at', v_member.identity_verified_at,
      'buyer_identity_verification_source', v_member.identity_verification_source
    );
  else
    -- يُختم سبب تعذّر التحديد حتى في المعفى: السكوت عنه يخفي فجوة بيانات.
    v_buyer_snapshot := jsonb_build_object(
      'buyer_member_id', null, 'buyer_resolved_via', null,
      'buyer_unresolved_reason', v_buyer.ambiguity
    );
  end if;

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    replaces_decision_id, decided_by, amount_basis, taxable_base, vat_amount, gross_amount,
    output_tax_account_id, buyer_member_id
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
      'gross_amount', v_gross, 'output_tax_account_id', v_account, 'decided_at', now()
    ) || v_buyer_snapshot,
    v_previous_id, auth.uid(), v_basis, v_base, v_vat, v_gross, v_account, v_buyer.member_id
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
      'amount_basis', v_basis, 'taxable_base', v_base, 'vat_amount', v_vat,
      'gross_amount', v_gross, 'output_tax_account_id', v_account,
      'buyer_member_id', v_buyer.member_id, 'buyer_resolved_via', v_buyer.resolved_via,
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;

-- الجاهزية تُبلغ عن هوية المشتري **مجمَّعةً** لا صفًّا صفًّا: مؤسسة بـ617 عضوًا
-- تعني 617 سطر نقص، وقائمة بهذا الطول لا تُقرأ فلا تُنفَّذ.
create or replace function public.check_tax_enforcement_readiness(p_organization_id uuid)
returns table (gap_code text, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org record;
  v_has_taxable boolean;
  v_unresolved integer;
  v_b2b_no_tax_id integer;
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

  return query
  select 'NET_BASIS_NOT_POSTABLE'::text,
         ('أساس صافٍ لنوع خاضع لا يمكن ترحيله: ' || dt.name_ar ||
          ' — مبلغ المستحق يجب أن يكون شاملًا للضريبة حتى تطابق الذمم ما يدين به العميل')::text
  from public.due_type_revenue_natures m
  join public.due_types dt
    on dt.id = m.due_type_id and dt.organization_id = m.organization_id and dt.is_active
  where m.organization_id = p_organization_id
    and m.status = 'APPROVED'
    and m.amount_basis = 'NET'
    and exists (
      select 1
      from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
      where r.tax_treatment = 'TAXABLE'
    );

  select exists (
    select 1
    from public.due_type_revenue_natures m
    join public.due_types dt on dt.id = m.due_type_id and dt.is_active
    where m.organization_id = p_organization_id and m.status = 'APPROVED'
      and exists (
        select 1 from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
        where r.tax_treatment = 'TAXABLE'
      )
  ) into v_has_taxable;

  if v_has_taxable and public.resolve_output_tax_account(p_organization_id) is null then
    return query select 'OUTPUT_TAX_ACCOUNT_MISSING'::text,
      'لا يوجد حساب ضريبة مخرجات صالح (التزام نشط غير تجميعي): استنسخ الدليل القياسي أو عيّن حسابًا'::text;
  end if;

  -- الفحص للخاضع وحده: مؤسسة كلها معفاة لا يحجبها غياب تصنيف المشتري.
  if v_has_taxable then
    select count(*) into v_unresolved
    from public.members where organization_id = p_organization_id and customer_type = 'UNRESOLVED';

    if v_unresolved > 0 then
      return query select 'B2B_STATUS_UNRESOLVED'::text,
        (v_unresolved::text || ' عضوًا بلا تصنيف مشتري محسوم؛ الفاتورة الخاضعة لهم مرفوضة حتى يُحسم')::text;
    end if;

    select count(*) into v_b2b_no_tax_id
    from public.members
    where organization_id = p_organization_id and customer_type = 'B2B'
      and nullif(btrim(coalesce(tax_registration_number, '')), '') is null;

    if v_b2b_no_tax_id > 0 then
      return query select 'BUYER_TAX_ID_MISSING'::text,
        (v_b2b_no_tax_id::text || ' مشتريًا مصنَّفًا منشأةً بلا رقم تسجيل ضريبي')::text;
    end if;
  end if;
end;
$$;
