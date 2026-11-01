-- PROPOSAL, NOT APPLIED OUTSIDE r6. Review before any environment other than r6.
-- Purpose: make the posting-dependent project fields and the project audit trail database-enforced.
--  1. Guard trigger on public.projects: once a project has any POSTED or REVERSED journal line, its
--     code, property and both ledger accounts (and its organization) cannot change, whoever writes
--     (application action, direct PostgREST UPDATE, or any other client).
--  2. capitalise_project_cost and release_project_wip take FOR UPDATE on the project row before reading
--     its accounts and posting. An edit and a posting therefore serialize on the row lock, so neither can
--     observe a half-changed project.
--  3. Audit: every project UPDATE that changes a tracked field writes PROJECT_UPDATED through
--     append_financial_audit_event (hash-chained).
--  4. anon and authenticated lose DELETE and TRUNCATE on projects (a delete would SET NULL the lines'
--     project_id and silently remove them from WIP reporting). service_role keeps them.
-- Forward-only: no earlier migration is edited. Rollback notes at the end of this file.

-- 1a. Is the project posted to? SECURITY DEFINER so that row-level security on journal tables cannot hide a line.
CREATE OR REPLACE FUNCTION public.project_has_postings(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.project_id = p_project_id
      AND je.status IN ('POSTED', 'REVERSED')
  );
$$;
REVOKE ALL ON FUNCTION public.project_has_postings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_has_postings(uuid) TO service_role;

-- 1b. Refuse a change to a locked field once postings exist.
CREATE OR REPLACE FUNCTION public.guard_project_locked_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'PROJECT_ORGANIZATION_IMMUTABLE: المؤسسة المالكة للمشروع لا تتغير'
      USING ERRCODE = '42501';
  END IF;
  IF (NEW.code IS DISTINCT FROM OLD.code
      OR NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.wip_account_id IS DISTINCT FROM OLD.wip_account_id
      OR NEW.cost_of_sales_account_id IS DISTINCT FROM OLD.cost_of_sales_account_id)
     AND public.project_has_postings(OLD.id) THEN
    RAISE EXCEPTION 'PROJECT_HAS_POSTINGS: للمشروع حركات مرحّلة، فلا يتغير كوده أو عقاره أو حسابيه'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_locked_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_locked_fields ON public.projects;
CREATE TRIGGER trg_projects_locked_fields
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_locked_fields();

-- 3. Audit trail. The action list is the live list (15 values, including FISCAL_YEAR_OPENED) plus PROJECT_UPDATED.
ALTER TABLE public.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;
ALTER TABLE public.financial_audit_logs ADD CONSTRAINT check_audit_action CHECK (action = ANY (ARRAY[
  'PAYMENT_CREATED'::text, 'PAYMENT_IDEMPOTENT_REPLAY'::text, 'PAYMENT_ALLOCATION_CREATED'::text, 'PAYMENT_REVERSED'::text,
  'DUE_ISSUED'::text, 'DUE_BATCH_ISSUED'::text, 'RECURRING_DUES_GENERATED'::text, 'RECURRING_DUES_SKIPPED'::text,
  'OPERATION_REJECTED'::text, 'LEASE_RENT_DUE_GENERATED'::text, 'LEASE_RENT_DUE_SKIPPED'::text,
  'OPENING_BALANCE_RECORDED'::text, 'FISCAL_YEAR_CLOSED'::text, 'FISCAL_PERIOD_STATUS_CHANGED'::text,
  'FISCAL_YEAR_OPENED'::text, 'PROJECT_UPDATED'::text])) NOT VALID;
ALTER TABLE public.financial_audit_logs VALIDATE CONSTRAINT check_audit_action;

CREATE OR REPLACE FUNCTION public.audit_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN v_changed := array_append(v_changed, 'code'); END IF;
  IF NEW.name_ar IS DISTINCT FROM OLD.name_ar THEN v_changed := array_append(v_changed, 'name_ar'); END IF;
  IF NEW.name_en IS DISTINCT FROM OLD.name_en THEN v_changed := array_append(v_changed, 'name_en'); END IF;
  IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN v_changed := array_append(v_changed, 'property_id'); END IF;
  IF NEW.wip_account_id IS DISTINCT FROM OLD.wip_account_id THEN v_changed := array_append(v_changed, 'wip_account_id'); END IF;
  IF NEW.cost_of_sales_account_id IS DISTINCT FROM OLD.cost_of_sales_account_id THEN
    v_changed := array_append(v_changed, 'cost_of_sales_account_id');
  END IF;
  IF NEW.budget_amount IS DISTINCT FROM OLD.budget_amount THEN v_changed := array_append(v_changed, 'budget_amount'); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN v_changed := array_append(v_changed, 'status'); END IF;
  IF cardinality(v_changed) > 0 THEN
    PERFORM public.append_financial_audit_event(
      NEW.organization_id, 'PROJECT_UPDATED', 'PROJECT', NULL, NEW.id, NULL, NULL, NULL,
      jsonb_build_object('project_id', NEW.id, 'changed_fields', to_jsonb(v_changed),
                         'has_postings', public.project_has_postings(OLD.id))
    );
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_project_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_audit_update ON public.projects;
CREATE TRIGGER trg_projects_audit_update
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_update();

-- 2. Serialize posting with edits: lock the project row before reading its accounts.

-- capitalise_project_cost: live definition with FOR UPDATE on the project row (only change)
CREATE OR REPLACE FUNCTION public.capitalise_project_cost(p_project_id uuid, p_amount numeric, p_credit_account_id uuid, p_entry_date date, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك برسملة تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حساب الأعمال تحت التنفيذ وحساب تكلفة المبيعات للمشروع (%) أولًا',
      v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_COST_NOT_POSITIVE: قيمة الرسملة يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  if v_project.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'PROJECT_NOT_OPEN: المشروع (%) بحالة % فلا تُرسمل عليه تكلفة جديدة',
      v_project.code, v_project.status
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'WIP — ' || v_project.code || ' — ' || coalesce(p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.wip_account_id, 'debit', p_amount, 'credit', 0,
                         'project_id', p_project_id),
      jsonb_build_object('account_id', p_credit_account_id, 'debit', 0, 'credit', p_amount,
                         'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$function$
;

-- release_project_wip: live definition with FOR UPDATE on the project row (only change)
CREATE OR REPLACE FUNCTION public.release_project_wip(p_project_id uuid, p_amount numeric, p_entry_date date, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_balance numeric;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتحرير تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حسابي المشروع (%) أولًا', v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_RELEASE_NOT_POSITIVE: قيمة التحرير يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  select s.wip_balance into v_balance from public.project_wip_summary(p_project_id) s;

  if p_amount > coalesce(v_balance, 0) then
    raise exception
      'PROJECT_RELEASE_EXCEEDS_WIP: التحرير (%) يتجاوز رصيد الأعمال تحت التنفيذ (%)',
      p_amount, coalesce(v_balance, 0)
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'Cost of sales — ' || v_project.code || coalesce(' — ' || p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.cost_of_sales_account_id,
                         'debit', p_amount, 'credit', 0, 'project_id', p_project_id),
      jsonb_build_object('account_id', v_project.wip_account_id,
                         'debit', 0, 'credit', p_amount, 'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$function$
;

-- 4. Direct deletes and truncation of projects are not part of any product path; a delete would silently
--    detach journal lines (ON DELETE SET NULL). service_role keeps full access for operators.
REVOKE DELETE, TRUNCATE ON public.projects FROM anon, authenticated;
