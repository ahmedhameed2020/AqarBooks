-- Domain RPCs for installment_plans. Phase 3 of
-- docs/superpowers/plans/2026-08-17-unit-installment-plans-implementation-plan.md.
--
-- Unlike unit_leases' RPCs (create then a separate activate step),
-- create_installment_plan does everything eagerly in one transaction: the
-- ownership record, the plan row, and every installment due -- there is no
-- DRAFT/ACTIVATE split (approved decision, 2026-08-17).
create or replace function public.create_installment_plan(
  p_organization_id uuid,
  p_unit_id uuid,
  p_buyer_member_id uuid,
  p_due_type_id uuid,
  p_receivable_account_id uuid,
  p_total_price numeric,
  p_down_payment numeric,
  p_installment_count int,
  p_installment_frequency text,
  p_starts_on date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_property_id uuid;
  v_plan_id uuid;
  v_financed numeric;
  v_per_installment numeric;
  v_last_installment numeric;
  v_due_id uuid;
  v_pi_id uuid;
  v_due_date date;
  v_period interval;
  v_i int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.installments.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة خطط التقسيط' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;

  select property_id into v_property_id
  from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_property_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.members where id = p_buyer_member_id and organization_id = p_organization_id) then
    raise exception 'BUYER_NOT_FOUND: العضو غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if not exists (select 1 from public.due_types where id = p_due_type_id and organization_id = p_organization_id) then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if not exists (select 1 from public.chart_of_accounts where id = p_receivable_account_id and organization_id = p_organization_id) then
    raise exception 'ACCOUNT_NOT_FOUND: حساب الذمم غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if p_down_payment > p_total_price then
    raise exception 'INVALID_DOWN_PAYMENT: الدفعة المقدمة أكبر من السعر الإجمالي' using errcode = '22023';
  end if;

  -- Buyer becomes the recorded owner immediately (100% share) -- ownership
  -- record-keeping and payment-completion status are deliberately
  -- orthogonal in this schema, same as unit_leases never touching
  -- unit_ownerships either.
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact, start_date, created_by)
  values (p_organization_id, p_unit_id, p_buyer_member_id, 100, true, p_starts_on, auth.uid());

  begin
    insert into public.installment_plans (
      organization_id, property_id, unit_id, buyer_member_id, due_type_id, receivable_account_id,
      total_price, down_payment, installment_count, installment_frequency, starts_on, created_by
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_buyer_member_id, p_due_type_id, p_receivable_account_id,
      p_total_price, p_down_payment, p_installment_count, p_installment_frequency, p_starts_on, auth.uid()
    ) returning id into v_plan_id;
  exception when unique_violation then
    raise exception 'UNIT_HAS_ACTIVE_PLAN: يوجد بالفعل خطة تقسيط نشطة لهذه الوحدة' using errcode = '22023';
  end;

  v_financed := p_total_price - p_down_payment;
  v_per_installment := round(v_financed / p_installment_count, 4);
  v_last_installment := v_financed - v_per_installment * (p_installment_count - 1);

  v_period := case p_installment_frequency
    when 'MONTHLY' then interval '1 month'
    when 'QUARTERLY' then interval '3 months'
    when 'YEARLY' then interval '1 year'
  end;

  -- Down payment (sequence 0) is due immediately, at starts_on. If there's
  -- no down payment, installment 1 is what's due at starts_on instead
  -- (v_i - 1 below covers both cases uniformly).
  if p_down_payment > 0 then
    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, source_type
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_due_type_id, p_receivable_account_id,
      p_down_payment, p_starts_on, p_starts_on, 'دفعة مقدمة', 'ISSUED', 'INSTALLMENT_PLAN'
    ) returning id into v_due_id;

    insert into public.plan_installments (plan_id, due_id, sequence_no, principal_amount)
    values (v_plan_id, v_due_id, 0, p_down_payment)
    returning id into v_pi_id;

    update public.dues set source_id = v_pi_id where id = v_due_id;
  end if;

  for v_i in 1..p_installment_count loop
    v_due_date := case
      when p_down_payment > 0 then (p_starts_on + (v_i * v_period))::date
      else (p_starts_on + ((v_i - 1) * v_period))::date
    end;

    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, source_type
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_due_type_id, p_receivable_account_id,
      case when v_i = p_installment_count then v_last_installment else v_per_installment end,
      v_due_date, v_due_date, 'قسط ' || v_i || ' من ' || p_installment_count, 'ISSUED', 'INSTALLMENT_PLAN'
    ) returning id into v_due_id;

    insert into public.plan_installments (plan_id, due_id, sequence_no, principal_amount)
    values (v_plan_id, v_due_id, v_i, case when v_i = p_installment_count then v_last_installment else v_per_installment end)
    returning id into v_pi_id;

    update public.dues set source_id = v_pi_id where id = v_due_id;
  end loop;

  -- Reuses the existing DUE_BATCH_ISSUED action (issue_dues' bulk-issuance
  -- event) rather than adding a new financial_audit_logs action value --
  -- the semantics genuinely match ("more than one due created together").
  perform public.append_financial_audit_event(
    p_organization_id, 'DUE_BATCH_ISSUED', 'installment_plan', v_property_id, v_plan_id, null, null, null,
    jsonb_build_object('installment_count', p_installment_count, 'total_price', p_total_price, 'down_payment', p_down_payment)
  );

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_property_id, 'installment_plan.created', 'installment_plan', v_plan_id,
    jsonb_build_object('unit_id', p_unit_id, 'buyer_member_id', p_buyer_member_id, 'total_price', p_total_price));

  return v_plan_id;
