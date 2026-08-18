-- الإنفاذ الضريبي لكل مؤسسة على حدة، ووصل الحاجز بمسار الترحيل الحقيقي.
--
-- ═══ لماذا trigger لا RPC ترحيل أعلى مستوى ═══
--
-- الطلب كان: إن لم يسمح نظام RPC الحالي بضم العملية، فأنشئ RPC ترحيل أعلى مستوى.
-- الحصر (docs/reviews/revenue-posting-paths.md) أظهر أن **أربعة محركات مختلفة**
-- تُدرج في `dues` — محرك المستحقات، وتوليد إيجار العقود، وخطط التقسيط، ومحرك
-- رسوم الخدمة — وأن `post_due_to_ledger` موصولة أصلًا بـtrigger على الإدراج.
--
-- فـRPC أعلى مستوى كان سيتطلب إعادة توجيه المحركات الأربعة إليه، وأي محرك يُنسى
-- أو يُضاف لاحقًا يتجاوز الحاجز صامتًا — وهو بالضبط نمط «حاجز صحيح بسطح
-- يتجاوزه» الذي أوقعنا فيه تجميد ADR 0002. الـtrigger يجعل التجاوز مستحيلًا:
-- **أي** إدراج في `dues`، من أي مسار حاضر أو مستقبل، يمر به.
--
-- والذرية مجانية بهذا الشكل: الـtrigger يعمل داخل معاملة الإدراج نفسها، فرفع
-- استثناء منه يسحب المستحق والقيد والقرار معًا. لا ترتيب استدعاءات، ولا اعتماد
-- على أن يتذكر التطبيق شيئًا.
--
-- ═══ ولماذا علم تفعيل صريح لا مجرد وجود الاختصاص ═══
--
-- وجود `tax_jurisdiction` مفتاح صامت: مؤسسة تسجّل اختصاصها لغرض آخر تجد ترحيلها
-- متوقفًا بلا قرار إداري. `tax_enforcement_enabled` فعل صريح بفاعل ووقت وسجل.

-- ═══════════════════════════════════════════════════════════════════════
-- ١. علم التفعيل
-- ═══════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists tax_enforcement_enabled boolean not null default false,
  add column if not exists tax_enforcement_enabled_at timestamptz,
  add column if not exists tax_enforcement_enabled_by uuid;

alter table public.organizations drop constraint if exists org_tax_enforcement_has_actor;
alter table public.organizations
  add constraint org_tax_enforcement_has_actor check (
    tax_enforcement_enabled = false or tax_enforcement_enabled_at is not null
  );

comment on column public.organizations.tax_enforcement_enabled is
  'تفعيل إداري صريح للنطاق الضريبي. غياب الاختصاص ليس مفتاحًا صامتًا — الإنفاذ لا يسري إلا بهذا العلم.';

