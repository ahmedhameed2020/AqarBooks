-- Phase 2e of the resort -> property domain rename. Surgically updates the
-- 5 functions that genuinely reference chart_of_accounts.resort_id or
-- user_role_assignments.resort_id -- 3 complete edits
-- (has_financial_permission, add_organization_member,
-- create_organization_onboarding) and 2 PARTIAL edits
-- (record_online_payment, validate_online_payments_clearing_account).
--
-- The two partial edits touch ONLY chart_of_accounts.resort_id references
-- in these functions (v_clearing_account.resort_id /
-- v_account.resort_id). Every OTHER resort_id reference in the same two
-- function bodies -- online_payment_transactions (v_txn), dues (v_due),
-- organization_finance_settings (ofs / new) -- belongs to Phase 2g and is
-- deliberately left untouched here. Both functions will need at least one
-- more edit before they are fully migrated; see this repo's Phase 2e PR
-- description for the explicit "not yet complete" note on both.

create or replace function public.has_financial_permission(p_organization_id uuid, p_permission_key text, p_resort_id uuid DEFAULT NULL::uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_actor_id uuid;
  v_org_status text;
  v_has_perm boolean := false;
BEGIN
  -- أ. الاعتماد حصراً على auth.uid() ومنع الاستدعاء كمنفذ آخر
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  -- ب. فحص حالة المنظمة (العمليات المالية تُرفض إذا كانت SUSPENDED أو ARCHIVED)
  SELECT status INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status IN ('SUSPENDED', 'ARCHIVED') THEN
    RETURN false;
  END IF;

  -- ج. التحقق من صحة المنتجع وتبعيته للمنظمة إن تم تزويده
  IF p_resort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resorts
      WHERE id = p_resort_id AND organization_id = p_organization_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- د. التحقق من العضوية النشطة للمستخدم في المنظمة
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND user_id = v_actor_id
      AND status = 'active'
  ) THEN
    RETURN false;
  END IF;

  -- هـ. استثناء منشئ/مالك المنظمة (Owner Bypass) بشرط حالة المنظمة النشطة
  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  -- و. فحص التعيينات والأدوار والصلاحيات المربوطة مع مراعاة نطاق المنتجع (Resort Scope)
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ura.user_id = v_actor_id
      AND ura.organization_id = p_organization_id
      AND (r.organization_id IS NULL OR r.organization_id = p_organization_id)
      AND (
        ura.property_id IS NULL
        OR p_resort_id IS NULL
        OR ura.property_id = p_resort_id
      )
      AND p.key = p_permission_key
  ) INTO v_has_perm;

  RETURN COALESCE(v_has_perm, false);
END;
$function$;

create or replace function public.add_organization_member(p_organization_id uuid, p_user_id uuid, p_role_key text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.users.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  select id into v_role_id
  from public.roles
  where organization_id = p_organization_id and key = p_role_key;

  if v_role_id is null then
    raise exception 'unknown role for this organization: %', p_role_key;
  end if;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'invited')
  on conflict (organization_id, user_id) do update set status = 'invited';

  insert into public.user_role_assignments (user_id, role_id, organization_id, created_by)
  values (p_user_id, v_role_id, p_organization_id, auth.uid())
  on conflict (user_id, role_id, organization_id, property_id) do nothing;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'organization_member.added', 'user', p_user_id,
    jsonb_build_object('role_key', p_role_key));
end;
$function$;

