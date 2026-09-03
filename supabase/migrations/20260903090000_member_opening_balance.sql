-- Opening balances for members (clients): the debt a client already carried
-- when the organization moved onto AqarBooks.
--
-- WHY A DUE, NOT A COLUMN
-- A number on public.members would be a label, not a debt. Nothing could be
-- paid against it (payment_allocations reference dues), no statement would
-- carry it as a line with a date, dunning would never see it, and the general
-- ledger would disagree with the members list by exactly that amount.
--
-- So an opening balance is recorded as a due -- the one sub-ledger document
-- every balance, statement, allocation and aging report in this system already
-- reads -- tagged source_type = 'OPENING_BALANCE' with source_id = the member.
-- The existing AFTER INSERT trigger posts it to the ledger:
--
--     Dr  receivable account (e.g. 1130 ذمم الأعضاء المدينة)
--     Cr  opening-balance equity account (created once per organization)
--
-- The credit side is EQUITY, never revenue: the revenue behind this debt was
-- earned -- and taxed -- under the previous system. Booking it as revenue
-- again would overstate the current year's P&L and, under tax enforcement,
-- would try to charge VAT on money that was already invoiced.
--
-- WHY THE UNIT IS REQUIRED
-- dues.unit_id and payments.property_id are NOT NULL, and every balance view
-- (units_with_financials -> members_with_financials) aggregates by unit. A
-- member-level due with no unit would be invisible to all of them. The client
-- must therefore already be attached to the unit (owner or active tenant)
-- before their opening balance can be recorded against it.
--
-- TWO FUNCTIONS, DELIBERATELY
-- ensure_opening_balance_due_type() creates the equity account and the
-- "رصيد افتتاحي" due type in its own transaction. record_member_opening_balance()
-- refuses, under tax enforcement, to insert a due whose type has no APPROVED
-- revenue-nature mapping -- and if both lived in one call the refusal would
-- roll back the very due type the reviewer needs to approve.
--
-- SECURITY (ADR 0004): both functions are SECURITY DEFINER with a pinned
-- search_path, callable by `authenticated` only, and gate on
-- has_financial_permission(..., 'finance.dues.issue', ...). Both names are
-- added to the allowlist in tests/security-function-grants.integration.test.ts
-- in this same commit.

begin;

-- ---------------------------------------------------------------------------
-- 1. Let dues carry the new provenance.
-- ---------------------------------------------------------------------------
alter table public.dues drop constraint if exists dues_source_type_check;
alter table public.dues add constraint dues_source_type_check
  check (source_type = any (array['LEASE_RENT'::text, 'INSTALLMENT_PLAN'::text, 'OPENING_BALANCE'::text]));

comment on column public.dues.source_type is
  'LEASE_RENT / INSTALLMENT_PLAN: generated from a contract. OPENING_BALANCE: debt carried in from before AqarBooks; source_id is the member it belongs to.';

