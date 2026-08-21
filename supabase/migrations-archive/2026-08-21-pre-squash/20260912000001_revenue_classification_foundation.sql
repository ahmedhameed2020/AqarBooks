-- ADR 0003 — المرحلة الأولى: أساس تصنيف الإيراد وقواعد ضريبية مؤرَّخة ومُصدَّرة.
--
-- النطاق مُقيَّد بما اعتُمد بعد التوقيع الخارجي: schema القواعد وإصداراتها،
-- قاموس أنواع الإيراد، ربط صريح لكل مستأجر، بصمة القرار على المعاملة، وحجب
-- الترحيل عند `REVIEW_REQUIRED`. **لا ETA mapper، ولا توقيع، ولا إرسال.**
--
-- ثلاثة قرارات تنفيذية اتُّخذت هنا وتستحق المراجعة صراحةً:
--
-- ١. **لا يُعدَّل `dues` إطلاقًا.** المطلوب حفظ بصمة القرار «على المعاملة»،
--    والممنوع تعديل `dues`. فالبصمة تعيش في جدول `tax_decisions` مستقل يشير إلى
--    المصدر بـ(`source_type`, `source_id`) بقيد وحدانية. هذا يحقق الشرطين معًا،
--    ويجعل البصمة صالحة لأي مصدر لاحق (رسوم خدمة، عمولة) بلا تعديل جداولها.
--
-- ٢. **لا تُزرَع أي قاعدة ضريبية في هذا الملف.** الآلية تُبنى فارغة. مصفوفة
--    المستشار تحوي معالجات مشروطة بمقدّم الخدمة وهو ما يزال `REVIEW_REQUIRED`،
--    وزرعها هنا يحوّل ترجيحًا إلى `default` صامت — وهو المحظور بنصّه. إدخال
--    القواعد فعل بشري عبر RPC يسجّل مَن اعتمد ومتى.
--
-- ٣. **الاختصاص الضريبي مُدخَل صريح لا مشتق.** لا يحمل `organizations` بلدًا
--    موثوقًا، واشتقاقه من ملف الفوترة يجعل إعداد تكامل يحدد معالجة ضريبية. يُمرَّر
--    صراحةً حتى يُحسم مصدره.

-- ═══════════════════════════════════════════════════════════════════════
-- ١. قاموس أنواع الإيراد — أسماء فقط، بلا أي معالجة ضريبية
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.revenue_natures (
  code        text primary key,
  name_ar     text not null,
  name_en     text not null,
  -- النوع المشتق لا تُوضع له قاعدة خاصة: يرث التوريد الأصلي بعد ربط صريح.
  is_derived  boolean not null default false,
  sort_order  integer not null,
  created_at  timestamptz not null default now()
);

comment on table public.revenue_natures is
  'قاموس أنواع الإيراد على مستوى النظام. لا يحمل معالجة ضريبية — المعالجة تعيش في tax_rule_versions المؤرَّخة.';
comment on column public.revenue_natures.is_derived is
  'يرث معالجة التوريد الأصلي ولا يُحسم آليًا؛ يُمنع وضع قاعدة مباشرة له.';

