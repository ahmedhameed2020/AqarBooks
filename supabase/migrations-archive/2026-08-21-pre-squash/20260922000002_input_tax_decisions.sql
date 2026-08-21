-- قرار ضريبة المدخلات — تسجيل بلا ترحيل.
-- (الجزء الأول في 20260922000001 — نموذج الأهلية والحسابات.)
--
-- جدول منفصل عن `tax_decisions` عمدًا: قرار المخرجات يحمل **طبيعة إيراد**، وهي
-- لا معنى لها في مشترى. وهذا يؤكد التضييق السابق لـ`source_type` إلى `DUE`
-- بدل أن ينقضه: المبيعات والمشتريات قراران مختلفان لا وجهان لقرار واحد.
--
-- والترحيل المحاسبي **ليس هنا** بقرار معتمد: تُصمَّم الأهلية أولًا ثم تُبنى
-- القيود عليها. فما يُسجَّل الآن هو الأساس والضريبة والتقسيم والحساب المستهدف،
-- ولا يُكتب قيد بعد.

create table if not exists public.input_tax_decisions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  source_type            text not null check (source_type in ('SUPPLIER_INVOICE')),
  source_id              uuid not null,
  supplier_id            uuid references public.suppliers(id),
  expense_account_id     uuid not null references public.chart_of_accounts(id),
  invoice_number         text not null,
  invoice_date           date not null,
  supply_date            date,
  gross_amount           numeric(19,4) not null,
  taxable_base           numeric(19,4) not null,
  tax_amount             numeric(19,4) not null,
  recoverability         text not null
                           check (recoverability in ('FULLY_RECOVERABLE', 'NON_RECOVERABLE', 'MIXED')),
  recoverable_ratio      numeric(7,4),
  recoverable_amount     numeric(19,4) not null,
  non_recoverable_amount numeric(19,4) not null,
  input_tax_account_id   uuid references public.chart_of_accounts(id),
  decision_snapshot      jsonb not null,
  reverses_decision_id   uuid references public.input_tax_decisions(id),
  replaces_decision_id   uuid references public.input_tax_decisions(id),
  reason                 text,
  decided_by             uuid,
  decided_at             timestamptz not null default now(),
  -- الجزء القابل وغير القابل يستوعبان الضريبة كاملةً بالبناء لا بالحساب.
  constraint input_tax_split_exhausts_tax check (
    recoverable_amount + non_recoverable_amount = tax_amount
    and recoverable_amount >= 0 and non_recoverable_amount >= 0
  ),
  constraint input_tax_base_plus_tax check (gross_amount = taxable_base + tax_amount),
  -- لا أصل ضريبة مدخلات إن لم يكن هناك جزء قابل للاسترداد، ولا العكس.
  constraint input_tax_account_only_when_recoverable check (
    (recoverable_amount > 0 and input_tax_account_id is not null)
    or (recoverable_amount = 0 and input_tax_account_id is null)
  ),
  constraint input_tax_reversed_once unique (reverses_decision_id),
  constraint input_tax_replaced_once unique (replaces_decision_id),
  constraint input_tax_reversal_has_reason check (
    reverses_decision_id is null or nullif(btrim(reason), '') is not null
  ),
  constraint input_tax_not_both_links check (
    reverses_decision_id is null or replaces_decision_id is null
  )
);

comment on table public.input_tax_decisions is
  'قرار ضريبة المدخلات لكل فاتورة مورد. غير قابل للتعديل — التصحيح بقيد عكسي كقرارات المخرجات.';

create index if not exists idx_input_tax_decisions_org on public.input_tax_decisions (organization_id);
create index if not exists idx_input_tax_decisions_source
  on public.input_tax_decisions (source_type, source_id);

alter table public.input_tax_decisions enable row level security;

drop policy if exists input_tax_decisions_select on public.input_tax_decisions;
create policy input_tax_decisions_select on public.input_tax_decisions
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.accounts.view')
    or public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage')
  );

