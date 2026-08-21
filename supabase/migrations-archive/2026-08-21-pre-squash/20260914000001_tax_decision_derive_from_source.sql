-- إصلاح عقد القرار الضريبي: المصدر هو الحقيقة، لا مُدخَلات المستدعي.
--
-- المراجعة المستقلة (docs/reviews/record-tax-decision-contract.md) وجدت أن
-- `record_tax_decision` تحرس ما تقرؤه ولا تحرس صحة ما يُملى عليها. هذا الملف
-- يزيل الثقة من التوقيع نفسه بدل إضافة فحوص فوقها.
--
-- ═══ ثلاثة اكتشافات من مسح المصادر غيّرت التصميم عمّا طُلب حرفيًا ═══
--
-- **الأول: لا يوجد في النظام إلا مسار ترحيل إيراد واحد.** كل إيراد يمر عبر
-- `dues`: محرك المستحقات، وتوليد إيجار العقود، وخطط التقسيط، ومحرك رسوم الخدمة
-- — أربعتها تُدرج في `dues`، و`post_due_to_ledger` هي نقطة الاعتراف الوحيدة
-- بالدفتر (trigger على الإدراج + `recognize_pending_dues` للمؤجَّل). فالسؤال
-- «هل تمر كل المصادر عبر الحاجز نفسه؟» له اليوم جواب أبسط مما بدا: **مصدر واحد
-- لا خمسة**، ونقطة وصل واحدة لا عدة نقاط.
--
-- **الثاني: العمولة وفاتورة المورد ليستا مصدري إيراد في هذا النظام.**
-- `commissions` فيه `broker_id` و`wht_rate` و`payment_journal_entry_id`: أي أن
-- المؤسسة **تدفع** للوسيط — مصروف لا إيراد. و`supplier_invoices` مشترياتٌ
-- بضريبة مدخلات. و`PAYMENT_RECEIPT` تحصيلٌ لمستحق **اعتُرف بإيراده أصلًا عند
-- إصداره**، فقرار ضريبي ثانٍ عليه ازدواج لا تغطية.
--
-- لذلك **لم تُبنَ لها adapters**. بناؤها يخترع لها معنى إيراديًا لا تحمله، وهو
-- أسوأ من غيابها. و`source_type` ضاق إلى `DUE` وحده. إضافة مصدر لاحقًا تتطلب
-- adapter يشتق من صف ذلك المصدر — العقد موحّد والاشتقاق لكل نوع.
--
-- **الثالث: لا يوجد مصدر موثوق للاختصاص الضريبي.** `organizations` لا يحمل
-- بلدًا؛ فيه `governorate` و`city` وهما عنوان لا صفة قانونية. والعقد المعتمد
-- ذو المُعامل الواحد يوجب الاشتقاق. فأُضيف `organizations.tax_jurisdiction`
-- **صفةً قانونية للكيان** — من طبقة `tax_id` نفسها لا من طبقة إعدادات التكامل —
-- ويبقى `null` افتراضًا، **والقرار يُرفض حين يكون `null` بدل أن يُخمَّن**.

-- ═══════════════════════════════════════════════════════════════════════
-- ١. الاختصاص الضريبي صفة قانونية للكيان
-- ═══════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists tax_jurisdiction text
    check (tax_jurisdiction is null or tax_jurisdiction in ('EG', 'SA'));

comment on column public.organizations.tax_jurisdiction is
  'الاختصاص الضريبي للكيان — صفة قانونية كـtax_id، لا إعداد تكامل. يبقى null حتى يُسجَّل، والقرار الضريبي يُرفض عندئذٍ ولا يُخمَّن.';

-- ═══════════════════════════════════════════════════════════════════════
-- ٢. مسار تصحيح append-only
-- ═══════════════════════════════════════════════════════════════════════
--
-- القرار المرحَّل لا يُعدَّل ولا يُحذف. التصحيح يُنشئ صفوفًا جديدة:
--
--   القرار الأصلي        reverses = null, replaces = null
--   القرار العكسي        reverses = الأصلي              ← يُبطله
--   القرار المصحَّح        replaces = الأصلي              ← يخلفه
--
-- و«النشط» هو قرار لا يشير إليه أي قرار عكسي. والقيدان أدناه يجعلان السلسلة
-- **خطية**: كل قرار يُعكَس مرة واحدة ويُخلَف مرة واحدة، فلا يمكن أن يوجد رأسان
-- نشطان لمصدر واحد. هذا يستبدل ضمان `unique(source_type, source_id)` القديم
-- الذي كان يمنع التصحيح أصلًا.

alter table public.tax_decisions
  add column if not exists reverses_decision_id uuid references public.tax_decisions(id),
  add column if not exists replaces_decision_id uuid references public.tax_decisions(id),
  add column if not exists reason text;

alter table public.tax_decisions drop constraint if exists tax_decision_one_per_source;