insert into public.revenue_natures (code, name_ar, name_en, is_derived, sort_order) values
  ('RESIDENTIAL_RENT',               'إيجار وحدة سكنية',        'Residential Rent',              false,  1),
  ('COMMERCIAL_RENT',                'إيجار وحدة تجارية',       'Commercial Rent',               false,  2),
  ('RESIDENTIAL_UNIT_SALE',          'بيع وحدة سكنية',          'Residential Unit Sale',         false,  3),
  ('COMMERCIAL_UNIT_SALE',           'بيع وحدة تجارية',         'Commercial Unit Sale',          false,  4),
  ('SALE_BOOKING_PAYMENT',           'دفعة حجز',                'Booking / Reservation',         true,   5),
  ('SALE_DOWN_PAYMENT',              'مقدم بيع',                'Down Payment',                  true,   6),
  ('SALE_INSTALLMENT',               'قسط وحدة',                'Unit Installment',              true,   7),
  ('SALE_FINAL_PAYMENT',             'الدفعة النهائية',          'Final Unit Payment',            true,   8),
  ('SALE_ADMINISTRATIVE_FEE',        'رسوم إدارية للبيع',        'Administrative Fee - Sale',     false,  9),
  ('TRANSFER_FEE',                   'رسوم نقل أو تنازل',        'Transfer Fee',                  false, 10),
  ('MANAGEMENT_FEE',                 'رسوم إدارة',              'Management Fee',                false, 11),
  ('MAINTENANCE_SERVICE',            'رسوم صيانة',              'Maintenance Fee',               false, 12),
  ('SECURITY_SERVICE',               'أمن وحراسة',              'Security Fee',                  false, 13),
  ('CLEANING_SERVICE',               'نظافة',                   'Cleaning Fee',                  false, 14),
  ('LANDSCAPING_SERVICE',            'تنسيق حدائق',             'Landscaping Fee',               false, 15),
  ('CLUB_OR_FACILITY_SERVICE',       'استخدام مرافق أو نادٍ',    'Facility / Club Fee',           false, 16),
  ('UTILITY_RECHARGE',               'إعادة تحميل مرافق',        'Utilities Recharge',            false, 17),
  ('UTILITY_ADMINISTRATION_FEE',     'رسوم إدارة مرافق',         'Utility Administration Fee',    false, 18),
  ('LATE_PAYMENT_PENALTY',           'غرامة تأخير',             'Late Payment Penalty',          false, 19),
  ('RESERVATION_CANCELLATION_FEE',   'رسوم إلغاء حجز',           'Reservation Cancellation Fee',  false, 20),
  ('REFUND_RENT',                    'رد إيجار',                'Refund - Rent',                 true,  21),
  ('REFUND_INSTALLMENT',             'رد قسط',                  'Refund - Installment',          true,  22),
  ('REFUND_SERVICE',                 'رد رسوم خدمة',            'Refund - Service',              true,  23),
  ('SECURITY_DEPOSIT',               'تأمين قابل للرد',          'Security Deposit',              false, 24),
  ('DEPOSIT_APPLIED_TO_SALE',        'تأمين محوَّل للبيع',        'Deposit Applied to Sale',       true,  25),
  ('DEPOSIT_FORFEITED',              'تأمين مصادَر',             'Deposit Forfeited',             false, 26),
  ('PARKING_FEE',                    'رسوم موقف سيارات',         'Parking Fee',                   false, 27),
  ('ACCESS_CARD_FEE',                'كارت دخول',               'Access Card Fee',               false, 28),
  ('REPLACEMENT_CARD_FEE',           'بدل فاقد',                'Replacement Card Fee',          false, 29),
  ('GUEST_SERVICE_FEE',              'خدمة للزائر',             'Guest Service Fee',             false, 30),
  ('RENTAL_MANAGEMENT_COMMISSION',   'عمولة إدارة تأجير',        'Rental Management Commission',  false, 31),
  ('BROKER_COMMISSION',              'عمولة وساطة',             'Broker / Commission Income',    false, 32),
  ('ADVERTISING_PROMOTION_FEE',      'إعلان أو ترويج',           'Advertising / Promotion Fee',   false, 33),
  ('EVENT_VENUE_FEE',                'تأجير مكان لحدث',          'Event / Venue Fee',             false, 34),
  ('CONTRACTOR_RECHARGE',            'تحميل تكلفة مقاول',        'Contractor Recharge',           false, 35),
  ('INTEREST_FINANCING_CHARGE',      'فوائد أو رسوم تمويل',      'Interest / Financing Charge',   false, 36),
  ('OWNER_ASSOCIATION_CONTRIBUTION', 'مساهمة اتحاد ملاك',        'Owners Association Contribution', false, 37)
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- ٢. القواعد الضريبية المؤرَّخة والمُصدَّرة
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.tax_rule_versions (
  id              uuid primary key default gen_random_uuid(),
  jurisdiction    text not null check (jurisdiction in ('EG', 'SA')),
  revenue_nature  text not null references public.revenue_natures(code),
  tax_treatment   text not null check (tax_treatment in
                    ('TAXABLE', 'EXEMPT', 'ZERO_RATED', 'OUT_OF_SCOPE', 'REVIEW_REQUIRED')),
  vat_rate        numeric(6,3),
  effective_from  date not null,
  effective_to    date,
  e_document_type text not null check (e_document_type in
                    ('E_INVOICE', 'E_RECEIPT', 'BY_CUSTOMER_TYPE', 'NONE', 'REVIEW_REQUIRED')),
  -- شرط الانطباق: مَن يجب أن يكون مقدّم الخدمة حتى تسري القاعدة.
  issuer_scope    text not null,
  version         integer not null check (version >= 1),
  rule_hash       text not null,
  status          text not null default 'DRAFT'
                    check (status in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  legal_reference text,
  approved_by     uuid,
  approved_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),

  -- التمييز الذي يفرضه القسم 6 من مصفوفة المستشار محفوظ بنيويًا: ثلاثة تصنيفات
  -- مختلفة قانونيًا لا يجوز أن تنهار إلى «النسبة صفر».
  constraint tax_rule_rate_matches_treatment check (
    (tax_treatment = 'TAXABLE'                          and vat_rate is not null and vat_rate > 0)
    or (tax_treatment in ('EXEMPT', 'ZERO_RATED')       and vat_rate = 0)
    or (tax_treatment in ('OUT_OF_SCOPE', 'REVIEW_REQUIRED') and vat_rate is null)
  ),
  constraint tax_rule_window_ordered check (effective_to is null or effective_to > effective_from),
  constraint tax_rule_approved_has_approver check (
    (status = 'DRAFT' and approved_by is null and approved_at is null)
    or (status in ('APPROVED', 'SUPERSEDED') and approved_by is not null and approved_at is not null)
  ),
  constraint tax_rule_unique_version unique (jurisdiction, revenue_nature, version)
);

