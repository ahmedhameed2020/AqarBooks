-- Lets staff cancel a due they issued by mistake. Only allowed while the due
-- is still fully unpaid ('ISSUED') -- once any payment has been allocated to
-- it (PARTIALLY_PAID/PAID) voiding would silently orphan real cash movement,
-- so those must be corrected through payment reversal instead.
create or replace function public.void_due(
  p_organization_id uuid,
  p_due_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text;
begin
  if not public.has_financial_permission(p_organization_id, 'finance.dues.issue', null) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء المستحقات' using errcode = '42501';
  end if;

  select status into v_status from public.dues where id = p_due_id and organization_id = p_organization_id;
  if v_status is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = '22023';
  end if;
  if v_status <> 'ISSUED' then
    raise exception 'DUE_NOT_VOIDABLE: لا يمكن إلغاء مستحق تم تحصيل جزء منه بالفعل أو ملغى مسبقًا' using errcode = '22023';
  end if;

  update public.dues set status = 'VOID' where id = p_due_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, 'due.voided', 'due', p_due_id, p_reason, '{}'::jsonb);
end;
$$;
