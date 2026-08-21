-- تتمة: القرار يختم الحساب، والأساس الصافي مرفوض، والقيد يصير ثلاثيًا.
-- (الجزء الأول في 20260920000001 — الحساب القياسي والتجاوز المؤسسي والجاهزية.)
--
-- ترتيب الإطلاق مقصود: Postgres يطلق triggers الصف الواحد بترتيب الاسم أبجديًا،
-- وكان `trg_dues_post_to_ledger` يسبق `trg_dues_tax_decision` — فيُرحَّل القيد
-- قبل أن يوجد القرار الذي يقسّمه. البادئة الرقمية تجعل الترتيب صريحًا.

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
        v_map.revenue_nature using errcode = 'P0001';
    end if;
    v_basis := v_map.amount_basis;

    -- الذمم في الدفتر يجب أن تساوي مبلغ المستحق الذي تُخصَّص عليه المدفوعات
    -- ويُبنى عليه تقرير الأعمار. الأساس الصافي يجعل العميل يدين بالمبلغ زائد
    -- الضريبة بينما السجل الفرعي يقول المبلغ وحده — روايتان تختلفان في كل سطر.
    if v_basis = 'NET' then
      raise exception
        'TAX_NET_BASIS_NOT_POSTABLE: أساس صافٍ لنوع خاضع غير قابل للترحيل؛ مبلغ المستحق يجب أن يكون شاملًا للضريبة حتى تطابق الذمم ما يدين به العميل'
        using errcode = 'P0001';
    end if;

    -- الصافي = الإجمالي ÷ (1 + النسبة)، والضريبة = الإجمالي − الصافي. تُحسب
    -- الضريبة أولًا ويُشتق الصافي طرحًا، فيتطابق المجموع مع الإجمالي حتمًا بدل
    -- أن يعتمد على حظ التقريب.
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

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    replaces_decision_id, decided_by, amount_basis, taxable_base, vat_amount, gross_amount,
    output_tax_account_id
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
    ),
    v_previous_id, auth.uid(), v_basis, v_base, v_vat, v_gross, v_account
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
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;

drop trigger if exists trg_dues_tax_decision on public.dues;
drop trigger if exists trg_dues_01_tax_decision on public.dues;
create trigger trg_dues_01_tax_decision
  after insert on public.dues
  for each row execute function public.trg_dues_tax_decision();

create or replace function public.post_due_to_ledger(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_revenue_account_id uuid;
  v_fiscal_period_id uuid;
  v_entry_id uuid;
  v_decision record;
  v_lines jsonb;
begin
  select d.*, dt.default_revenue_account_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    return null;
  end if;

  if v_due.status in ('DRAFT', 'VOID') then
    return null;
  end if;

  if v_due.journal_entry_id is not null then
    return v_due.journal_entry_id;
  end if;

  v_revenue_account_id := v_due.default_revenue_account_id;
  if v_revenue_account_id is null then
    raise exception 'DUE_TYPE_HAS_NO_REVENUE_ACCOUNT: نوع المستحق لا يحمل حساب إيراد'
      using errcode = 'P0001';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_due.organization_id
    and fp.status = 'OPEN'
    and v_due.issue_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    return null;
  end if;

  -- القرار الضريبي النشط، إن وُجد. الـtrigger يختمه قبل هذا الترحيل، فالقيد
  -- يعرف نصيب الضريبة من الإجمالي قبل أن يُكتب لا بعده.
  select td.taxable_base, td.vat_amount, td.gross_amount, td.output_tax_account_id
  into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc
  limit 1;

  if v_decision.vat_amount is not null and v_decision.vat_amount > 0 then
    if v_decision.output_tax_account_id is null then
      raise exception 'OUTPUT_TAX_ACCOUNT_MISSING: القرار الضريبي بلا حساب ضريبة مخرجات'
        using errcode = 'P0001';
    end if;
    -- الذمم بالإجمالي، الإيراد بالصافي، والضريبة التزام. والإجمالي هو مبلغ
    -- المستحق نفسه لأن الأساس الصافي مرفوض عند القرار، فتبقى الذمم مطابقة
    -- للسجل الفرعي الذي تُخصَّص عليه المدفوعات.
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_due.receivable_account_id,
                         'debit', v_decision.gross_amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id,
                         'debit', 0, 'credit', v_decision.taxable_base),
      jsonb_build_object('account_id', v_decision.output_tax_account_id,
                         'debit', 0, 'credit', v_decision.vat_amount)
    );
  else
    -- المعفى وخارج النطاق وما قبل الإنفاذ: القيد الثنائي كما كان.
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_due.receivable_account_id,
                         'debit', v_due.amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id,
                         'debit', 0, 'credit', v_due.amount)
    );
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_due.organization_id,
    v_due.property_id,
    v_fiscal_period_id,
    v_due.issue_date,
    coalesce(v_due.description, 'Due issued'),
    'JOURNAL_VOUCHER',
    v_lines,
    'due:' || p_due_id::text
  );

  perform public.post_journal_entry_internal(v_entry_id);

  update public.dues set journal_entry_id = v_entry_id where id = p_due_id;

  return v_entry_id;
end;
$$;
