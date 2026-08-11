-- Phase 5: cheque lifecycle.
--
-- Scope cut, stated plainly: OUTGOING cheques (paying suppliers) don't post
-- a journal entry at any stage yet, because the Suppliers module (Phase 6)
-- doesn't exist -- there is no AP account to credit at issuance. Tracking
-- their status is still fully audited via cheque_status_history; the GL
-- integration for outgoing cheques is Phase 6's job.
--
-- INCOMING cheques DO post: clearing an incoming cheque calls record_payment
-- internally (same engine used for cash/bank-transfer payments), so a
-- cleared cheque produces the exact same Dr Bank / Cr Receivable entry a
-- direct payment would, with the payment linked back on the cheque row.

create or replace function public.record_incoming_cheque(
  p_organization_id uuid,
  p_resort_id uuid,
  p_bank_account_id uuid,
  p_cheque_number text,
  p_amount numeric,
  p_member_id uuid,
  p_cheque_date date,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheque_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'banking.cheques.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_bank_account_id and organization_id = p_organization_id) then
    raise exception 'bank account does not belong to this organization';
  end if;

  insert into public.cheques (
    organization_id, resort_id, bank_account_id, direction, cheque_number, amount,
    member_id, cheque_date, due_date, status, created_by
  ) values (
    p_organization_id, p_resort_id, p_bank_account_id, 'INCOMING', p_cheque_number, p_amount,
    p_member_id, p_cheque_date, p_due_date, 'RECEIVED', auth.uid()
  )
  returning id into v_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by)
  values (v_cheque_id, null, 'RECEIVED', auth.uid());

  return v_cheque_id;
end;
$$;

-- Legal transitions that don't require GL posting (see clear_incoming_cheque
-- for the one transition that does).
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
    raise exception 'cheque not found';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_legal := (v_cheque.status, p_new_status) in (
    ('RECEIVED', 'DEPOSITED'), ('RECEIVED', 'CANCELLED'),
    ('DEPOSITED', 'RETURNED'),
    ('DRAFT', 'ISSUED'),
    ('ISSUED', 'CLEARED'), ('ISSUED', 'CANCELLED'), ('ISSUED', 'RETURNED')
  );
  if not v_legal then
    raise exception 'illegal cheque status transition: % -> %', v_cheque.status, p_new_status;
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
    raise exception 'cheque not found';
  end if;
  if v_cheque.direction <> 'INCOMING' then
    raise exception 'only incoming cheques clear through this function';
  end if;
  if v_cheque.status <> 'DEPOSITED' then
    raise exception 'cheque must be DEPOSITED before it can clear';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'not authorized' using errcode = '42501';
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
