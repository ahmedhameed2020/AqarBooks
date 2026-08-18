-- إصدار المستند الإلكتروني: الترقيم، والمصدر المبني من القرار المختوم.
--
-- المسار كان مبنيًا بالكامل قبل هذا الملف — السجل، والحالة، وعدم التكرار،
-- والمحوّل، وسلطة وهمية للاختبار. الناقص شيئان فقط: **رقم للمستند**، و**دالة
-- تبني المستند من القرار الضريبي**. هذا الملف يضيفهما، ولا يُرسل شيئًا.
--
-- ═══ الترقيم بلا فجوات ═══
--
-- عدّاد في جدول يُقفل بـ`for update` داخل معاملة المستند، لا `sequence`. الفرق
-- أن الـ`sequence` **لا يتراجع**: معاملة تفشل بعد أخذ الرقم تترك فجوة دائمة في
-- ترقيم فواتير ضريبية — وهي سؤال أمام أي فحص. والقفل هنا يعيد الرقم مع التراجع.
--
-- ورقم واحد لكل مصدر عبر `document_numbers`: إعادة بناء المستند نفسه تعيد رقمه
-- ولا تحرق رقمًا جديدًا في كل محاولة.
--
-- ═══ المستند يُبنى من اللقطة لا من الحاضر ═══
--
-- `get_einvoice_source_for_due` تقرأ `tax_decision_snapshot` لا صفوف اليوم:
-- عميل تغيّر اسمه أو رقمه بعد الإصدار، أو قاعدة خُلِفت، أو ربط أُعيدت مراجعته —
-- لا شيء منها يجوز أن يغيّر مستندًا صدر. وهذا ما يجعل إعادة إنتاج أي فاتورة
-- ممكنة بعد سنوات.
--
-- ═══ نوع المستند مُشتق لا مُخمَّن ═══
--
-- `e_document_type` في القاعدة يقول `E_INVOICE` أو `E_RECEIPT` أو
-- `BY_CUSTOMER_TYPE` — والأخير يعني أن **تصنيف المشتري** هو الحاسم: منشأة
-- ⇒ فاتورة، فرد ⇒ إيصال. والفاتورة بين المنشآت ترفض بلا رقم تسجيل المشتري.
--
-- ═══ ما يبقى ناقصًا للسلطة الحقيقية ═══
--
-- **كود الصنف**: ETA تشترط EGS/GS1 ولا مسار نصًا حرًا، ولا يحمله النظام بعد —
-- فيُترك `null` صراحةً بدل ملئه بما يبدو معقولًا، ومحوّل ETA حقيقي يجب أن يرفض
-- عليه. وكذلك التوقيع والإرسال يبقيان محجوبين باعتماد preprod والشهادة وموقع
-- خدمة التوقيع (ADR 0001).

create table if not exists public.document_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type   text not null check (document_type in ('INVOICE', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  year            integer not null,
  next_number     integer not null default 1 check (next_number >= 1),
  primary key (organization_id, document_type, year)
);

comment on table public.document_number_counters is
  'عدّاد ترقيم المستندات لكل مؤسسة ونوع وسنة. يُقفل الصف داخل المعاملة، فالتراجع يعيد الرقم ولا يترك فجوة.';

create table if not exists public.document_numbers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type   text not null,
  source_type     text not null,
  source_id       uuid not null,
  year            integer not null,
  sequence_number integer not null,
  document_number text not null,
  issued_at       timestamptz not null default now(),
  constraint document_numbers_unique_source unique (organization_id, source_type, source_id),
  constraint document_numbers_unique_number unique (organization_id, document_type, year, sequence_number)
);

alter table public.document_numbers enable row level security;
alter table public.document_number_counters enable row level security;

drop policy if exists document_numbers_select on public.document_numbers;
create policy document_numbers_select on public.document_numbers
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
  );

create or replace function public.allocate_document_number(
  p_organization_id uuid,
  p_document_type text,
  p_source_type text,
  p_source_id uuid,
  p_issue_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from p_issue_date)::integer;
  v_existing text;
  v_seq integer;
  v_number text;
begin
  select document_number into v_existing
  from public.document_numbers
  where organization_id = p_organization_id
    and source_type = p_source_type and source_id = p_source_id;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.document_number_counters (organization_id, document_type, year, next_number)
  values (p_organization_id, p_document_type, v_year, 1)
  on conflict (organization_id, document_type, year) do nothing;

  select next_number into v_seq
  from public.document_number_counters
  where organization_id = p_organization_id
    and document_type = p_document_type and year = v_year
  for update;

  update public.document_number_counters
  set next_number = next_number + 1
  where organization_id = p_organization_id
    and document_type = p_document_type and year = v_year;

  v_number := case p_document_type
                when 'INVOICE' then 'INV'
                when 'RECEIPT' then 'RCT'
                when 'CREDIT_NOTE' then 'CRN'
                else 'DBN' end
              || '-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into public.document_numbers (
    organization_id, document_type, source_type, source_id, year, sequence_number, document_number
  ) values (
    p_organization_id, p_document_type, p_source_type, p_source_id, v_year, v_seq, v_number
  );

  return v_number;
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
  v_decision record;
  v_snap jsonb;
  v_doc_type text;
  v_number text;
  v_decimals integer;
begin
  select d.id, d.organization_id, d.description, d.issue_date, d.amount, d.status
  into v_due
  from public.dues d where d.id = p_due_id;

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
      'description', coalesce(v_due.description, v_snap->>'revenue_nature'),
      -- ETA تشترط EGS/GS1 ولا مسار نصًا حرًا. لا يحمله النظام بعد، فيبقى null
      -- صراحةً — ومحوّل ETA حقيقي يجب أن يرفض عليه لا أن يملأه.
      'itemCode', null,
      'quantity', 1,
      'unitCode', 'EA',
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