create or replace function public.trg_input_tax_decision_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'INPUT_TAX_DECISION_IMMUTABLE: قرار ضريبة المدخلات المسجَّل لا يُعدَّل'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_input_tax_decision_immutable on public.input_tax_decisions;
create trigger trg_input_tax_decision_immutable
  before update on public.input_tax_decisions
  for each row execute function public.trg_input_tax_decision_immutable();

-- كل شيء يُشتق من صف الفاتورة، ولا يقبل المستدعي إلا معرّفها — الدرس نفسه من
-- مراجعة عقد قرار المخرجات.
create or replace function public.record_input_tax_decision(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_supplier record;
  v_decl record;
  v_decimals integer;
  v_currency text;
  v_account uuid;
  v_ratio numeric(7,4);
  v_recoverable numeric(19,4);
  v_non_recoverable numeric(19,4);
  v_active record;
  v_previous_id uuid;
  v_id uuid;
begin
  select si.id, si.organization_id, si.supplier_id, si.expense_account_id,
         si.invoice_number, si.invoice_date, si.status,
         si.net_amount, si.vat_amount, si.amount
  into v_inv
  from public.supplier_invoices si where si.id = p_invoice_id;

  if v_inv.id is null then
    raise exception 'SUPPLIER_INVOICE_NOT_FOUND: فاتورة المورد غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_inv.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتسجيل قرار ضريبة مدخلات'
      using errcode = '42501';
  end if;

  select o.default_currency into v_currency
  from public.organizations o where o.id = v_inv.organization_id;
  v_decimals := public.currency_decimals(coalesce(v_currency, 'EGP'));

  select td.* into v_active
  from public.input_tax_decisions td
  where td.source_type = 'SUPPLIER_INVOICE' and td.source_id = p_invoice_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.input_tax_decisions r where r.reverses_decision_id = td.id
    )
  order by td.decided_at desc limit 1;
  if v_active.id is not null then
    return v_active.id;
  end if;

  select td.id into v_previous_id
  from public.input_tax_decisions td
  where td.source_type = 'SUPPLIER_INVOICE' and td.source_id = p_invoice_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.input_tax_decisions s where s.replaces_decision_id = td.id
    )
  order by td.decided_at desc limit 1;

  -- ١) مستند صالح. العمود غير قابل للعدم في القاعدة، فالحالة الممكنة فعلًا نص
  -- فارغ — ولهذا الفحص بـ`btrim` لا بـ`is null` وحده.
  if nullif(btrim(coalesce(v_inv.invoice_number, '')), '') is null
     or v_inv.invoice_date is null then
    raise exception
      'SUPPLIER_INVOICE_MISSING: لا يمكن المطالبة بضريبة مدخلات بلا فاتورة مورد صالحة برقم وتاريخ'
      using errcode = 'P0001';
  end if;

  if v_inv.expense_account_id is null then
    raise exception 'INPUT_TAX_RECOVERABILITY_UNDECLARED: الفاتورة بلا حساب مصروف'
      using errcode = 'P0001';
  end if;

  -- ٢) إعلان معتمد. غياب الصف = غير معلن = لا استرداد، ولا نسبة افتراضية صامتة.
  select * into v_decl
  from public.expense_account_input_tax
  where organization_id = v_inv.organization_id
    and expense_account_id = v_inv.expense_account_id;

  if v_decl.id is null then
    raise exception
      'INPUT_TAX_RECOVERABILITY_UNDECLARED: لم تُعلَن قابلية خصم ضريبة المدخلات لحساب المصروف'
      using errcode = 'P0001';
  end if;
  if v_decl.status <> 'APPROVED' then
    raise exception
      'INPUT_TAX_RECOVERABILITY_UNDECLARED: إعلان قابلية الخصم لم يُعتمد بعد'
      using errcode = 'P0001';
  end if;

  -- ٣) رقم تسجيل المورد شرط **الاسترداد** لا شرط التسجيل المحاسبي: غير القابل
  -- للاسترداد لا مطالبة فيه أصلًا فلا يحتاجه.
  select s.id, s.name, s.tax_number into v_supplier
  from public.suppliers s where s.id = v_inv.supplier_id;

  if v_decl.recoverability <> 'NON_RECOVERABLE'
     and nullif(btrim(coalesce(v_supplier.tax_number, '')), '') is null then
    raise exception
      'SUPPLIER_TAX_ID_MISSING: لا استرداد بلا رقم تسجيل ضريبي للمورد'
      using errcode = 'P0001';
  end if;

  if coalesce(v_inv.vat_amount, 0) <= 0 then
    raise exception 'INPUT_TAX_NOT_ELIGIBLE: الفاتورة بلا ضريبة مدخلات' using errcode = 'P0001';
  end if;

  -- ٤) التقسيم: النسبة على الضريبة، والباقي طرحًا فلا يضيع فلس في التقريب.
  if v_decl.recoverability = 'FULLY_RECOVERABLE' then
    v_ratio := 1;
    v_recoverable := round(v_inv.vat_amount, v_decimals);
  elsif v_decl.recoverability = 'NON_RECOVERABLE' then
    v_ratio := 0;
    v_recoverable := 0;
  else
    v_ratio := v_decl.recoverable_ratio;
    v_recoverable := round(v_inv.vat_amount * v_ratio, v_decimals);
  end if;
  v_non_recoverable := round(v_inv.vat_amount, v_decimals) - v_recoverable;

  if v_recoverable > 0 then
    v_account := public.resolve_input_tax_account(v_inv.organization_id);
    if v_account is null then
      raise exception
        'INPUT_TAX_ACCOUNT_MISSING: لا يوجد حساب ضريبة مدخلات صالح (أصل نشط غير تجميعي)'
        using errcode = 'P0001';
    end if;
  else
    v_account := null;
  end if;

  insert into public.input_tax_decisions (
    organization_id, source_type, source_id, supplier_id, expense_account_id,
    invoice_number, invoice_date, gross_amount, taxable_base, tax_amount,
    recoverability, recoverable_ratio, recoverable_amount, non_recoverable_amount,
    input_tax_account_id, decision_snapshot, replaces_decision_id, decided_by
  ) values (
    v_inv.organization_id, 'SUPPLIER_INVOICE', p_invoice_id, v_inv.supplier_id,
    v_inv.expense_account_id, v_inv.invoice_number, v_inv.invoice_date,
    round(coalesce(v_inv.net_amount, 0) + v_inv.vat_amount, v_decimals),
    round(coalesce(v_inv.net_amount, 0), v_decimals),
    round(v_inv.vat_amount, v_decimals),
    v_decl.recoverability, v_ratio, v_recoverable, v_non_recoverable,
    v_account,
    jsonb_build_object(
      'supplier_id', v_supplier.id, 'supplier_name', v_supplier.name,
      'supplier_tax_number', v_supplier.tax_number,
      'invoice_number', v_inv.invoice_number, 'invoice_date', v_inv.invoice_date,
      'expense_account_id', v_inv.expense_account_id,
      'currency', coalesce(v_currency, 'EGP'), 'currency_decimals', v_decimals,
      'taxable_base', round(coalesce(v_inv.net_amount, 0), v_decimals),
      'tax_amount', round(v_inv.vat_amount, v_decimals),
      'recoverability', v_decl.recoverability, 'recoverable_ratio', v_ratio,
      -- المنهج والفترة والمرجع مختومة مع القرار: نسبة بلا منهج لا تُراجَع لاحقًا
      -- ولا تُعاد حسابها عند التسوية الدورية.
      'ratio_method', v_decl.ratio_method, 'ratio_period', v_decl.ratio_period,
      'ratio_reference', v_decl.ratio_reference,
      'recoverable_amount', v_recoverable, 'non_recoverable_amount', v_non_recoverable,
      'input_tax_account_id', v_account,
      'declaration_id', v_decl.id, 'declaration_approved_at', v_decl.approved_at,
      'decided_at', now()
    ),
    v_previous_id, auth.uid()
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_inv.organization_id, 'input_tax_decision.recorded',
    'input_tax_decision', v_id,
    jsonb_build_object(
      'source_id', p_invoice_id, 'invoice_number', v_inv.invoice_number,
      'recoverability', v_decl.recoverability, 'recoverable_ratio', v_ratio,
      'tax_amount', round(v_inv.vat_amount, v_decimals),
      'recoverable_amount', v_recoverable, 'non_recoverable_amount', v_non_recoverable
    )
  );

  return v_id;
