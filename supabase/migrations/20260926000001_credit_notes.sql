-- إشعارات الخصم — تصحيح مستند صادر.
--
-- ═══ ما يفصل الإشعار عن «فاتورة سالبة» ═══
--
-- ثلاث قواعد من بحث المستندات (قرار 0007)، وكلها مفروضة هنا لا موصوفة:
--
--   ١. **يشير إلى أصله دائمًا** — `source_id` و`tax_decision_id` إلزاميان.
--      مستند تصحيح بلا مستند يصحّحه ليس إشعارًا بل قيدًا يتيمًا.
--   ٢. **لا يتجاوز إجمالي أصله** — `creditable_remaining` تحسب المتبقي،
--      والتجاوز يُرفض برقمه لا بكلمة، والقفل على المستحق يمنع إشعارين متوازيين
--      يتجاوز مجموعهما الأصل وكلٌّ منهما يرى المتبقي قبل الآخر.
--   ٣. **يعكس المعالجة الضريبية بقاعدة الأصل لا بقاعدة اليوم** — تشريع جديد بعد
--      الإصدار لا يجوز أن يغيّر ضريبة إشعار يصحّح فاتورة قديمة. النسبة تُقرأ من
--      لقطة القرار المختوم.
--
-- ═══ القيد ═══
--
-- عكس القيد الأصلي حرفيًا: الإيراد بالصافي مدينًا، وضريبة المخرجات مدينةً،
-- والذمم دائنةً بالإجمالي — على **الحساب المختوم في القرار** لا على حساب يُحلّ
-- وقت الإصدار. والمعفى قيده طرفان لا ثلاثة.
--
-- ═══ عيب اكتشفه الاختبار أثناء البناء ═══
--
-- `document_numbers` فريد لكل (مؤسسة، نوع مصدر، معرّف مصدر) — وهو صحيح للفاتورة
-- إذ لكل مستحق فاتورة واحدة. لكن المستحق قد يُخصم **على دفعات**، فتخصيص الرقم
-- بالمستحق أعاد الرقم نفسه للإشعار الثاني، فأعاد `create_journal_entry_internal`
-- القيد الأول ثم رفض `post_journal_entry_internal` ترحيله مرتين. الرقم يُخصَّص
-- الآن **للإشعار نفسه**، ومفتاح التكرار معه.
--
-- ═══ ما لا يزال ناقصًا ═══
--
-- إشعار الإضافة (`DEBIT_NOTE`) مُعرَّف في النوع ولم يُبنَ مساره: حالته المحاسبية
-- ليست عكس الخصم بل زيادة على الأصل، وشرطها مختلف. ويبقى `correctsAuthorityUuid`
-- فارغًا حتى يُرسَل الأصل ويُقبل — والسلطة ترفض تصحيحًا بلا أصل، فغيابه معلومة
-- لا سهو.


create table if not exists public.credit_notes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  document_type        text not null default 'CREDIT_NOTE'
                         check (document_type in ('CREDIT_NOTE', 'DEBIT_NOTE')),
  document_number      text not null,
  source_type          text not null default 'DUE' check (source_type in ('DUE')),
  source_id            uuid not null,
  tax_decision_id      uuid not null references public.tax_decisions(id),
  credit_date          date not null,
  gross_amount         numeric(19,4) not null check (gross_amount > 0),
  taxable_base         numeric(19,4) not null,
  vat_amount           numeric(19,4) not null check (vat_amount >= 0),
  reason               text not null,
  journal_entry_id     uuid references public.journal_entries(id),
  decision_snapshot    jsonb not null,
  issued_by            uuid,
  issued_at            timestamptz not null default now(),
  constraint credit_note_amounts_add_up check (gross_amount = taxable_base + vat_amount),
  constraint credit_note_reason_present check (nullif(btrim(reason), '') is not null),
  constraint credit_note_number_unique unique (organization_id, document_number)
);

comment on table public.credit_notes is
  'إشعار خصم/إضافة يصحّح مستندًا صادرًا. ليس فاتورة سالبة: يشير إلى أصله، ولا يتجاوز إجماليه، ويعكس معالجته الضريبية بقاعدتها الأصلية.';

create index if not exists idx_credit_notes_source on public.credit_notes (source_type, source_id);
create index if not exists idx_credit_notes_org on public.credit_notes (organization_id);

alter table public.credit_notes enable row level security;

drop policy if exists credit_notes_select on public.credit_notes;
create policy credit_notes_select on public.credit_notes
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.dues.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
  );

create or replace function public.trg_credit_note_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'CREDIT_NOTE_IMMUTABLE: الإشعار الصادر لا يُعدَّل؛ يُصحَّح بإشعار آخر'
    using errcode = '42501';
end;
$fn$;