-- لا تداخل زمني بين قاعدتين معتمدتين لنفس الاختصاص وطبيعة الإيراد. قيد استبعاد
-- في القاعدة لا تحقق تطبيقي: تحققٌ تطبيقي يمرّ من أي مسار كتابة آخر، وتداخلٌ
-- واحد يعني معاملة لها قاعدتان صالحتان بلا مُرجِّح.
alter table public.tax_rule_versions drop constraint if exists tax_rule_no_overlap;
alter table public.tax_rule_versions
  add constraint tax_rule_no_overlap
  exclude using gist (
    jurisdiction   with =,
    revenue_nature with =,
    daterange(effective_from, effective_to, '[)') with &&
  ) where (status = 'APPROVED');

create index if not exists idx_tax_rule_lookup
  on public.tax_rule_versions (jurisdiction, revenue_nature, effective_from desc)
  where status = 'APPROVED';

comment on table public.tax_rule_versions is
  'قواعد ضريبية مؤرَّخة السريان ومُصدَّرة. الصف المعتمد لا يُعدَّل — يُخلَف بإصدار جديد.';

-- البصمة تُحسب في القاعدة ولا تُقبل من العميل إطلاقًا.
--
-- **تستثني `effective_to` و`status` عمدًا.** إغلاق نافذة قاعدة عند خلافتها يغيّر
-- `effective_to`؛ لو دخل في البصمة لأصبح كل قرار تاريخي مختومًا بها فاسدًا لحظة
-- الخلافة — أي أن الآلية كانت ستهدم الضمان الذي وُجدت لأجله. البصمة تغطي مضمون
-- القرار لا نافذة صلاحيته.
create or replace function public.tax_rule_content_hash(
  p_jurisdiction text,
  p_revenue_nature text,
  p_tax_treatment text,
  p_vat_rate numeric,
  p_effective_from date,
  p_e_document_type text,
  p_issuer_scope text,
  p_version integer
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    digest(
      concat_ws('|',
        p_jurisdiction, p_revenue_nature, p_tax_treatment,
        coalesce(p_vat_rate::text, '~'), p_effective_from::text,
        p_e_document_type, p_issuer_scope, p_version::text
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.trg_tax_rule_set_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.rule_hash := public.tax_rule_content_hash(
    NEW.jurisdiction, NEW.revenue_nature, NEW.tax_treatment, NEW.vat_rate,
    NEW.effective_from, NEW.e_document_type, NEW.issuer_scope, NEW.version
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tax_rule_set_hash on public.tax_rule_versions;
create trigger trg_tax_rule_set_hash
  before insert or update on public.tax_rule_versions
  for each row execute function public.trg_tax_rule_set_hash();

-- الثابت الذي يجعل البقية حقيقية لا زخرفية. بصمة تشير إلى صف قابل للتحرير لا
-- تثبت شيئًا، فمنع تعديل المعتمد ليس تشديدًا إداريًا بل شرط صحة التصميم.
create or replace function public.trg_tax_rule_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- الحذف: الضمان المقصود هو ألا تُمحى قاعدة يستند إليها قرار مرحَّل — لا أن يكون
  -- كل صف أبديًا. قاعدة لم يُقرَّر تحتها شيء قط لا تحمل تاريخًا يُحمى، وحجب حذفها
  -- يجعل كل صف يُنشأ خطأً باقيًا إلى الأبد بلا مسار تصحيح. الحذف محكوم فوق ذلك
  -- بـRLS: لا سياسة حذف لأي مستأجر.
  if TG_OP = 'DELETE' then
    if exists (select 1 from public.tax_decisions where tax_rule_version_id = OLD.id) then
      raise exception
        'TAX_RULE_IMMUTABLE: قرارات ضريبية مرحَّلة تستند إلى هذه القاعدة؛ لا تُحذف'
        using errcode = '42501';
    end if;
    return OLD;
  end if;

  -- المسودة تُحرَّر بحرية؛ لم يُبنَ عليها قرار بعد.
  if OLD.status = 'DRAFT' then
    return NEW;
  end if;

  if OLD.status = 'SUPERSEDED' then
    raise exception 'TAX_RULE_IMMUTABLE: القاعدة المُخلَفة نهائية ولا تُعدَّل'
      using errcode = '42501';
  end if;

  -- من هنا: OLD.status = 'APPROVED'. التغيير الوحيد المسموح هو إغلاق النافذة.
  if (NEW.jurisdiction, NEW.revenue_nature, NEW.tax_treatment, NEW.vat_rate,
      NEW.effective_from, NEW.e_document_type, NEW.issuer_scope, NEW.version,
      NEW.rule_hash, NEW.legal_reference, NEW.approved_by, NEW.approved_at,
      NEW.created_by, NEW.created_at)
     is distinct from
     (OLD.jurisdiction, OLD.revenue_nature, OLD.tax_treatment, OLD.vat_rate,
      OLD.effective_from, OLD.e_document_type, OLD.issuer_scope, OLD.version,
      OLD.rule_hash, OLD.legal_reference, OLD.approved_by, OLD.approved_at,
      OLD.created_by, OLD.created_at)
  then
    raise exception
      'TAX_RULE_IMMUTABLE: لا يُعدَّل مضمون قاعدة معتمدة؛ أنشئ إصدارًا جديدًا'
      using errcode = '42501';
  end if;

  if NEW.status not in ('APPROVED', 'SUPERSEDED') then
    raise exception 'TAX_RULE_IMMUTABLE: انتقال حالة غير مسموح (% ← %)', OLD.status, NEW.status
      using errcode = '42501';
  end if;

  -- النافذة تُغلق مرة واحدة ولا تُعاد فتحها.
  if OLD.effective_to is not null and NEW.effective_to is distinct from OLD.effective_to then
    raise exception 'TAX_RULE_IMMUTABLE: نافذة السريان مغلقة بالفعل ولا تُعدَّل'
      using errcode = '42501';
  end if;

  if OLD.effective_to is not null and NEW.effective_to is null then
    raise exception 'TAX_RULE_IMMUTABLE: لا تُعاد نافذة السريان إلى الانفتاح'
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_tax_rule_immutable on public.tax_rule_versions;
create trigger trg_tax_rule_immutable
  before update or delete on public.tax_rule_versions
  for each row execute function public.trg_tax_rule_immutable();

-- ═══════════════════════════════════════════════════════════════════════
-- ٣. الربط الصريح: نوع المستحق ← طبيعة الإيراد
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.due_type_revenue_natures (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  due_type_id     uuid not null references public.due_types(id) on delete cascade,
  revenue_nature  text not null references public.revenue_natures(code),
  status          text not null default 'REVIEW_REQUIRED'
                    check (status in ('REVIEW_REQUIRED', 'APPROVED')),
  notes           text,
  approved_by     uuid,
  approved_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint due_type_nature_unique unique (organization_id, due_type_id),
  constraint due_type_nature_approved_has_approver check (
    (status = 'REVIEW_REQUIRED' and approved_by is null and approved_at is null)
    or (status = 'APPROVED' and approved_by is not null and approved_at is not null)
  )
);

comment on table public.due_type_revenue_natures is
  'ربط صريح لكل مستأجر بين نوع المستحق النصي الحر وطبيعة الإيراد. غياب الصف = REVIEW_REQUIRED. لا يُشتق من الاسم إطلاقًا.';

-- ═══════════════════════════════════════════════════════════════════════
-- ٤. بصمة القرار الضريبي — على جدول مستقل، و`dues` لم يُمَس
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.tax_decisions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  source_type          text not null check (source_type in
                         ('DUE', 'SERVICE_CHARGE_LEVY', 'COMMISSION', 'SUPPLIER_INVOICE', 'PAYMENT_RECEIPT')),
  source_id            uuid not null,
  revenue_nature       text not null references public.revenue_natures(code),
  jurisdiction         text not null check (jurisdiction in ('EG', 'SA')),
  transaction_date     date not null,
  tax_rule_version_id  uuid not null references public.tax_rule_versions(id),
  tax_rule_hash        text not null,
  -- يصمد وحده لو فُقد جدول القواعد كليًا.
  tax_decision_snapshot jsonb not null,
  decided_by           uuid,
  decided_at           timestamptz not null default now(),
  constraint tax_decision_one_per_source unique (source_type, source_id)
);

comment on table public.tax_decisions is
  'بصمة القرار الضريبي لكل معاملة. لا تُعدَّل ولا تُحذف — القرار التاريخي لا يتحرك بتعديل قاعدة.';

create index if not exists idx_tax_decisions_org on public.tax_decisions (organization_id);
create index if not exists idx_tax_decisions_rule on public.tax_decisions (tax_rule_version_id);

-- يحجب التعديل وحده، لا الحذف — وهذا مقصود. ضمان ADR 0003 أن القرار التاريخي
-- **لا يتغيّر**، لا أن الصف أبدي. وحجب الحذف هنا يجعل حذف مستأجر مستحيلًا عبر
-- المفتاح المتتالي، فيتحول ضمان محاسبي إلى عطل تشغيلي. الحذف محكوم بـRLS: لا
-- سياسة حذف لأي مستأجر، فلا مسار حذف من داخل المنتج أصلًا.
create or replace function public.trg_tax_decision_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'TAX_DECISION_IMMUTABLE: القرار الضريبي المسجَّل لا يُعدَّل'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_tax_decision_immutable on public.tax_decisions;
create trigger trg_tax_decision_immutable
  before update on public.tax_decisions
  for each row execute function public.trg_tax_decision_immutable();

-- ═══════════════════════════════════════════════════════════════════════
-- ٥. الصلاحيات و RLS
-- ═══════════════════════════════════════════════════════════════════════

insert into public.permissions (key, description) values
  ('finance.tax_mapping.read',   'الاطلاع على ربط أنواع المستحقات بطبيعة الإيراد والقرارات الضريبية'),
  ('finance.tax_mapping.manage', 'ربط أنواع المستحقات بطبيعة الإيراد واعتمادها')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key) values
  ('TENANT_OWNER',    'finance.tax_mapping.read'),
  ('TENANT_OWNER',    'finance.tax_mapping.manage'),
  ('FINANCE_MANAGER', 'finance.tax_mapping.read'),
  ('FINANCE_MANAGER', 'finance.tax_mapping.manage'),
  ('ACCOUNTANT',      'finance.tax_mapping.read'),
  ('ACCOUNTANT',      'finance.tax_mapping.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.tax_mapping.read', 'finance.tax_mapping.manage')
on conflict do nothing;

alter table public.revenue_natures          enable row level security;
alter table public.tax_rule_versions        enable row level security;
alter table public.due_type_revenue_natures enable row level security;
alter table public.tax_decisions            enable row level security;

-- القاموس والقواعد بيانات مرجعية على مستوى النظام: تُقرأ من أي مستأجر، ولا
-- تُكتب إلا عبر RPC محكوم بمشرف المنصة. لا سياسة كتابة هنا عمدًا.
drop policy if exists revenue_natures_select on public.revenue_natures;
create policy revenue_natures_select on public.revenue_natures
  for select to authenticated using (true);

drop policy if exists tax_rule_versions_select on public.tax_rule_versions;
create policy tax_rule_versions_select on public.tax_rule_versions
  for select to authenticated using (status <> 'DRAFT' or public.is_platform_admin(auth.uid()));

drop policy if exists due_type_revenue_natures_select on public.due_type_revenue_natures;
create policy due_type_revenue_natures_select on public.due_type_revenue_natures
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.manage')
  );

drop policy if exists tax_decisions_select on public.tax_decisions;
create policy tax_decisions_select on public.tax_decisions
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.tax_mapping.manage')
  );

