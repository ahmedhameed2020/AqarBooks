-- Phase 2d: no due and no opening balance without its journal entry.
--
-- post_due_to_ledger() returns NULL when no OPEN fiscal period covers the issue date. issue_dues() and
-- record_member_opening_balance() ignored that and kept the due, so the customer balance (dues / owner statement) and the
-- general ledger silently disagreed. Both now refuse the whole operation, atomically (the function's transaction rolls
-- back: no due, no entry, no audit row), with a message that says what is wrong:
--   FISCAL_PERIOD_MISSING   no fiscal period covers the date (no year defined, or the date is outside every period)
--   FISCAL_PERIOD_NOT_OPEN  a period covers the date but its status is not OPEN (PLANNED / CLOSED / LOCKED)
-- and, after the insert, verify that the due really received its journal entry (defence in depth).
-- Dues created by other paths (leases, recurring schedules, installments) keep their existing "recognize later" behaviour.

CREATE OR REPLACE FUNCTION public.assert_open_fiscal_period_for_date(p_organization_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods fp
    WHERE fp.organization_id = p_organization_id AND fp.status = 'OPEN' AND p_date BETWEEN fp.start_date AND fp.end_date
  ) THEN
    RETURN;
  END IF;

  SELECT fp.status, fp.name INTO v_status, v_name
  FROM public.fiscal_periods fp
  WHERE fp.organization_id = p_organization_id AND p_date BETWEEN fp.start_date AND fp.end_date
  ORDER BY fp.start_date
  LIMIT 1;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_MISSING: لا توجد فترة مالية تغطي التاريخ % — عرّف السنة المالية وافتح فترتها قبل التسجيل', p_date
      USING ERRCODE = 'P0001';
  END IF;
  RAISE EXCEPTION 'FISCAL_PERIOD_NOT_OPEN: الفترة المالية % التي تغطي التاريخ % حالتها % وليست مفتوحة — افتحها قبل التسجيل', v_name, p_date, v_status
    USING ERRCODE = 'P0001';
END;
$$;
ALTER FUNCTION public.assert_open_fiscal_period_for_date(uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_open_fiscal_period_for_date(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_open_fiscal_period_for_date(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_dues(p_organization_id uuid, p_resort_id uuid, p_unit_ids uuid[], p_due_type_id uuid, p_receivable_account_id uuid, p_amount numeric, p_amount_by_unit_type jsonb DEFAULT NULL::jsonb, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT (CURRENT_DATE + '15 days'::interval), p_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_unit_id uuid;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issued_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_skipped_unit_ids uuid[] := ARRAY[]::uuid[];
  v_action text;
  v_new_due_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.dues.issue', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' USING ERRCODE = '42501';
  END IF;

  -- The receivable side must be an active, postable ASSET account of THIS organization. Nothing is guessed:
  -- a missing or foreign account is refused (it used to be accepted as-is).
  IF p_receivable_account_id IS NULL THEN
    RAISE EXCEPTION 'RECEIVABLE_ACCOUNT_REQUIRED: حدِّد حساب الذمم المدينة' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = p_receivable_account_id
      AND a.organization_id = p_organization_id
      AND a.category = 'ASSET'
      AND NOT a.is_group
      AND a.is_active
  ) THEN
    RAISE EXCEPTION 'RECEIVABLE_ACCOUNT_INVALID: حساب الذمم المدينة يجب أن يكون حساب أصول فرعيًا نشطًا في هذه المؤسسة' USING ERRCODE = '22023';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND property_id = p_resort_id;

    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dues
      WHERE unit_id = v_unit_id
        AND due_type_id = p_due_type_id
        AND issue_date = p_issue_date
        AND COALESCE(description, '') = COALESCE(p_description, '')
        AND status <> 'VOID'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_skipped_unit_ids := array_append(v_skipped_unit_ids, v_unit_id);
    ELSE
      -- No due without its journal entry: refuse (and roll everything back) when no OPEN period covers the date.
      PERFORM public.assert_open_fiscal_period_for_date(p_organization_id, p_issue_date);
      INSERT INTO public.dues (
        organization_id,
        property_id,
        unit_id,
        due_type_id,
        receivable_account_id,
        amount,
        issue_date,
        due_date,
        description,
        status,
        created_by
      ) VALUES (
        p_organization_id,
        p_resort_id,
        v_unit_id,
        p_due_type_id,
        p_receivable_account_id,
        v_unit_amount,
        p_issue_date,
        p_due_date,
        p_description,
        'ISSUED',
        v_user_id
      ) RETURNING id INTO v_new_due_id;

      -- Defence in depth: the AFTER INSERT trigger posts the accrual; if for any reason it did not, undo the issue.
      IF (SELECT d.journal_entry_id FROM public.dues d WHERE d.id = v_new_due_id) IS NULL THEN
        RAISE EXCEPTION 'DUE_NOT_POSTED: تعذّر ترحيل قيد الاستحقاق — لم يُصدر المستحق' USING ERRCODE = 'P0001';
      END IF;

      v_issued_count := v_issued_count + 1;
      v_total_amount := v_total_amount + v_unit_amount;
    END IF;
  END LOOP;

  v_action := CASE WHEN array_length(p_unit_ids, 1) = 1 THEN 'DUE_ISSUED' ELSE 'DUE_BATCH_ISSUED' END;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := v_action,
    p_entity_type := 'DUE',
    p_resort_id := p_resort_id,
    p_entity_id := NULL,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'target_units_count', array_length(p_unit_ids, 1),
      'issued_count', v_issued_count,
      'skipped_count', v_skipped_count,
      'total_amount', v_total_amount,
      'due_type_id', p_due_type_id,
      'issue_date', p_issue_date,
      'due_date', p_due_date
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_member_opening_balance(p_organization_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_as_of_date date, p_receivable_account_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- An opening balance without its journal entry would split the customer balance from the ledger: refuse atomically.
  perform public.assert_open_fiscal_period_for_date(p_organization_id, p_as_of_date);

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

  if (select d.journal_entry_id from public.dues d where d.id = v_due_id) is null then
    raise exception 'OPENING_BALANCE_NOT_POSTED: تعذّر ترحيل قيد الرصيد الافتتاحي — لم يُسجَّل الرصيد' using errcode = 'P0001';
  end if;

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
$function$;

ALTER FUNCTION public.issue_dues(uuid, uuid, uuid[], uuid, uuid, numeric, jsonb, date, date, text, inet, text) OWNER TO postgres;
ALTER FUNCTION public.record_member_opening_balance(uuid, uuid, uuid, numeric, date, uuid, text) OWNER TO postgres;
