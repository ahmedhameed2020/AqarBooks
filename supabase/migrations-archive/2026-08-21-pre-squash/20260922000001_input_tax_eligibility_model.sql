-- ضريبة المدخلات — نموذج الأهلية والاعتماد. **لا قيود في هذه المرحلة.**
--
-- الترتيب معتمد: تُصمَّم الأهلية أولًا ثم تُبنى القيود عليها. فما هنا هو الجواب
-- على «مَن يستحق الاسترداد ولماذا»، لا كيف يُرحَّل.
--
-- ═══ لماذا الإعلان على حساب المصروف لا على الفئة ═══
--
-- المُصنِّف يختلف بين المصدرين: `supplier_invoices` تحمل `expense_account_id`،
-- و`expenses` تحمل `expense_category_id`. وحساب المصروف هو القاسم المشترك
-- الوحيد بينهما — والفئة نفسها تحمل حسابًا افتراضيًا. فالإعلان عليه يغطي
-- المصدرين بمصدر حقيقة واحد بدل إعلانين قد يتناقضان.
--
-- ═══ ثلاث حالات لا اثنتان ═══
--
--   FULLY_RECOVERABLE   مرتبط مباشرةً بتوريدات خاضعة
--   NON_RECOVERABLE     توريدات معفاة أو استخدام غير تجاري
--   MIXED               يحتاج نسبة **موثَّقة** بمنهج وفترة
--
-- والمختلط هو ما يُخطئ صامتًا: نسبة تبدو معقولة تسترد ضريبة لا يجوز استردادها.
-- فلا نسبة بلا منهج، ولا منهج بلا فترة — والقيد في القاعدة يفرض الثلاثة معًا،
-- لأن شرطًا في التطبيق وحده يمر من أي مسار كتابة آخر.
--
-- ═══ ما لا يُفترض ═══
--
-- غياب الإعلان = **غير معلن** = لا استرداد. لا نسبة افتراضية صامتة تسدّ الفراغ،
-- ولا اشتقاق من اسم الحساب. وحقيقة قائمة وقت البناء: **صفر من 14 موردًا يحمل
-- رقمًا ضريبيًا**، فحاجز «لا استرداد بلا رقم تسجيل» ليس نظريًا بل هو الحالة
-- السائدة اليوم.

insert into public.coa_template_accounts
  (template_key, sort_order, code, parent_code, name_ar, name_en, category, normal_balance,
   is_group, is_cash_equivalent, cash_flow_section)
select 'RESORT_STANDARD',
       (select max(sort_order) + 1 from public.coa_template_accounts where template_key='RESORT_STANDARD'),
       '1140', '1100', 'ضريبة مدخلات قابلة للاسترداد', 'Recoverable Input Tax',
       'ASSET', 'DEBIT', false, t.is_cash_equivalent, t.cash_flow_section
from public.coa_template_accounts t
where t.template_key='RESORT_STANDARD' and t.code='1130'
on conflict do nothing;

create table if not exists public.expense_account_input_tax (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  expense_account_id uuid not null references public.chart_of_accounts(id) on delete cascade,
  recoverability     text not null
                       check (recoverability in ('FULLY_RECOVERABLE', 'NON_RECOVERABLE', 'MIXED')),
  recoverable_ratio  numeric(7,4) check (recoverable_ratio is null
                       or (recoverable_ratio >= 0 and recoverable_ratio <= 1)),
  ratio_method       text,
  ratio_period       text,
  ratio_reference    text,
  status             text not null default 'REVIEW_REQUIRED'
                       check (status in ('REVIEW_REQUIRED', 'APPROVED')),
  notes              text,
  approved_by        uuid,
  approved_at        timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint expense_account_input_tax_unique unique (organization_id, expense_account_id),
  constraint expense_account_input_tax_mixed_is_documented check (
    recoverability <> 'MIXED'
    or (recoverable_ratio is not null
        and nullif(btrim(coalesce(ratio_method, '')), '') is not null
        and nullif(btrim(coalesce(ratio_period, '')), '') is not null)
  ),
  constraint expense_account_input_tax_ratio_scope check (
    recoverability = 'MIXED' or recoverable_ratio is null
  ),
  constraint expense_account_input_tax_approved_has_approver check (
    (status = 'REVIEW_REQUIRED' and approved_by is null and approved_at is null)
    or (status = 'APPROVED' and approved_by is not null and approved_at is not null)
  )
);

