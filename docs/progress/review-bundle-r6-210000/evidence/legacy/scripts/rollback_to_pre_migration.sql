-- ROLLBACK of the project guard. The check_audit_action constraint is intentionally NOT narrowed: PROJECT_UPDATED audit rows are hash-chained and cannot be deleted; keeping the wider list is a superset and changes no behaviour.
BEGIN;
DROP TRIGGER IF EXISTS trg_projects_audit_update ON public.projects;
DROP TRIGGER IF EXISTS trg_projects_locked_fields ON public.projects;
DROP FUNCTION IF EXISTS public.audit_project_update();
DROP FUNCTION IF EXISTS public.guard_project_locked_fields();
DROP FUNCTION IF EXISTS public.project_has_postings(uuid);
GRANT DELETE, TRUNCATE ON public.projects TO anon, authenticated;
-- original bodies, from the baseline migration (capitalise: 1078-1142, release: 8614-8681)
CREATE OR REPLACE FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
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
$$;;

CREATE OR REPLACE FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_balance numeric;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
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
$$;;
COMMIT;
