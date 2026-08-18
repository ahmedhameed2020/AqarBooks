-- حساب ضريبة المخرجات، والقيد الثلاثي.
--
-- النموذج الهجين المعتمد: حساب في الدليل القياسي، وتجاوز مؤسسي عند الحاجة،
-- والشرط ليس اسمًا ولا رقمًا ثابتًا بل **فئة صالحة**: التزام نشط غير تجميعي
-- يخص المؤسسة نفسها. والجاهزية تتحقق من الحساب **الفعلي** قبل التفعيل، لا من
-- وجود إعداد.
--
-- ═══ تصادم حقيقي حُسم هنا: الأساس الصافي غير قابل للترحيل ═══
--
-- الذمم في الدفتر يجب أن تساوي `dues.amount` — فعليه تُخصَّص المدفوعات وعليه
-- يُبنى تقرير الأعمار. مع الأساس الشامل يتطابقان تمامًا. أما الصافي فيعني أن
-- العميل يدين بـ(المبلغ + الضريبة) بينما السجل الفرعي يقول (المبلغ)، فيصير
-- الدفتر والسجل روايتين تختلفان بمقدار الضريبة في كل سطر.
--
-- ولأن `dues` لا يُمَس، فالأساس الصافي **مرفوض عند القرار** برسالة صريحة،
-- والجاهزية تكشفه قبل التفعيل. وهو ليس إلغاءً للمفهوم: يبقى معلنًا وقابلًا
-- للدعم حين يحمل المستحق مبلغًا إجماليًا — وذلك تغيير مستقل.
--
-- ═══ الترتيب ═══
--
-- Postgres يطلق triggers الصف الواحد بترتيب الاسم أبجديًا، وكان
-- `trg_dues_post_to_ledger` يسبق `trg_dues_tax_decision` — فيُرحَّل القيد قبل
-- أن يوجد القرار الذي يقسّمه. البادئة الرقمية `01` تجعل الترتيب صريحًا لا
-- مصادفةً في تسمية.
--
-- ═══ النطاق ═══
--
-- القيود **الجديدة** وحدها. لا يُعاد بناء أي قيد تاريخي: المعالجة السابقة التي
-- رحّلت المبلغ كاملًا إلى الإيراد تحتاج قرار ترحيل مستقل وحساب ضريبة لكل
-- مؤسسة، وإعادة كتابتها تلقائيًا تغيّر إيرادًا معترفًا به في فترات قد تكون
-- مغلقة.

-- ═══════════════════════════════════════════════════════════════════════
-- ١. الحساب: قياسي في القالب، وتجاوز مؤسسي اختياري
-- ═══════════════════════════════════════════════════════════════════════

insert into public.coa_template_accounts
  (template_key, sort_order, code, parent_code, name_ar, name_en, category, normal_balance,
   is_group, is_cash_equivalent, cash_flow_section)
select 'RESORT_STANDARD',
       (select max(sort_order) + 1 from public.coa_template_accounts where template_key='RESORT_STANDARD'),
       '2300', '2000', 'ضريبة مخرجات مستحقة', 'Output Tax Payable',
       'LIABILITY', 'CREDIT', false, t.is_cash_equivalent, t.cash_flow_section
from public.coa_template_accounts t
where t.template_key='RESORT_STANDARD' and t.code='2100'
on conflict do nothing;

alter table public.organization_finance_settings
  add column if not exists output_tax_account_id uuid references public.chart_of_accounts(id);

comment on column public.organization_finance_settings.output_tax_account_id is
  'تجاوز اختياري لحساب ضريبة المخرجات. الافتراضي حساب الدليل القياسي 2300؛ ولا يُشترط اسم ولا رقم ثابت، بل فئة التزام صالحة.';

alter table public.tax_decisions
  add column if not exists output_tax_account_id uuid references public.chart_of_accounts(id);

create or replace function public.resolve_output_tax_account(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.id
     from public.organization_finance_settings s
     join public.chart_of_accounts a on a.id = s.output_tax_account_id
     where s.organization_id = p_organization_id
       and s.property_id is null
       and a.organization_id = p_organization_id
       and a.category = 'LIABILITY' and not a.is_group and a.is_active
     limit 1),
    (select a.id
     from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.code = '2300'
       and a.category = 'LIABILITY' and not a.is_group and a.is_active
     limit 1)
  );
$$;

create or replace function public.set_output_tax_account(
  p_organization_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before uuid;
  v_row_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حساب ضريبة المخرجات'
      using errcode = '42501';
  end if;

  if p_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_account_id and a.organization_id = p_organization_id
      and a.category = 'LIABILITY' and not a.is_group and a.is_active
  ) then
    raise exception
      'OUTPUT_TAX_ACCOUNT_INVALID: يجب أن يكون الحساب التزامًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  -- الوحدانية على (organization_id, property_id) و`property_id` قابل للعدم،
  -- فالقيم العدمية لا تتعارض في فهرس فريد عادي: `on conflict` هنا كان سيُنتج
  -- صفًا جديدًا في كل استدعاء بدل تحديث القائم.
  select id, output_tax_account_id into v_row_id, v_before
  from public.organization_finance_settings
  where organization_id = p_organization_id and property_id is null
  limit 1;

  if v_row_id is null then
    insert into public.organization_finance_settings (organization_id, output_tax_account_id)
    values (p_organization_id, p_account_id);
  else
    update public.organization_finance_settings
    set output_tax_account_id = p_account_id, updated_at = now()
    where id = v_row_id;
  end if;

  -- تغيير حساب الضريبة يغيّر وجهة التزام مُرحَّل، فيُلغي اعتماد كل ربط ويعيده
  -- إلى المراجعة — كما يفعل تغيير الطبيعة أو أساس المبلغ.
  update public.due_type_revenue_natures
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where organization_id = p_organization_id and status = 'APPROVED';

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'tax_output_account.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before, 'to', p_account_id, 'approvals_revoked', true)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ٢. الجاهزية: تتحقق من الحساب الفعلي، وترفض الأساس الصافي غير القابل للترحيل
-- ═══════════════════════════════════════════════════════════════════════

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

  -- أساس صافٍ غير قابل للترحيل: الذمم في الدفتر يجب أن تساوي مبلغ المستحق الذي
  -- تُخصَّص عليه المدفوعات ويُبنى عليه تقرير الأعمار. مع الشامل يتطابقان، ومع
  -- الصافي يفترقان بمقدار الضريبة — فيصير الدفتر والسجل الفرعي روايتين.
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

  -- الحساب **الفعلي** لا مجرد وجود إعداد: يُحلّ عبر التجاوز ثم القياسي، ويُفحص
  -- فقط إن كان في المؤسسة نوع خاضع — مؤسسة كلها معفاة لا تحتاج حساب ضريبة.
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
end;
$$;