drop trigger if exists trg_credit_note_immutable on public.credit_notes;
create trigger trg_credit_note_immutable
  before update on public.credit_notes
  for each row execute function public.trg_credit_note_immutable();

-- المتبقي القابل للخصم. دالة مستقلة لأن الواجهة تحتاجها قبل الإصدار والحارس
-- أثناءه — وحساب مكرر في موضعين ينحرف عند أول تعديل.
create or replace function public.creditable_remaining(p_due_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select td.gross_amount
     from public.tax_decisions td
     where td.source_type = 'DUE' and td.source_id = p_due_id
       and td.reverses_decision_id is null
       and not exists (
         select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
     order by td.decided_at desc limit 1), 0)
  - coalesce(
    (select sum(cn.gross_amount) from public.credit_notes cn
     where cn.source_type = 'DUE' and cn.source_id = p_due_id
       and cn.document_type = 'CREDIT_NOTE'), 0);
$fn$;

create or replace function public.issue_credit_note(
  p_due_id uuid,
  p_gross_amount numeric,
  p_reason text,
  p_credit_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_due record;
  v_decision record;
  v_snap jsonb;
  v_org record;
  v_decimals integer;
  v_remaining numeric(19,4);
  v_gross numeric(19,4);
  v_vat numeric(19,4);
  v_base numeric(19,4);
  v_rate numeric;
  v_number text;
  v_period uuid;
  v_entry uuid;
  v_id uuid := gen_random_uuid();
begin
  select d.id, d.organization_id, d.property_id, d.issue_date, d.receivable_account_id,
         dt.default_revenue_account_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_due.organization_id, 'finance.entries.reverse') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار إشعارات خصم'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'CREDIT_NOTE_REASON_REQUIRED: الإشعار يحتاج سببًا' using errcode = '22023';
  end if;

  if coalesce(p_gross_amount, 0) <= 0 then
    raise exception 'CREDIT_NOTE_AMOUNT_INVALID: قيمة الإشعار يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  select td.* into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;

  if v_decision.id is null then
    raise exception
      'TAX_DECISION_MISSING: لا إشعار خصم بلا قرار ضريبي مختوم للأصل'
      using errcode = 'P0001';
  end if;

  -- القفل على المستحق يمنع إشعارين متوازيين يتجاوز مجموعهما الأصل، وكلٌّ منهما
  -- يرى المتبقي قبل الآخر.
  perform 1 from public.dues where id = p_due_id for update;

  v_remaining := public.creditable_remaining(p_due_id);
  select o.default_currency into v_org from public.organizations o
  where o.id = v_due.organization_id;
  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));
  v_gross := round(p_gross_amount, v_decimals);

  if v_gross > v_remaining then
    raise exception
      'CREDIT_NOTE_EXCEEDS_ORIGINAL: قيمة الإشعار (%) تتجاوز المتبقي من الأصل (%)',
      v_gross, v_remaining using errcode = 'P0001';
  end if;

  v_snap := v_decision.tax_decision_snapshot;

  -- الضريبة تُعكس بقاعدة الأصل لا بقاعدة اليوم: الإشعار يصحّح ما وقع ولا يُعيد
  -- تقييمه بتشريع لاحق.
  v_rate := coalesce((v_snap->>'vat_rate')::numeric, 0);
  if coalesce(v_decision.vat_amount, 0) > 0 and v_rate > 0 then
    v_vat := round(v_gross * v_rate / (100 + v_rate), v_decimals);
  else
    v_vat := 0;
  end if;
  v_base := v_gross - v_vat;

  -- الرقم للإشعار نفسه لا للمستحق: المستحق قد يُخصم على دفعات.
  v_number := public.allocate_document_number(
    v_due.organization_id, 'CREDIT_NOTE', 'CREDIT_NOTE', v_id, p_credit_date);

  select fp.id into v_period
  from public.fiscal_periods fp
  where fp.organization_id = v_due.organization_id
    and fp.status = 'OPEN'
    and p_credit_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period is not null then
    v_entry := public.create_journal_entry_internal(
      v_due.organization_id, v_due.property_id, v_period, p_credit_date,
      'إشعار خصم ' || v_number, 'JOURNAL_VOUCHER',
      case when v_vat > 0 then
        jsonb_build_array(
          jsonb_build_object('account_id', v_due.default_revenue_account_id,
                             'debit', v_base, 'credit', 0),
          jsonb_build_object('account_id', v_decision.output_tax_account_id,
                             'debit', v_vat, 'credit', 0),
          jsonb_build_object('account_id', v_due.receivable_account_id,
                             'debit', 0, 'credit', v_gross))
      else
        jsonb_build_array(
          jsonb_build_object('account_id', v_due.default_revenue_account_id,
                             'debit', v_gross, 'credit', 0),
          jsonb_build_object('account_id', v_due.receivable_account_id,
                             'debit', 0, 'credit', v_gross))
      end,
      'credit_note:' || v_id::text
    );
    perform public.post_journal_entry_internal(v_entry);
  end if;

  insert into public.credit_notes (
    id, organization_id, document_type, document_number, source_type, source_id,
    tax_decision_id, credit_date, gross_amount, taxable_base, vat_amount,
    reason, journal_entry_id, decision_snapshot, issued_by
  ) values (
    v_id, v_due.organization_id, 'CREDIT_NOTE', v_number, 'DUE', p_due_id,
    v_decision.id, p_credit_date, v_gross, v_base, v_vat,
    btrim(p_reason), v_entry,
    jsonb_build_object(
      'corrects_document_for_due', p_due_id,
      'original_gross', v_decision.gross_amount,
      'original_taxable_base', v_decision.taxable_base,
      'original_vat', v_decision.vat_amount,
      'tax_treatment', v_snap->>'tax_treatment',
      'vat_rate', v_rate,
      'revenue_nature', v_decision.revenue_nature,
      'buyer_legal_name', v_snap->>'buyer_legal_name',
      'buyer_tax_registration_number', v_snap->>'buyer_tax_registration_number',
      'output_tax_account_id', v_decision.output_tax_account_id,
      'remaining_before', v_remaining,
      'remaining_after', v_remaining - v_gross,
      'issued_at', now()
    ),
    auth.uid()
  );

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_due.organization_id, 'credit_note.issued', 'credit_note', v_id,
    btrim(p_reason),
    jsonb_build_object(
      'document_number', v_number, 'source_id', p_due_id,
      'gross_amount', v_gross, 'taxable_base', v_base, 'vat_amount', v_vat,
      'remaining_after', v_remaining - v_gross, 'journal_entry_id', v_entry
    )
  );

  return v_id;
