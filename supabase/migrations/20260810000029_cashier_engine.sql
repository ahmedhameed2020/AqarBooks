-- Phase 5: cashier session lifecycle. open/close are the only writers of
-- cashier_sessions; the unique-open-session-per-cashbox index (previous
-- migration) plus the OPEN-status check here are what make "cashier cannot
-- transact without an open session" and "closed sessions cannot be edited"
-- actually true.

create or replace function public.open_cashier_session(
  p_organization_id uuid,
  p_resort_id uuid,
  p_cashbox_id uuid,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'cashier.sessions.open') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if not exists (
    select 1 from public.cashboxes
    where id = p_cashbox_id and organization_id = p_organization_id and is_active
  ) then
    raise exception 'cashbox does not belong to this organization or is inactive';
  end if;
  if exists (select 1 from public.cashier_sessions where cashbox_id = p_cashbox_id and status = 'OPEN') then
    raise exception 'this cashbox already has an open session';
  end if;

  insert into public.cashier_sessions (organization_id, resort_id, cashbox_id, opened_by, opening_balance)
  values (p_organization_id, p_resort_id, p_cashbox_id, auth.uid(), coalesce(p_opening_balance, 0))
  returning id into v_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$$;

create or replace function public.close_cashier_session(
  p_session_id uuid,
  p_actual_closing_balance numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cashier_sessions;
  v_receipts numeric(19, 4);
  v_payments numeric(19, 4);
  v_expected numeric(19, 4);
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'cashier session not found';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.sessions.close') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_session.status <> 'OPEN' then
    raise exception 'only an open session can be closed';
  end if;

  select
    coalesce(sum(amount) filter (where type = 'RECEIPT'), 0),
    coalesce(sum(amount) filter (where type = 'PAYMENT'), 0)
  into v_receipts, v_payments
  from public.cash_transactions
  where session_id = p_session_id;

  v_expected := v_session.opening_balance + v_receipts - v_payments;

  update public.cashier_sessions
  set status = 'CLOSED',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_closing_balance = v_expected,
      actual_closing_balance = p_actual_closing_balance,
      variance = p_actual_closing_balance - v_expected
  where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.closed', 'cashier_session', p_session_id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_closing_balance, 'variance', p_actual_closing_balance - v_expected));
end;
$$;

create or replace function public.reconcile_cashier_session(
  p_session_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cashier_sessions;
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'cashier session not found';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.reconciliations.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_session.status <> 'CLOSED' then
    raise exception 'only a closed session can be reconciled';
  end if;

  update public.cashier_sessions set status = 'RECONCILED' where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);
end;
$$;