create or replace function public.create_organization_onboarding(p_org_name text, p_entity_type text, p_entity_type_custom_label text DEFAULT NULL::text, p_resort_name text DEFAULT NULL::text, p_resort_code text DEFAULT NULL::text, p_timezone text DEFAULT 'Africa/Cairo'::text, p_default_currency text DEFAULT 'EGP'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_actor_id uuid;
  v_user_record record;
  v_clean_org_name text;
  v_clean_entity_type text;
  v_clean_custom_label text;
  v_clean_resort_name text;
  v_clean_resort_code text;
  v_slug text;
  v_base_slug text;
  v_counter integer := 1;
  v_org_id uuid;
  v_resort_id uuid;
  v_owner_role_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: يرجى تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT id, email, email_confirmed_at INTO v_user_record
  FROM auth.users WHERE id = v_actor_id;

  IF v_user_record.id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: حساب المستخدم غير موجود' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = v_actor_id AND status IN ('active', 'invited')
  ) THEN
    RAISE EXCEPTION 'ALREADY_HAS_ORGANIZATION: الحساب ينتمي لكيان مؤسسي بالفعل' USING ERRCODE = '42501';
  END IF;

  v_clean_org_name := trim(COALESCE(p_org_name, ''));
  IF char_length(v_clean_org_name) < 2 OR char_length(v_clean_org_name) > 150 THEN
    RAISE EXCEPTION 'INVALID_ORG_NAME: اسم الكيان يجب أن يكون بين 2 و 150 حرفاً' USING ERRCODE = '22023';
  END IF;

  v_clean_entity_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_entity_type NOT IN (
    'DEVELOPER','FACILITY_MANAGEMENT','OWNERS_ASSOCIATION','INDIVIDUAL_OWNER',
    'TOURIST_RESORT','TOURIST_VILLAGE','RESIDENTIAL_COMPOUND','OTHER'
  ) THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: نوع الكيان المحدد غير مدعوم' USING ERRCODE = '22023';
  END IF;

  IF v_clean_entity_type = 'OTHER' THEN
    v_clean_custom_label := trim(COALESCE(p_entity_type_custom_label, ''));
    IF char_length(v_clean_custom_label) < 2 THEN
      RAISE EXCEPTION 'CUSTOM_LABEL_REQUIRED: يرجى إدخال وصف نوع الكيان عند اختيار "أخرى"' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_clean_custom_label := NULL;
  END IF;

  v_clean_resort_name := trim(COALESCE(p_resort_name, ''));
  IF char_length(v_clean_resort_name) < 2 THEN
    RAISE EXCEPTION 'INVALID_RESORT_NAME: اسم المشروع/المنتجع مطلوب' USING ERRCODE = '22023';
  END IF;

  v_clean_resort_code := upper(trim(COALESCE(p_resort_code, '')));
  IF char_length(v_clean_resort_code) < 2 THEN
    v_clean_resort_code := 'RES-01';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('onboarding_' || v_actor_id::text));

  v_base_slug := lower(regexp_replace(v_clean_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug IS NULL OR char_length(v_base_slug) < 2 THEN
    v_base_slug := 'entity-' || lower(substr(md5(random()::text), 1, 8));
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter::text;
  END LOOP;

  INSERT INTO public.organizations (
    name, slug, default_currency, entity_type,
    entity_type_custom_label, status, created_by, updated_by
  ) VALUES (
    v_clean_org_name, v_slug, COALESCE(p_default_currency, 'EGP'),
    v_clean_entity_type, v_clean_custom_label,
    'ACTIVE', v_actor_id, v_actor_id
  ) RETURNING id INTO v_org_id;

  -- استنساخ قوالب الأدوار (يُنشئ TENANT_OWNER مرتبطاً بهذا الكيان)
  PERFORM public.clone_tenant_role_templates(v_org_id);

  INSERT INTO public.resorts (
    organization_id, name, code, timezone, created_by, updated_by
  ) VALUES (
    v_org_id, v_clean_resort_name, v_clean_resort_code,
    COALESCE(p_timezone, 'Africa/Cairo'), v_actor_id, v_actor_id
  ) RETURNING id INTO v_resort_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (v_org_id, v_actor_id, 'active');

  -- جلب TENANT_OWNER بعد الاستنساخ (وليس قبله)
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE key = 'TENANT_OWNER' AND organization_id = v_org_id
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_CLONE_FAILED: فشل استنساخ أدوار الكيان' USING ERRCODE = '50000';
  END IF;

  INSERT INTO public.user_role_assignments (
    user_id, role_id, organization_id, property_id, created_by
  ) VALUES (v_actor_id, v_owner_role_id, v_org_id, NULL, v_actor_id);

  INSERT INTO public.platform_audit_logs (
    actor_id, organization_id, action, entity_type, entity_id, safe_change_summary
  ) VALUES (
    v_actor_id, v_org_id, 'organization.onboarding_completed',
    'organization', v_org_id,
    jsonb_build_object(
      'name', v_clean_org_name,
      'entity_type', v_clean_entity_type,
      'resort_id', v_resort_id,
      'slug', v_slug
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'resort_id', v_resort_id,
    'slug', v_slug
  );
END;
$function$;

create or replace function public.record_online_payment(p_transaction_id uuid, p_webhook_event_id text, p_provider_payload jsonb DEFAULT NULL::jsonb)
 returns TABLE(status text, payment_id uuid, failure_code text, failure_message text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_txn public.online_payment_transactions;
  v_alloc record;
  v_due public.dues;
  v_paid_so_far numeric(19,4);
  v_result record;
  v_allocations_jsonb jsonb := '[]'::jsonb;
  v_clearing_account_id uuid;
  v_clearing_account public.chart_of_accounts;
  v_fiscal_period_id uuid;
  v_failure_message text;
begin
  select * into v_txn from public.online_payment_transactions
  where id = p_transaction_id for update;

  if v_txn.id is null then
    raise exception 'ONLINE_TXN_NOT_FOUND: transaction % not found', p_transaction_id using errcode = '22023';
  end if;

  if v_txn.status = 'PAID' then
    return query select 'PAID'::text, v_txn.payment_id, null::text, null::text;
    return;
  end if;

  if v_txn.status <> 'PENDING' then
    raise exception 'ONLINE_TXN_NOT_PENDING: cannot post a % transaction', v_txn.status using errcode = '22023';
  end if;

  -- Take the SAME organization-scoped advisory lock that post_payment_internal
  -- takes for record_payment, and take it BEFORE locking any dues row below.
  -- record_payment's path always acquires this lock first and only then locks
  -- dues; if record_online_payment locked dues first and only acquired this
  -- lock later (inside post_payment_internal), a concurrent record_payment
  -- (holding the advisory lock, waiting on a due this function already locked)
  -- and this function (holding that due, now waiting on the advisory lock)
  -- would form an AB-BA circular wait -- a genuine deadlock, not just lock
  -- contention. Acquiring the identical lock key here, before the due-locking
  -- loop, makes both callers take the advisory lock before any dues row lock,
  -- in the same relative order, for any organization -- which is what
  -- actually prevents the deadlock. post_payment_internal's own later
  -- pg_advisory_xact_lock call with this same key is a no-op once we already
  -- hold it: Postgres advisory xact locks are reentrant within a transaction.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || v_txn.organization_id::text));

  -- Clearing account: resolve from organization_finance_settings, re-validate
  -- the same four conditions the config-time trigger already checked (an
  -- account can be deactivated after configuration). No fallback, ever.
  select ofs.online_payments_clearing_account_id into v_clearing_account_id
  from public.organization_finance_settings ofs
  where ofs.organization_id = v_txn.organization_id and ofs.resort_id = v_txn.resort_id;

  if v_clearing_account_id is not null then
    select * into v_clearing_account from public.chart_of_accounts where id = v_clearing_account_id;
  end if;

  if v_clearing_account_id is null
    or v_clearing_account.id is null
    or v_clearing_account.category <> 'ASSET'
    or v_clearing_account.is_group
    or not v_clearing_account.is_active
    or (v_clearing_account.property_id is not null and v_clearing_account.property_id <> v_txn.resort_id)
  then
    v_failure_message := format('No valid online-payments clearing account configured for resort %s', v_txn.resort_id);
    update public.online_payment_transactions
    set status = 'FAILED', failed_at = now(),
        failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'FAILED'::text, null::uuid, 'CLEARING_ACCOUNT_NOT_CONFIGURED'::text, v_failure_message;
    return;
  end if;

  -- Fiscal period: fiscal_periods has no resort_id column (org-wide), so
  -- resolve purely by organization_id + date range. current_date is the
  -- posting date for an online payment -- there is no staff member choosing
  -- one. Columns are alias-qualified (fp.*) because the function's own
  -- RETURNS TABLE column `status` is visible as a bare PL/pgSQL identifier
  -- inside this function body and would otherwise collide with
  -- fiscal_periods.status, making an unqualified `status = 'OPEN'` raise
  -- "column reference status is ambiguous" (42702).
  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_txn.organization_id
    and fp.status = 'OPEN'
    and current_date between fp.start_date and fp.end_date
  order by fp.start_date desc
  limit 1;

  if v_fiscal_period_id is null then
    v_failure_message := format('No open fiscal period covers %s for organization %s', current_date, v_txn.organization_id);
    update public.online_payment_transactions
    set failure_code = 'OPEN_PERIOD_REQUIRED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    -- status stays PENDING -- retryable, see design doc Decision 2.
    return query select 'PENDING'::text, null::uuid, 'OPEN_PERIOD_REQUIRED'::text, v_failure_message;
    return;
  end if;

  -- Lock every allocated due in a fixed (due_id) order. Deadlock safety here
  -- comes from the org-scoped advisory lock acquired above, taken before this
  -- loop touches any dues row -- both this function and record_payment now
  -- take that same advisory lock before locking any due, in the same
  -- relative order, so a concurrent staff-side record_payment call touching
  -- an overlapping due can never deadlock against this function.
  for v_alloc in
    select due_id, amount from public.online_payment_transaction_allocations
    where transaction_id = p_transaction_id
    order by due_id
  loop
    select * into v_due from public.dues where id = v_alloc.due_id for update;

    if v_due.id is null or v_due.organization_id <> v_txn.organization_id or v_due.resort_id <> v_txn.resort_id then
      v_failure_message := format('Due %s is outside this transaction''s organization/resort', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_OUT_OF_SCOPE', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_OUT_OF_SCOPE'::text, v_failure_message;
      return;
    end if;

    if not exists (
      select 1 from public.unit_ownerships uo
      where uo.unit_id = v_due.unit_id
        and uo.member_id = v_txn.member_id
        and (uo.end_date is null or uo.end_date >= current_date)
    ) then
      v_failure_message := format('Due %s''s unit is not owned by member %s', v_alloc.due_id, v_txn.member_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_NOT_OWNED_BY_MEMBER', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_NOT_OWNED_BY_MEMBER'::text, v_failure_message;
      return;
    end if;

    if v_due.status = 'VOID' then
      v_failure_message := format('Due %s is no longer payable (void)', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    if v_alloc.amount > (v_due.amount - v_paid_so_far) then
      v_failure_message := format('Due %s no longer has enough remaining balance for %s', v_alloc.due_id, v_alloc.amount);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    v_allocations_jsonb := v_allocations_jsonb || jsonb_build_array(jsonb_build_object('due_id', v_alloc.due_id, 'amount', v_alloc.amount));
  end loop;

  -- Every allocation still fits -- proceed to the shared accounting core.
  -- p_unit_id is null: an online transaction may span dues on more than one
  -- unit (design doc Decision 4); payments.unit_id representing "the" unit
  -- doesn't apply when allocations aren't single-unit, so it's left unset
  -- rather than picking one allocation's unit arbitrarily.
  select * into v_result from public.post_payment_internal(
    p_organization_id => v_txn.organization_id,
    p_resort_id => v_txn.resort_id,
    p_member_id => v_txn.member_id,
    p_unit_id => null,
    p_amount => v_txn.amount,
    p_method => 'ONLINE',
    p_payment_date => current_date,
    p_deposit_account_id => v_clearing_account_id,
    p_fiscal_period_id => v_fiscal_period_id,
    p_allocations => v_allocations_jsonb,
    p_idempotency_key => 'online:' || p_transaction_id::text,
    p_cashier_session_id => null,
    p_actor_id => null
  );

  update public.online_payment_transactions
  set status = 'PAID',
      payment_id = v_result.payment_id,
      paid_at = now(),
      webhook_event_id = p_webhook_event_id,
      provider_payload = coalesce(p_provider_payload, provider_payload)
  where id = p_transaction_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (null, v_txn.organization_id, v_txn.resort_id, 'online_payment.posted', 'online_payment_transaction', p_transaction_id,
    jsonb_build_object('payment_id', v_result.payment_id, 'amount', v_txn.amount, 'provider', v_txn.provider));

  return query select 'PAID'::text, v_result.payment_id, null::text, null::text;
end;
$function$;

create or replace function public.validate_online_payments_clearing_account()
 returns trigger
 language plpgsql
as $function$
declare
  v_account public.chart_of_accounts;
begin
  if not exists (
    select 1 from public.resorts where id = new.resort_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select * into v_account
  from public.chart_of_accounts
  where id = new.online_payments_clearing_account_id;

  if v_account.id is null or v_account.organization_id <> new.organization_id then
    raise exception 'CLEARING_ACCOUNT_NOT_IN_ORGANIZATION: الحساب المحدد لا يتبع هذا الكيان' using errcode = '22023';
  end if;
  if v_account.category <> 'ASSET' then
    raise exception 'CLEARING_ACCOUNT_NOT_ASSET: حساب المقاصة يجب أن يكون من نوع أصول' using errcode = '22023';
  end if;
  if v_account.is_group then
    raise exception 'CLEARING_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي كحساب مقاصة' using errcode = '22023';
  end if;
  if not v_account.is_active then
    raise exception 'CLEARING_ACCOUNT_INACTIVE: حساب المقاصة غير نشط' using errcode = '22023';
  end if;
  if v_account.property_id is not null and v_account.property_id <> new.resort_id then
    raise exception 'CLEARING_ACCOUNT_RESORT_MISMATCH: حساب المقاصة يتبع موقعًا مختلفًا' using errcode = '22023';
  end if;

  return new;
end;
$function$;