comment on table public.expense_account_input_tax is
  'إعلان قابلية خصم ضريبة المدخلات لكل حساب مصروف. غياب الصف = غير معلن = لا استرداد. لا نسبة افتراضية صامتة.';

alter table public.expense_account_input_tax enable row level security;

drop policy if exists expense_account_input_tax_select on public.expense_account_input_tax;
create policy expense_account_input_tax_select on public.expense_account_input_tax
  for select using (
    public.has_permission(auth.uid(), organization_id, 'finance.accounts.view')
    or public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage')
  );

-- ═══════════════════════════════════════════════════════════════════════
-- حسابا الضريبة صفتان للكيان لا للعقار
-- ═══════════════════════════════════════════════════════════════════════
--
-- المحاولة الأولى وضعتهما في `organization_finance_settings`، وتبيّن أن عمود
-- `property_id` فيه **غير قابل للعدم** — فالجدول لكل عقار لا لكل مؤسسة، وصف
-- على مستوى المؤسسة مستحيل فيه. وحساب الضريبة صفة للكيان كـ`tax_id`
-- و`tax_jurisdiction`، فمكانه `organizations`.

alter table public.organizations
  add column if not exists output_tax_account_id uuid references public.chart_of_accounts(id),
  add column if not exists input_tax_account_id uuid references public.chart_of_accounts(id);

comment on column public.organizations.output_tax_account_id is
  'تجاوز اختياري لحساب ضريبة المخرجات. الافتراضي حساب الدليل القياسي 2300.';
comment on column public.organizations.input_tax_account_id is
  'تجاوز اختياري لحساب ضريبة المدخلات. الافتراضي 1140، ولا يجوز أن يساوي حساب المخرجات.';

alter table public.organization_finance_settings drop column if exists output_tax_account_id;
alter table public.organization_finance_settings drop column if exists input_tax_account_id;

create or replace function public.resolve_output_tax_account(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.id from public.organizations o
     join public.chart_of_accounts a on a.id = o.output_tax_account_id
     where o.id = p_organization_id
       and a.organization_id = p_organization_id
       and a.category = 'LIABILITY' and not a.is_group and a.is_active),
    (select a.id from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.code = '2300'
       and a.category = 'LIABILITY' and not a.is_group and a.is_active
     limit 1)
  );
$$;

create or replace function public.resolve_input_tax_account(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.id from public.organizations o
     join public.chart_of_accounts a on a.id = o.input_tax_account_id
     where o.id = p_organization_id
       and a.organization_id = p_organization_id
       and a.category = 'ASSET' and not a.is_group and a.is_active),
    (select a.id from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.code = '1140'
       and a.category = 'ASSET' and not a.is_group and a.is_active
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

  select output_tax_account_id into v_before
  from public.organizations where id = p_organization_id;

  update public.organizations set output_tax_account_id = p_account_id
  where id = p_organization_id;

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

create or replace function public.set_input_tax_account(
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
  v_output uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حساب ضريبة المدخلات'
      using errcode = '42501';
  end if;

  if p_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_account_id and a.organization_id = p_organization_id
      and a.category = 'ASSET' and not a.is_group and a.is_active
  ) then
    raise exception
      'INPUT_TAX_ACCOUNT_INVALID: يجب أن يكون الحساب أصلًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  -- ضريبة المدخلات أصل وضريبة المخرجات التزام. حساب واحد يحمل الاثنين يُظهر
  -- صافيًا لا يعني شيئًا، ويُخفي كلا الرصيدين عن الإقرار وعن الميزانية.
  v_output := public.resolve_output_tax_account(p_organization_id);
  if p_account_id is not null and v_output is not null and p_account_id = v_output then
    raise exception
      'INPUT_TAX_ACCOUNT_CONFLICT: لا يجوز أن يكون حساب ضريبة المدخلات هو حساب ضريبة المخرجات نفسه'
      using errcode = '22023';
  end if;

  select input_tax_account_id into v_before
  from public.organizations where id = p_organization_id;

  update public.organizations set input_tax_account_id = p_account_id
  where id = p_organization_id;

  update public.expense_account_input_tax
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where organization_id = p_organization_id and status = 'APPROVED';

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'input_tax_account.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before, 'to', p_account_id, 'approvals_revoked', true)
  );