end;
$fn$;

-- مصدر المستند الإلكتروني للإشعار: يحمل مرجع الأصل لدى السلطة، فتربطه به.
create or replace function public.get_einvoice_source_for_credit_note(p_credit_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cn record;
  v_org record;
  v_snap jsonb;
  v_decimals integer;
  v_original_uuid text;
begin
  select * into v_cn from public.credit_notes where id = p_credit_note_id;
  if v_cn.id is null then
    raise exception 'CREDIT_NOTE_NOT_FOUND: الإشعار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_cn.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار مستندات إلكترونية'
      using errcode = '42501';
  end if;

  select o.name, o.tax_id, o.tax_jurisdiction, o.default_currency,
         o.governorate, o.city, o.address
  into v_org from public.organizations o where o.id = v_cn.organization_id;

  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));
  v_snap := v_cn.decision_snapshot;

  -- مرجع الأصل لدى السلطة، إن كان الأصل قد أُرسل وقُبل. غيابه لا يمنع بناء
  -- الإشعار محليًا لكنه يمنع إرساله — والسلطة ترفض تصحيحًا بلا أصل، فغيابه
  -- معلومة لا سهو.
  select ed.authority_uuid into v_original_uuid
  from public.einvoice_documents ed
  where ed.source_type = 'DUE' and ed.source_id = v_cn.source_id
    and ed.status = 'ACCEPTED'
  order by ed.created_at desc limit 1;

  return jsonb_build_object(
    'documentType', 'CREDIT_NOTE',
    'documentNumber', v_cn.document_number,
    'issuedAt', v_cn.credit_date,
    'currency', coalesce(v_org.default_currency, 'EGP'),
    'currencyDecimals', v_decimals,
    'correctsAuthorityUuid', v_original_uuid,
    'seller', jsonb_build_object(
      'name', v_org.name, 'taxId', v_org.tax_id,
      'countryCode', case when v_org.tax_jurisdiction = 'SA' then 'SA' else 'EG' end,
      'governorate', v_org.governorate, 'city', v_org.city, 'street', v_org.address
    ),
    'buyer', jsonb_build_object(
      'name', coalesce(v_snap->>'buyer_legal_name', 'غير محدد'),
      'taxId', v_snap->>'buyer_tax_registration_number',
      'countryCode', 'EG'
    ),
    'lines', jsonb_build_array(jsonb_build_object(
      'description', 'إشعار خصم — ' || v_cn.reason,
      'itemCode', null,
      'quantity', 1,
      'unitCode', 'EA',
      'unitPrice', v_cn.taxable_base,
      'discount', 0,
      'taxRate', coalesce((v_snap->>'vat_rate')::numeric, 0),
      'taxAmount', v_cn.vat_amount,
      'lineTotal', v_cn.gross_amount
    )),
    'totals', jsonb_build_object(
      'netAmount', v_cn.taxable_base,
      'discountAmount', 0,
      'taxAmount', v_cn.vat_amount,
      'grandTotal', v_cn.gross_amount
    ),
    'notes', v_cn.reason
  );
end;
$fn$;