-- The hash-chained financial audit log admits only named actions. A carried-in
-- balance is its own event, not a DUE_ISSUED: an auditor reading the chain
-- must be able to tell "we charged this" from "this was already owed".
alter table public.financial_audit_logs drop constraint if exists check_audit_action;
alter table public.financial_audit_logs add constraint check_audit_action
  check (action = any (array[
    'PAYMENT_CREATED'::text, 'PAYMENT_IDEMPOTENT_REPLAY'::text, 'PAYMENT_ALLOCATION_CREATED'::text,
    'DUE_ISSUED'::text, 'DUE_BATCH_ISSUED'::text, 'RECURRING_DUES_GENERATED'::text, 'RECURRING_DUES_SKIPPED'::text,
    'OPERATION_REJECTED'::text, 'LEASE_RENT_DUE_GENERATED'::text, 'LEASE_RENT_DUE_SKIPPED'::text,
    'OPENING_BALANCE_RECORDED'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. The per-organization due type and its equity offset account.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_opening_balance_due_type(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_type record;
  v_account_category text;
  v_account_is_group boolean;
  v_account_is_active boolean;
  v_parent_id uuid;
  v_code text;
  v_account_id uuid;
  v_type_id uuid;
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  if public.is_demo_organization(p_organization_id) then
    raise exception 'DEMO_READ_ONLY: المؤسسة التجريبية للقراءة فقط' using errcode = '42501';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.dues.issue', null) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' using errcode = '42501';
  end if;

  -- One type per organization, whichever path reaches here first.
  perform pg_advisory_xact_lock(hashtext('opening_balance_due_type_' || p_organization_id::text));

  -- Identify by use first (any OPENING_BALANCE due already points at it), then
  -- by the name this function gives it. Never by guessing an account code.
  select dt.id, dt.default_revenue_account_id, dt.is_active
  into v_type
  from public.due_types dt
  where dt.organization_id = p_organization_id
    and (
      exists (
        select 1 from public.dues d
        where d.organization_id = p_organization_id
          and d.source_type = 'OPENING_BALANCE'
          and d.due_type_id = dt.id
      )
      or lower(btrim(dt.name_en)) = 'opening balance'
    )
  order by dt.is_active desc, dt.created_at
  limit 1;

  if v_type.id is not null then
    select a.category, a.is_group, a.is_active
    into v_account_category, v_account_is_group, v_account_is_active
    from public.chart_of_accounts a
    where a.id = v_type.default_revenue_account_id;

    -- The offset must stay equity. A revenue account here would re-book old
    -- income into the current year, so it is refused rather than repaired.
    if v_account_category is distinct from 'EQUITY' or coalesce(v_account_is_group, false) or not coalesce(v_account_is_active, false) then
      raise exception
        'OPENING_BALANCE_ACCOUNT_INVALID: نوع المستحق «رصيد افتتاحي» يجب أن يشير إلى حساب حقوق ملكية فرعي نشط، لا حساب إيراد'
        using errcode = 'P0001';
    end if;

    if not v_type.is_active then
      update public.due_types set is_active = true where id = v_type.id;
    end if;

    return v_type.id;
  end if;

  -- First use in this organization: create the equity account under the
  -- equity group when the standard chart is in place, standalone otherwise.
  select a.id into v_parent_id
  from public.chart_of_accounts a
  where a.organization_id = p_organization_id
    and a.code = '3000'
    and a.category = 'EQUITY'
    and a.is_group;

  v_code := null;
  for i in 0..99 loop
    if not exists (
      select 1 from public.chart_of_accounts a
      where a.organization_id = p_organization_id and a.code = (3900 + i)::text
    ) then
      v_code := (3900 + i)::text;
      exit;
    end if;
  end loop;

  if v_code is null then
    raise exception
      'OPENING_BALANCE_ACCOUNT_CODE_EXHAUSTED: لا يوجد رمز حساب متاح في النطاق 3900-3999 لحساب الأرصدة الافتتاحية'
      using errcode = 'P0001';
  end if;

  insert into public.chart_of_accounts (
    organization_id, code, name_ar, name_en, parent_id,
    category, normal_balance, is_group, is_active, cash_flow_section
  ) values (
    p_organization_id, v_code,
    'أرصدة افتتاحية — ذمم العملاء', 'Opening Balances - Receivables', v_parent_id,
    'EQUITY', 'CREDIT', false, true, 'FINANCING'
  )
  returning id into v_account_id;

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id, is_active)
  values (p_organization_id, 'رصيد افتتاحي', 'Opening Balance', v_account_id, true)
  returning id into v_type_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    v_user_id, p_organization_id, 'due_type.opening_balance_created', 'due_type', v_type_id,
    jsonb_build_object('account_id', v_account_id, 'account_code', v_code)
  );

  return v_type_id;
end;
$$;

comment on function public.ensure_opening_balance_due_type(uuid) is
  'Finds or creates the organization''s «رصيد افتتاحي» due type and its EQUITY offset account. Idempotent; safe to call before every opening-balance entry.';

-- ---------------------------------------------------------------------------
-- 3. Recording one client's opening balance against one of their units.
-- ---------------------------------------------------------------------------
create or replace function public.record_member_opening_balance(
  p_organization_id uuid,
  p_member_id uuid,
  p_unit_id uuid,
  p_amount numeric,
  p_as_of_date date,
  p_receivable_account_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_unit record;
  v_member record;
  v_due_type_id uuid;
  v_receivable_id uuid;
  v_enforced boolean;
  v_existing_id uuid;
  v_due_id uuid;
  v_description text;
begin
  if v_user_id is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  if public.is_demo_organization(p_organization_id) then
    raise exception 'DEMO_READ_ONLY: المؤسسة التجريبية للقراءة فقط' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'OPENING_BALANCE_AMOUNT_INVALID: مبلغ الرصيد الافتتاحي يجب أن يكون أكبر من صفر' using errcode = '22023';
  end if;

  if p_as_of_date is null then
    raise exception 'OPENING_BALANCE_DATE_REQUIRED: تاريخ الرصيد الافتتاحي مطلوب' using errcode = '22023';
  end if;

  if p_as_of_date > current_date then
    raise exception 'OPENING_BALANCE_DATE_IN_FUTURE: تاريخ الرصيد الافتتاحي لا يكون في المستقبل' using errcode = '22023';
  end if;

  select u.id, u.property_id
  into v_unit
  from public.units u
  where u.id = p_unit_id
    and u.organization_id = p_organization_id
    and u.archived_at is null;

  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة أو مؤرشفة أو لا تنتمي لهذه المؤسسة' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.dues.issue', v_unit.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' using errcode = '42501';
  end if;

  select m.id, m.full_name
  into v_member
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
    and m.archived_at is null;

  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العميل غير موجود أو مؤرشف' using errcode = '22023';
  end if;

  -- The balance has to land where the member's balance is read from: a unit
  -- they currently own or rent. Otherwise it would exist in the ledger and
  -- appear on nobody's statement.
  if not exists (
       select 1 from public.unit_ownerships uo
       where uo.unit_id = p_unit_id
         and uo.member_id = p_member_id
         and (uo.end_date is null or uo.end_date >= current_date)
     )
     and not exists (
       select 1 from public.unit_leases ul
       where ul.unit_id = p_unit_id
         and ul.tenant_member_id = p_member_id
         and ul.status = 'ACTIVE'
     )
  then
    raise exception 'MEMBER_NOT_LINKED_TO_UNIT: اربط العميل بالوحدة (ملكية أو عقد إيجار نشط) قبل تسجيل رصيده الافتتاحي' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('opening_balance_' || p_member_id::text || ':' || p_unit_id::text));

  -- One opening balance per client per unit. A correction is a credit note
  -- or a void on the existing due, not a second opening balance.
  select d.id into v_existing_id
  from public.dues d
  where d.organization_id = p_organization_id
    and d.source_type = 'OPENING_BALANCE'
    and d.source_id = p_member_id
    and d.unit_id = p_unit_id
    and d.status <> 'VOID'
  limit 1;

  if v_existing_id is not null then
    raise exception 'OPENING_BALANCE_ALREADY_RECORDED: سُجِّل رصيد افتتاحي لهذا العميل على هذه الوحدة من قبل' using errcode = '22023';
  end if;

  -- Receivable side: the caller's choice, else the account this organization
  -- already books its dues to, else the standard chart's 1130.
  if p_receivable_account_id is not null then
    select a.id into v_receivable_id
    from public.chart_of_accounts a
    where a.id = p_receivable_account_id
      and a.organization_id = p_organization_id
      and a.category = 'ASSET'
      and not a.is_group
      and a.is_active;

    if v_receivable_id is null then
      raise exception 'RECEIVABLE_ACCOUNT_INVALID: حساب الذمم المدينة يجب أن يكون حساب أصول فرعيًا نشطًا في هذه المؤسسة' using errcode = '22023';
    end if;
  else
    select d.receivable_account_id into v_receivable_id
    from public.dues d
    join public.chart_of_accounts a on a.id = d.receivable_account_id
    where d.organization_id = p_organization_id
      and a.category = 'ASSET'
      and not a.is_group
      and a.is_active
    group by d.receivable_account_id
    order by count(*) desc
    limit 1;

    if v_receivable_id is null then
      select a.id into v_receivable_id
      from public.chart_of_accounts a
      where a.organization_id = p_organization_id
        and a.code = '1130'
        and a.category = 'ASSET'
        and not a.is_group
        and a.is_active;
    end if;

    if v_receivable_id is null then
      raise exception 'RECEIVABLE_ACCOUNT_REQUIRED: حدِّد حساب الذمم المدينة؛ لا يوجد حساب افتراضي لهذه المؤسسة' using errcode = '22023';
    end if;
  end if;

  v_due_type_id := public.ensure_opening_balance_due_type(p_organization_id);

  -- Under tax enforcement the dues trigger will refuse an unmapped type with a
  -- generic TAX_REVIEW_REQUIRED. Say precisely what is needed instead.
  select o.tax_enforcement_enabled into v_enforced
  from public.organizations o where o.id = p_organization_id;

  if coalesce(v_enforced, false) and not exists (
    select 1 from public.due_type_revenue_natures n
    where n.organization_id = p_organization_id
      and n.due_type_id = v_due_type_id
      and n.status = 'APPROVED'
  ) then
    raise exception
      'OPENING_BALANCE_TAX_MAPPING_REQUIRED: نوع المستحق «رصيد افتتاحي» يحتاج ربطًا معتمدًا بطبيعة إيراد خارج نطاق الضريبة من شاشة المراجعة الضريبية قبل التسجيل'
      using errcode = 'P0001';
  end if;

  v_description := coalesce(nullif(btrim(p_description), ''), 'رصيد افتتاحي — ' || v_member.full_name);

  -- Issue date = due date = the as-of date: the debt was already due when it
  -- was carried in, and aging must count from then, not from today.
  insert into public.dues (
    organization_id, property_id, unit_id, due_type_id, receivable_account_id,
    amount, issue_date, due_date, description, status, created_by,
    source_type, source_id
  ) values (
    p_organization_id, v_unit.property_id, p_unit_id, v_due_type_id, v_receivable_id,
    p_amount, p_as_of_date, p_as_of_date, v_description, 'ISSUED', v_user_id,
    'OPENING_BALANCE', p_member_id
  )
  returning id into v_due_id;

  perform public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'OPENING_BALANCE_RECORDED',
    p_entity_type := 'DUE',
    p_resort_id := v_unit.property_id,
    p_entity_id := v_due_id,
    p_metadata := jsonb_build_object(
      'member_id', p_member_id,
      'unit_id', p_unit_id,
      'amount', p_amount,
      'as_of_date', p_as_of_date,
      'receivable_account_id', v_receivable_id,
      'due_type_id', v_due_type_id
    )
  );

  return v_due_id;
end;
$$;

comment on function public.record_member_opening_balance(uuid, uuid, uuid, numeric, date, uuid, text) is
  'Records a client''s carried-in debt as an OPENING_BALANCE due on one of their units (Dr receivable / Cr opening-balance equity). One per client per unit. Returns the due id.';

-- ---------------------------------------------------------------------------
-- 4. Grants: authenticated only, per the Phase 1 baseline.
-- ---------------------------------------------------------------------------
revoke all on function public.ensure_opening_balance_due_type(uuid) from public, anon;
grant execute on function public.ensure_opening_balance_due_type(uuid) to authenticated, service_role;

revoke all on function public.record_member_opening_balance(uuid, uuid, uuid, numeric, date, uuid, text) from public, anon;
grant execute on function public.record_member_opening_balance(uuid, uuid, uuid, numeric, date, uuid, text) to authenticated, service_role;

commit;