-- ═══════════════════════════════════════════════════════════════════════
-- ٦. RPCs — إدارة القواعد (مشرف المنصة وحده)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_tax_rule_draft(
  p_jurisdiction text,
  p_revenue_nature text,
  p_tax_treatment text,
  p_vat_rate numeric,
  p_effective_from date,
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
  v_is_derived boolean;
  v_version integer;
  v_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: إدارة القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  select is_derived into v_is_derived from public.revenue_natures where code = p_revenue_nature;
  if v_is_derived is null then
    raise exception 'REVENUE_NATURE_UNKNOWN: طبيعة إيراد غير معروفة (%)', p_revenue_nature
      using errcode = '22023';
  end if;

  -- النوع المشتق يرث ولا يُحسم، فوضع قاعدة مباشرة له تناقض للنموذج نفسه.
  if v_is_derived then
    raise exception
      'REVENUE_NATURE_DERIVED: (%) نوع مشتق يرث التوريد الأصلي؛ لا تُوضع له قاعدة مستقلة', p_revenue_nature
      using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.tax_rule_versions
  where jurisdiction = p_jurisdiction and revenue_nature = p_revenue_nature;

  insert into public.tax_rule_versions (
    jurisdiction, revenue_nature, tax_treatment, vat_rate, effective_from,
    e_document_type, issuer_scope, version, rule_hash, status, legal_reference, created_by
  ) values (
    p_jurisdiction, p_revenue_nature, p_tax_treatment, p_vat_rate, p_effective_from,
    p_e_document_type, p_issuer_scope, v_version, '', 'DRAFT', p_legal_reference, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.approve_tax_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: اعتماد القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  update public.tax_rule_versions
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now()
  where id = p_rule_id and status = 'DRAFT';

  if not found then
    raise exception 'TAX_RULE_NOT_DRAFT: لا توجد مسودة بهذا المعرّف' using errcode = 'P0002';
  end if;
end;
$$;

-- الخلافة: تُغلق نافذة المعتمدة وتُنشئ إصدارًا جديدًا معتمدًا يبدأ من تاريخ
-- الإغلاق. عملية واحدة لأن الحالتين الوسيطتين (نافذتان مفتوحتان، أو فجوة بلا
-- قاعدة) كلتاهما غير صالحة.
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
-- ٧. RPCs — الربط والقرار
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.set_due_type_revenue_nature(
  p_due_type_id uuid,
  p_revenue_nature text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
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

  -- الربط الجديد أو المعدَّل يعود دائمًا إلى المراجعة: تغيير الطبيعة قرار ضريبي
  -- لا إعداد، ولا يجوز أن يرث اعتماد الربط السابق.
  insert into public.due_type_revenue_natures (
    organization_id, due_type_id, revenue_nature, status, notes, created_by
  ) values (
    v_org, p_due_type_id, p_revenue_nature, 'REVIEW_REQUIRED', p_notes, auth.uid()
  )
  on conflict (organization_id, due_type_id) do update
  set revenue_nature = excluded.revenue_nature,
      notes          = excluded.notes,
      status         = 'REVIEW_REQUIRED',
      approved_by    = null,
      approved_at    = null,
      updated_at     = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.approve_due_type_revenue_nature(p_mapping_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.due_type_revenue_natures where id = p_mapping_id;
  if v_org is null then
    raise exception 'TAX_MAPPING_NOT_FOUND: الربط غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك باعتماد الربط' using errcode = '42501';
  end if;

  update public.due_type_revenue_natures
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_mapping_id;
end;
$$;

-- اختيار القاعدة **بتاريخ المعاملة لا بتاريخ الترحيل**. ترحيل متأخر لمعاملة
-- قديمة يلتقط قاعدة فترتها هو، وهذا هو الفرق بين سجل قابل لإعادة الإنتاج وسجل
-- يُعاد كتابته كلما تغيّر التشريع.
create or replace function public.resolve_tax_rule(
  p_jurisdiction text,
  p_revenue_nature text,
  p_transaction_date date
)
returns public.tax_rule_versions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.tax_rule_versions
  where jurisdiction = p_jurisdiction
    and revenue_nature = p_revenue_nature
    and status in ('APPROVED', 'SUPERSEDED')
    and effective_from <= p_transaction_date
    and (effective_to is null or effective_to > p_transaction_date)
  order by effective_from desc
  limit 1;
$$;

-- الحاجز. يرفض الترحيل عند أي حلقة غير محسومة، ويسجّل القرار بصمةً لا تتحرك.
create or replace function public.record_tax_decision(
  p_source_type text,
  p_source_id uuid,
  p_due_type_id uuid,
  p_jurisdiction text,
  p_transaction_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_map record;
  v_rule public.tax_rule_versions;
  v_id uuid;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بتسجيل قرار ضريبي' using errcode = '42501';
  end if;

  select * into v_map
  from public.due_type_revenue_natures
  where organization_id = v_org and due_type_id = p_due_type_id;

  -- غياب الصف وغياب الاعتماد كلاهما «غير محسوم». الاسم النصي لا يُستنطق.
  if v_map.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: نوع المستحق غير مربوط بطبيعة إيراد؛ الربط الصريح مطلوب قبل الترحيل'
      using errcode = 'P0001';
  end if;
  if v_map.status <> 'APPROVED' then
    raise exception 'TAX_REVIEW_REQUIRED: ربط نوع المستحق لم يُعتمد بعد' using errcode = 'P0001';
  end if;

  select * into v_rule
  from public.resolve_tax_rule(p_jurisdiction, v_map.revenue_nature, p_transaction_date);

  if v_rule.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: لا توجد قاعدة ضريبية معتمدة لـ(%) في (%) بتاريخ %',
      v_map.revenue_nature, p_jurisdiction, p_transaction_date
      using errcode = 'P0001';
  end if;

  if v_rule.tax_treatment = 'REVIEW_REQUIRED' then
    raise exception
      'TAX_REVIEW_REQUIRED: المعالجة الضريبية لـ(%) ما تزال قيد المراجعة', v_map.revenue_nature
      using errcode = 'P0001';
  end if;

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot, decided_by
  ) values (
    v_org, p_source_type, p_source_id, v_map.revenue_nature, p_jurisdiction,
    p_transaction_date, v_rule.id, v_rule.rule_hash,
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
      'decided_at',      now()
    ),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_tax_rule_draft(text, text, text, numeric, date, text, text, text) from public;
revoke all on function public.approve_tax_rule(uuid) from public;
revoke all on function public.supersede_tax_rule(uuid, date, text, numeric, text, text, text) from public;
grant execute on function public.create_tax_rule_draft(text, text, text, numeric, date, text, text, text) to authenticated;
grant execute on function public.approve_tax_rule(uuid) to authenticated;
grant execute on function public.supersede_tax_rule(uuid, date, text, numeric, text, text, text) to authenticated;