alter table public.tax_decisions drop constraint if exists tax_decision_reversed_once;
alter table public.tax_decisions
  add constraint tax_decision_reversed_once unique (reverses_decision_id);

alter table public.tax_decisions drop constraint if exists tax_decision_replaced_once;
alter table public.tax_decisions
  add constraint tax_decision_replaced_once unique (replaces_decision_id);

alter table public.tax_decisions drop constraint if exists tax_decision_reversal_has_reason;
alter table public.tax_decisions
  add constraint tax_decision_reversal_has_reason check (
    reverses_decision_id is null or nullif(btrim(reason), '') is not null
  );

alter table public.tax_decisions drop constraint if exists tax_decision_not_both_links;
alter table public.tax_decisions
  add constraint tax_decision_not_both_links check (
    reverses_decision_id is null or replaces_decision_id is null
  );

-- المصدر ضاق إلى ما يحمل إيرادًا فعلًا في هذا النظام.
alter table public.tax_decisions drop constraint if exists tax_decisions_source_type_check;
alter table public.tax_decisions
  add constraint tax_decisions_source_type_check check (source_type in ('DUE'));

create index if not exists idx_tax_decisions_source
  on public.tax_decisions (source_type, source_id);

-- ═══════════════════════════════════════════════════════════════════════
-- ٣. الخلافة تأخذ القفل نفسه الذي يأخذه التسجيل
-- ═══════════════════════════════════════════════════════════════════════
--
-- بلا هذا، خلافةٌ بأثر رجعي تُنفَّذ بين لحظة حل القاعدة ولحظة الإدراج تختم قرارًا
-- بقاعدة لم تعد تغطي تاريخه. القفل على مستوى (الاختصاص، طبيعة الإيراد) لا على
-- الصف: الخطر يأتي من **إدراج** قاعدة جديدة لا من تعديل القديمة، وقفل الصف لا
-- يمنع الإدراج. القفل معاملاتي ويُحرَّر تلقائيًا، ولا يُؤخذ حول أي نداء خارجي.

