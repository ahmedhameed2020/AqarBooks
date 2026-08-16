-- Translates the remaining raw English exceptions in the cheque lifecycle
-- RPCs (set_cheque_status, clear_incoming_cheque) to the bilingual
-- "CODE: رسالة عربية" format formErrorMessage() already knows how to
-- render, matching what record_incoming_cheque/record_payment already got
-- in 20260812000032. Logic is unchanged -- only the exception text.

create or replace function public.set_cheque_status(
  p_cheque_id uuid,
  p_new_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheque public.cheques;
  v_legal boolean;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if v_cheque.id is null then
    raise exception 'CHEQUE_NOT_FOUND: الشيك غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الشيكات' using errcode = '42501';
  end if;

  v_legal := (v_cheque.status, p_new_status) in (
    ('RECEIVED', 'DEPOSITED'), ('RECEIVED', 'CANCELLED'),
    ('DEPOSITED', 'RETURNED'),
    ('DRAFT', 'ISSUED'),
    ('ISSUED', 'CLEARED'), ('ISSUED', 'CANCELLED'), ('ISSUED', 'RETURNED')
  );
  if not v_legal then
    raise exception 'ILLEGAL_CHEQUE_STATUS: لا يمكن تغيير حالة الشيك من % إلى %', v_cheque.status, p_new_status using errcode = '22023';
  end if;

  update public.cheques set status = p_new_status where id = p_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by, note)
  values (p_cheque_id, v_cheque.status, p_new_status, auth.uid(), p_note);
end;
$$;

create or replace function public.clear_incoming_cheque(
  p_cheque_id uuid,
  p_clearing_date date,
  p_fiscal_period_id uuid,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheque public.cheques;
  v_bank_gl_account_id uuid;
  v_payment_id uuid;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if v_cheque.id is null then
    raise exception 'CHEQUE_NOT_FOUND: الشيك غير موجود' using errcode = '22023';
  end if;
  if v_cheque.direction <> 'INCOMING' then
    raise exception 'CHEQUE_NOT_INCOMING: يمكن تحصيل الشيكات الواردة فقط عبر هذه الوظيفة' using errcode = '22023';
  end if;
  if v_cheque.status <> 'DEPOSITED' then
    raise exception 'CHEQUE_NOT_DEPOSITED: يجب أن يكون الشيك بحالة (مودَع) قبل تحصيله' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الشيكات' using errcode = '42501';
  end if;

  select gl_account_id into v_bank_gl_account_id from public.bank_accounts where id = v_cheque.bank_account_id;

  v_payment_id := public.record_payment(
    v_cheque.organization_id, v_cheque.resort_id, v_cheque.member_id, null, v_cheque.amount,
    'CHEQUE', p_clearing_date, v_bank_gl_account_id, p_fiscal_period_id, p_allocations, null, null
  );

  update public.cheques set status = 'CLEARED', payment_id = v_payment_id where id = p_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by, note)
  values (p_cheque_id, 'DEPOSITED', 'CLEARED', auth.uid(), 'Cleared via payment ' || v_payment_id);

  return v_payment_id;
end;
$$;