end;
$$;

create or replace function public.set_expense_account_input_tax(
  p_expense_account_id uuid,
  p_recoverability text,
  p_recoverable_ratio numeric default null,
  p_ratio_method text default null,
  p_ratio_period text default null,
  p_ratio_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_before record;
  v_id uuid;
begin
  select organization_id into v_org
  from public.chart_of_accounts where id = p_expense_account_id;
  if v_org is null then
    raise exception 'ACCOUNT_NOT_FOUND: الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإعلان قابلية خصم ضريبة المدخلات'
      using errcode = '42501';
  end if;

  if p_recoverability not in ('FULLY_RECOVERABLE', 'NON_RECOVERABLE', 'MIXED') then
    raise exception 'INPUT_TAX_RECOVERABILITY_INVALID: قيمة قابلية الخصم غير معروفة'
      using errcode = '22023';
  end if;

  if p_recoverability = 'MIXED' then
    if p_recoverable_ratio is null then
      raise exception 'MIXED_USE_RATIO_MISSING: المصروف المختلط يحتاج نسبة قابلية خصم'
        using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_ratio_method, '')), '') is null then
      raise exception 'MIXED_USE_METHOD_MISSING: النسبة بلا منهج لا تُراجَع ولا تُعاد حسابها'
        using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_ratio_period, '')), '') is null then
      raise exception 'MIXED_USE_PERIOD_MISSING: النسبة تخص فترة محددة، وبلا فترة لا تسوية دورية'
        using errcode = '22023';
    end if;
  end if;

  select recoverability, status into v_before
  from public.expense_account_input_tax
  where organization_id = v_org and expense_account_id = p_expense_account_id;

  insert into public.expense_account_input_tax (
    organization_id, expense_account_id, recoverability, recoverable_ratio,
    ratio_method, ratio_period, ratio_reference, status, notes, created_by
  ) values (
    v_org, p_expense_account_id, p_recoverability,
    case when p_recoverability = 'MIXED' then p_recoverable_ratio else null end,
    p_ratio_method, p_ratio_period, p_ratio_reference, 'REVIEW_REQUIRED', p_notes, auth.uid()
  )
  on conflict (organization_id, expense_account_id) do update
  set recoverability    = excluded.recoverability,
      recoverable_ratio = excluded.recoverable_ratio,
      ratio_method      = excluded.ratio_method,
      ratio_period      = excluded.ratio_period,
      ratio_reference   = excluded.ratio_reference,
      notes             = excluded.notes,
      -- تغيير قابلية الخصم قرار ضريبي لا إعداد، فيعود إلى المراجعة كما يفعل
      -- تغيير طبيعة الإيراد أو أساس المبلغ.
      status            = 'REVIEW_REQUIRED',
      approved_by       = null,
      approved_at       = null,
      updated_at        = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'input_tax_recoverability.set', 'expense_account_input_tax', v_id,
    jsonb_build_object(
      'expense_account_id', p_expense_account_id,
      'recoverability_from', v_before.recoverability,
      'recoverability_to', p_recoverability,
      'ratio', p_recoverable_ratio, 'method', p_ratio_method, 'period', p_ratio_period,
      'status_from', v_before.status, 'status_to', 'REVIEW_REQUIRED',
      'approval_revoked', coalesce(v_before.status = 'APPROVED', false)
    )
  );

  return v_id;
end;
$$;

create or replace function public.approve_expense_account_input_tax(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row from public.expense_account_input_tax where id = p_id;
  if v_row.id is null then
    raise exception 'INPUT_TAX_DECLARATION_NOT_FOUND: الإعلان غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_row.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد قابلية الخصم'
      using errcode = '42501';
  end if;

  if v_row.status = 'APPROVED' then
    raise exception 'INPUT_TAX_DECLARATION_ALREADY_APPROVED: الإعلان معتمد بالفعل'
      using errcode = 'P0001';
  end if;

  update public.expense_account_input_tax
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_row.organization_id, 'input_tax_recoverability.approved',
    'expense_account_input_tax', p_id,
    jsonb_build_object(
      'expense_account_id', v_row.expense_account_id,
      'recoverability', v_row.recoverability, 'ratio', v_row.recoverable_ratio,
      'status_from', v_row.status, 'status_to', 'APPROVED'
    )
  );
end;
$$;
