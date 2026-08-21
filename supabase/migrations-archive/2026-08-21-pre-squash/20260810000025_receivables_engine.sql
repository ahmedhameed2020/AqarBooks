-- Phase 4: receivables engine. Both entry points create and POST a journal
-- entry in the same transaction as the domain row(s) -- there is no path
-- where a due or payment exists without its accounting effect, or vice
-- versa (spec §17 "Payment and journal creation are atomic").

create or replace function public.issue_due(
  p_organization_id uuid,
  p_resort_id uuid,
  p_unit_id uuid,
  p_due_type_id uuid,
  p_receivable_account_id uuid,
  p_amount numeric,
  p_issue_date date,
  p_due_date date,
  p_description text,
  p_fiscal_period_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue_account_id uuid;
  v_entry_id uuid;
  v_due_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'receivables.dues.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select default_revenue_account_id into v_revenue_account_id
  from public.due_types
  where id = p_due_type_id and organization_id = p_organization_id;

  if v_revenue_account_id is null then
    raise exception 'due type does not belong to this organization';
  end if;

  if not exists (select 1 from public.units where id = p_unit_id and organization_id = p_organization_id) then
    raise exception 'unit does not belong to this organization';
  end if;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_issue_date,
    coalesce(p_description, 'Due issued'), 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', p_receivable_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry(v_entry_id);

  insert into public.dues (
    organization_id, resort_id, unit_id, due_type_id, receivable_account_id,
    amount, issue_date, due_date, description, status, journal_entry_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_unit_id, p_due_type_id, p_receivable_account_id,
    p_amount, p_issue_date, p_due_date, p_description, 'ISSUED', v_entry_id, auth.uid()
  )
  returning id into v_due_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'due.issued', 'due', v_due_id,
    jsonb_build_object('amount', p_amount, 'unit_id', p_unit_id));

  return v_due_id;
end;
$$;

create or replace function public.record_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_member_id uuid,
  p_unit_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb -- [{ "due_id": uuid, "amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19, 4) := 0;
  v_remaining numeric(19, 4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'receivables.payments.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'at least one allocation is required';
  end if;

  -- Validate every allocation against the actual remaining balance of its
  -- due (sum of amount already allocated, from previously posted payments)
  -- before touching anything, so a bad request never partially applies.
  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    if v_due.id is null or v_due.organization_id <> p_organization_id then
      raise exception 'due does not belong to this organization';
    end if;
    if v_due.status = 'VOID' then
      raise exception 'cannot allocate to a void due';
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_remaining := v_due.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'allocation of % exceeds remaining balance % for due %', v_alloc ->> 'amount', v_remaining, v_due.id;
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'allocations (%) must sum to the payment amount (%)', v_allocated_total, p_amount;
  end if;

  -- Aggregate credit lines by receivable account, in case allocated dues
  -- use different accounts, so the journal entry stays properly balanced
  -- with one line per distinct account rather than one per due.
  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19, 4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.dues d on d.id = (a ->> 'due_id')::uuid
    group by d.receivable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  insert into public.payments (
    organization_id, resort_id, member_id, unit_id, amount, method, payment_date,
    receipt_number, deposit_account_id, journal_entry_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
    v_receipt_number, p_deposit_account_id, v_entry_id, auth.uid()
  )
  returning id into v_payment_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19, 4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number));

  return v_payment_id;
end;
$$;