create or replace function public.supersede_tax_rule(
  p_rule_id uuid,
  p_effective_from date,
  p_tax_treatment text,
  p_vat_rate numeric,
  p_e_document_type text,
  p_issuer_scope text,
  p_legal_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_version integer;
  v_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: خلافة القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  select * into v_old from public.tax_rule_versions where id = p_rule_id;
  if v_old.id is null then
    raise exception 'TAX_RULE_NOT_FOUND: القاعدة غير موجودة' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_old.jurisdiction), hashtext(v_old.revenue_nature));

  if v_old.status <> 'APPROVED' then
    raise exception 'TAX_RULE_NOT_APPROVED: تُخلَف القاعدة المعتمدة وحدها (%)', v_old.status
      using errcode = 'P0001';
  end if;
  if p_effective_from <= v_old.effective_from then
    raise exception 'TAX_RULE_WINDOW_INVALID: تاريخ الخلافة يجب أن يلي بداية القاعدة السابقة'
      using errcode = '22023';
  end if;

  update public.tax_rule_versions
  set effective_to = p_effective_from, status = 'SUPERSEDED'
  where id = p_rule_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.tax_rule_versions
  where jurisdiction = v_old.jurisdiction and revenue_nature = v_old.revenue_nature;

  insert into public.tax_rule_versions (
    jurisdiction, revenue_nature, tax_treatment, vat_rate, effective_from,
    e_document_type, issuer_scope, version, rule_hash, status, legal_reference,
    approved_by, approved_at, created_by
  ) values (
    v_old.jurisdiction, v_old.revenue_nature, p_tax_treatment, p_vat_rate, p_effective_from,
    p_e_document_type, p_issuer_scope, v_version, '', 'APPROVED', p_legal_reference,
    auth.uid(), now(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ٤. adapter المستحقات — كل شيء مشتق من صف المصدر
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.record_tax_decision_for_due(p_due_id uuid)
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
  -- (١) المصدر هو الحقيقة. المؤسسة ونوع المستحق وتاريخ المعاملة تُقرأ من الصف،
  -- ولا يملك المستدعي تمرير أيٍّ منها.
  select d.id, d.organization_id, d.due_type_id, d.issue_date, d.status
  into v_due
  from public.dues d
  where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  -- (٢) الصلاحية على مؤسسة المستحق نفسه، لا على مؤسسة مشتقة من مُدخَل آخر.
  if not public.has_permission(auth.uid(), v_due.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بتسجيل قرار ضريبي' using errcode = '42501';
  end if;

  if v_due.status = 'VOID' then
    raise exception 'DUE_VOID: لا يُسجَّل قرار ضريبي لمستحق ملغى' using errcode = 'P0001';
  end if;

  if v_due.due_type_id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: المستحق بلا نوع، فلا سبيل إلى طبيعة إيراد' using errcode = 'P0001';
  end if;

  -- (٣) الاختصاص صفة قانونية للكيان، ويُرفض غيابها ولا يُخمَّن.
  select nullif(btrim(tax_jurisdiction), '') into v_jurisdiction
  from public.organizations where id = v_due.organization_id;

  if v_jurisdiction is null then
    raise exception
      'TAX_JURISDICTION_MISSING: لم يُسجَّل الاختصاص الضريبي للمؤسسة؛ سجّله قبل أي قرار ضريبي'
      using errcode = 'P0001';
  end if;

  -- (٤) الربط الصريح المعتمد. غياب الصف وغياب الاعتماد كلاهما «غير محسوم».
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

  -- (٥) القفل قبل الحل: يسدّ السباق مع خلافة بأثر رجعي.
  perform pg_advisory_xact_lock(hashtext(v_jurisdiction), hashtext(v_map.revenue_nature));

  -- (٦) idempotent: القرار النشط هو ما لا يشير إليه قرار عكسي.
  select td.* into v_active
  from public.tax_decisions td
  where td.source_type = 'DUE'
    and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.tax_decisions r where r.reverses_decision_id = td.id
    )
  order by td.decided_at desc
  limit 1;

  if v_active.id is not null then
    return v_active.id;
  end if;

  -- قرار سابق أُبطل: الجديد يخلفه صراحةً بدل أن يبدو أولًا.
  select td.id into v_previous_id
  from public.tax_decisions td
  where td.source_type = 'DUE'
    and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.tax_decisions s where s.replaces_decision_id = td.id
    )
  order by td.decided_at desc
  limit 1;

  -- (٧) القاعدة السارية **بتاريخ إصدار المستحق**، لا بتاريخ الترحيل.
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
      'jurisdiction',    v_rule.jurisdiction,
      'revenue_nature',  v_rule.revenue_nature,
      'tax_treatment',   v_rule.tax_treatment,
      'vat_rate',        v_rule.vat_rate,
      'e_document_type', v_rule.e_document_type,
      'issuer_scope',    v_rule.issuer_scope,
      'effective_from',  v_rule.effective_from,
      'version',         v_rule.version,
      'rule_hash',       v_rule.rule_hash,
      'legal_reference', v_rule.legal_reference,
      'source_issue_date', v_due.issue_date,
      'decided_at',      now()
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
      'revenue_nature', v_map.revenue_nature,
      'tax_treatment', v_rule.tax_treatment,
      'transaction_date', v_due.issue_date,
      'tax_rule_version_id', v_rule.id,
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ٥. الإبطال — قيد عكسي لا ممحاة
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.reverse_tax_decision(
  p_decision_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.tax_decisions;
  v_id uuid;
begin
  select * into v_original from public.tax_decisions where id = p_decision_id;
  if v_original.id is null then
    raise exception 'TAX_DECISION_NOT_FOUND: القرار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بإبطال قرار ضريبي' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'TAX_DECISION_REASON_REQUIRED: الإبطال يحتاج سببًا' using errcode = '22023';
  end if;

  if v_original.reverses_decision_id is not null then
    raise exception 'TAX_DECISION_IS_REVERSAL: القرار العكسي لا يُعكَس' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tax_decisions where reverses_decision_id = p_decision_id) then
    raise exception 'TAX_DECISION_ALREADY_REVERSED: القرار مُبطَل بالفعل' using errcode = 'P0001';
  end if;

  -- الصف العكسي يحمل بصمة الأصل نفسها: قيد عكسي يعكس ما قُرِّر فعلًا، لا إعادة
  -- تقييم بقاعدة اليوم.
  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    reverses_decision_id, reason, decided_by
  ) values (
    v_original.organization_id, v_original.source_type, v_original.source_id,
    v_original.revenue_nature, v_original.jurisdiction, v_original.transaction_date,
    v_original.tax_rule_version_id, v_original.tax_rule_hash,
    v_original.tax_decision_snapshot || jsonb_build_object('reversal_of', p_decision_id),
    p_decision_id, p_reason, auth.uid()
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_original.organization_id, 'tax_decision.reversed', 'tax_decision', v_id,
    p_reason,
    jsonb_build_object(
      'reverses_decision_id', p_decision_id,
      'source_type', v_original.source_type,
      'source_id', v_original.source_id,
      'revenue_nature', v_original.revenue_nature
    )
  );

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ٦. العقد القديم يُسحب
-- ═══════════════════════════════════════════════════════════════════════
--
-- `record_tax_decision` القديمة تقبل المؤسسة ونوع المستحق وتاريخ المعاملة
-- كمُدخَلات مستقلة، وهي بالضبط الثغرة التي وجدتها المراجعة. إبقاؤها متاحة يجعل
-- الإصلاح اختياريًا.

drop function if exists public.record_tax_decision(text, uuid, uuid, text, date);