end;
$$;

-- جاهزية مستقلة عن جاهزية المخرجات: المشتريات والمبيعات مساران مختلفان، وربطهما
-- يجعل نقصًا في أحدهما يعطّل الآخر بلا سبب.
create or replace function public.check_input_tax_readiness(p_organization_id uuid)
returns table (gap_code text, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_needs_account integer;
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.view')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بفحص جاهزية ضريبة المدخلات'
      using errcode = '42501';
  end if;

  return query
  select 'INPUT_TAX_RECOVERABILITY_UNDECLARED'::text,
         ('حساب مصروف بفواتير تحمل ضريبة بلا إعلان معتمد: ' || a.name_ar)::text
  from (
    select distinct si.expense_account_id
    from public.supplier_invoices si
    where si.organization_id = p_organization_id and coalesce(si.vat_amount, 0) > 0
  ) used
  join public.chart_of_accounts a on a.id = used.expense_account_id
  left join public.expense_account_input_tax d
    on d.expense_account_id = used.expense_account_id and d.organization_id = p_organization_id
  where d.id is null or d.status <> 'APPROVED';

  return query
  select 'MIXED_USE_RATIO_MISSING'::text,
         ('إعلان مختلط بلا نسبة: ' || a.name_ar)::text
  from public.expense_account_input_tax d
  join public.chart_of_accounts a on a.id = d.expense_account_id
  where d.organization_id = p_organization_id
    and d.recoverability = 'MIXED' and d.recoverable_ratio is null;

  return query
  select 'MIXED_USE_METHOD_MISSING'::text,
         ('إعلان مختلط بلا منهج أو فترة: ' || a.name_ar)::text
  from public.expense_account_input_tax d
  join public.chart_of_accounts a on a.id = d.expense_account_id
  where d.organization_id = p_organization_id
    and d.recoverability = 'MIXED'
    and (nullif(btrim(coalesce(d.ratio_method, '')), '') is null
         or nullif(btrim(coalesce(d.ratio_period, '')), '') is null);

  return query
  select 'SUPPLIER_TAX_ID_MISSING'::text,
         ('مورد بفواتير تحمل ضريبة وبلا رقم تسجيل: ' || s.name)::text
  from public.suppliers s
  where s.organization_id = p_organization_id
    and nullif(btrim(coalesce(s.tax_number, '')), '') is null
    and exists (
      select 1 from public.supplier_invoices si
      where si.supplier_id = s.id and coalesce(si.vat_amount, 0) > 0
    );

  return query
  select 'SUPPLIER_INVOICE_MISSING'::text,
         ('فاتورة تحمل ضريبة بلا رقم مستند: ' || si.id::text)::text
  from public.supplier_invoices si
  where si.organization_id = p_organization_id
    and coalesce(si.vat_amount, 0) > 0
    and nullif(btrim(coalesce(si.invoice_number, '')), '') is null;

  select count(*) into v_needs_account
  from public.expense_account_input_tax d
  where d.organization_id = p_organization_id
    and d.status = 'APPROVED'
    and d.recoverability in ('FULLY_RECOVERABLE', 'MIXED');

  if v_needs_account > 0 and public.resolve_input_tax_account(p_organization_id) is null then
    return query select 'INPUT_TAX_ACCOUNT_MISSING'::text,
      'لا يوجد حساب ضريبة مدخلات صالح (أصل نشط غير تجميعي): استنسخ الدليل القياسي أو عيّن حسابًا'::text;
  end if;
end;
$$;