end;
$$;

create or replace function public.cancel_installment_plan(p_plan_id uuid, p_cancel_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.installment_plans;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'PLAN_NOT_FOUND: خطة التقسيط غير موجودة' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_plan.organization_id, 'property.installments.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة خطط التقسيط' using errcode = '42501';
  end if;
  if v_plan.status <> 'ACTIVE' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إلغاء خطة ليست نشطة (الحالة الحالية: %)', v_plan.status
      using errcode = '22023';
  end if;
  if p_cancel_reason is null or trim(p_cancel_reason) = '' then
    raise exception 'CANCEL_REASON_REQUIRED: يجب إدخال سبب الإلغاء' using errcode = '22023';
  end if;

  -- VOIDs only not-yet-paid installments -- already-PAID ones are
  -- untouched, this is not a refund flow.
  update public.dues
  set status = 'VOID'
  where id in (select due_id from public.plan_installments where plan_id = p_plan_id)
    and status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE');

  update public.installment_plans
  set status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = p_cancel_reason
  where id = p_plan_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_plan.organization_id, v_plan.property_id, 'installment_plan.cancelled', 'installment_plan', p_plan_id,
    jsonb_build_object('reason', p_cancel_reason));
end;
$$;

-- When the last unpaid installment due for a plan posts to PAID, the plan
-- auto-completes. Scoped tightly (WHEN clause + immediate NEW.source_type
-- guard) so it's a no-op for every other due update in the system,
-- including lease-rent dues and ordinary manually-issued ones.
create or replace function public.check_installment_plan_completion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan_id uuid;
  v_remaining int;
begin
  select pi.plan_id into v_plan_id from public.plan_installments pi where pi.due_id = new.id;
  if v_plan_id is null then
    return new;
  end if;

  select count(*) into v_remaining
  from public.plan_installments pi
  join public.dues d on d.id = pi.due_id
  where pi.plan_id = v_plan_id and d.status <> 'PAID';

  if v_remaining = 0 then
    update public.installment_plans set status = 'COMPLETED' where id = v_plan_id and status = 'ACTIVE';
  end if;

  return new;
end;
$$;

create trigger trg_check_installment_plan_completion
  after update on public.dues
  for each row
  when (new.source_type = 'INSTALLMENT_PLAN' and new.status = 'PAID' and old.status is distinct from 'PAID')
  execute function public.check_installment_plan_completion();

notify pgrst, 'reload schema';