insert into public.permissions (key, description) values
  ('finance.tax_enforcement.manage', 'تفعيل أو إيقاف الإنفاذ الضريبي للمؤسسة')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key) values
  ('TENANT_OWNER',    'finance.tax_enforcement.manage'),
  ('FINANCE_MANAGER', 'finance.tax_enforcement.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.tax_enforcement.manage'
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- ٢. فحص الجاهزية — يعيد النواقص كلها، ولا يفعّل حالة جزئية
-- ═══════════════════════════════════════════════════════════════════════
--
-- الربط مطلوب لكل نوع مستحق **نشط**، لا لكل نوع مُستخدَم فعلًا. النوع النشط غير
-- المربوط قنبلة موقوتة: التفعيل «ينجح» ثم ينهار أول إصدار يستخدمه. والجاهزية
-- التي تسمح بذلك ليست جاهزية.

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

  -- الهوية الضريبية القانونية — ADR 0002. ولا يُدَّعى تحقق مع مصلحة الضرائب:
  -- لم يُنفَّذ أي تكامل بعد، وادعاء التحقق هنا كذب على المستخدم.
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
end;
$$;

create or replace function public.set_tax_enforcement(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gaps text;
  v_count integer;
  v_was boolean;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage') then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بتفعيل الإنفاذ الضريبي'
      using errcode = '42501';
  end if;

  select tax_enforcement_enabled into v_was
  from public.organizations where id = p_organization_id;
  if v_was is null then
    raise exception 'ORGANIZATION_NOT_FOUND: المؤسسة غير موجودة' using errcode = 'P0002';
  end if;

  -- التفعيل مشروط بالجاهزية؛ الإيقاف متاح دائمًا — حجب مخرج الطوارئ يحوّل خللًا
  -- في الإعداد إلى تعطّل كامل بلا مخرج.
  if p_enabled then
    select count(*), string_agg(gap_code || ': ' || detail, ' | ')
    into v_count, v_gaps
    from public.check_tax_enforcement_readiness(p_organization_id);

    if v_count > 0 then
      raise exception 'TAX_ENFORCEMENT_NOT_READY: %', v_gaps using errcode = 'P0001';
    end if;
  end if;

  update public.organizations
  set tax_enforcement_enabled = p_enabled,
      tax_enforcement_enabled_at = case when p_enabled then now() else null end,
      tax_enforcement_enabled_by = case when p_enabled then auth.uid() else null end
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), p_organization_id,
    case when p_enabled then 'tax_enforcement.enabled' else 'tax_enforcement.disabled' end,
    'organization', p_organization_id, p_reason,
    jsonb_build_object('from', v_was, 'to', p_enabled)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ٣. نسخة داخلية بلا فحص صلاحية، ووصلها بالإدراج
-- ═══════════════════════════════════════════════════════════════════════
--
-- تُستدعى من داخل معاملة الترحيل. فحص الصلاحية هنا كان سيرفض مستخدمًا يملك
-- `finance.dues.issue` ولا يملك `finance.tax_mapping.manage` — أي أن الحاجز كان
-- سيمنع عملًا مصرَّحًا به. الصلاحية التي تحكم إنشاء المستحق هي الحاكمة؛ والنسخة
-- العامة `record_tax_decision_for_due` تبقى محكومة بصلاحيتها للاستدعاء اليدوي.

create or replace function public.record_tax_decision_for_due_internal(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_jurisdiction text;
  v_map record;
  v_rule public.tax_rule_versions;
  v_active record;
  v_previous_id uuid;
  v_id uuid;
begin
  select d.id, d.organization_id, d.due_type_id, d.issue_date, d.status
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

  select nullif(btrim(tax_jurisdiction), '') into v_jurisdiction
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

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    replaces_decision_id, decided_by
  ) values (
    v_due.organization_id, 'DUE', p_due_id, v_map.revenue_nature, v_jurisdiction,
    v_due.issue_date, v_rule.id, v_rule.rule_hash,
    jsonb_build_object(
      'jurisdiction', v_rule.jurisdiction, 'revenue_nature', v_rule.revenue_nature,
      'tax_treatment', v_rule.tax_treatment, 'vat_rate', v_rule.vat_rate,
      'e_document_type', v_rule.e_document_type, 'issuer_scope', v_rule.issuer_scope,
      'effective_from', v_rule.effective_from, 'version', v_rule.version,
      'rule_hash', v_rule.rule_hash, 'legal_reference', v_rule.legal_reference,
      'source_issue_date', v_due.issue_date, 'decided_at', now()
    ),
    v_previous_id, auth.uid()
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
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;

create or replace function public.record_tax_decision_for_due(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.dues where id = p_due_id;
  if v_org is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بتسجيل قرار ضريبي' using errcode = '42501';
  end if;

  return public.record_tax_decision_for_due_internal(p_due_id);
end;
$$;

create or replace function public.trg_dues_tax_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enforced boolean;
begin
  select tax_enforcement_enabled into v_enforced
  from public.organizations where id = NEW.organization_id;

  -- المؤسسة خارج النطاق تعمل كما كانت تمامًا. هذا ما يمنع تعطيل 1938 مؤسسة.
  if not coalesce(v_enforced, false) then
    return NEW;
  end if;

  -- الملغى لا إيراد فيه، فلا قرار له، ولا يُفشل إدراجه.
  if NEW.status = 'VOID' then
    return NEW;
  end if;

  -- أي استثناء هنا يسحب المستحق والقيد والقرار معًا: كلها في معاملة واحدة.
  perform public.record_tax_decision_for_due_internal(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists trg_dues_tax_decision on public.dues;
create trigger trg_dues_tax_decision
  after insert on public.dues
  for each row execute function public.trg_dues_tax_decision();
