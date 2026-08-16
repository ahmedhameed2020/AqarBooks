-- void_payment: reverses a POSTED payment without deleting anything.
-- Design B (approved): payment_allocations rows are stamped reversed_at/
-- reversed_by, never deleted; payments gets the matching trio plus
-- reversal_reason; dues.status is recomputed from the remaining active
-- allocations (mirrors record_payment's own PAID/PARTIALLY_PAID logic,
-- extended with OVERDUE/ISSUED since there is no independent job that
-- reclassifies a due after its only payment disappears -- verified during
-- design review, see plan). No journal_entry is touched: record_payment
-- doesn't create one today (separate, deliberately deferred gap), so
-- there is nothing to reverse in journal_entries either.
--
-- EXECUTE is left at the default (granted to PUBLIC at creation) rather
-- than explicitly restricted, matching every other financial RPC in this
-- schema (issue_dues, generate_recurring_dues, record_payment, void_due):
-- the auth.uid() IS NULL check plus the has_financial_permission call
-- below are what actually gate this, not a GRANT/REVOKE pair -- only the
-- lower-level has_financial_permission() helper itself needed that
-- treatment (see 20260812000004), because it's a helper other SECURITY
-- DEFINER functions call, not a client-facing entry point.
create or replace function public.void_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_payment record;
  v_reason text;
  v_affected_due_ids uuid[];
  v_allocation_snapshot jsonb;
  v_due_id uuid;
  v_due record;
  v_total_paid numeric(19, 4);
  v_new_status text;
  v_today date := current_date;
begin
  -- 1. Identity + input shape (permission is re-checked in step 4 once the
  -- payment's own resort_id is known, for resort-scoped roles).
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  -- 2. Organization-scoped advisory lock -- the SAME key record_payment
  -- takes, so the two RPCs serialize against each other for this
  -- organization instead of racing on the same due's computed status.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- 3. Fetch + row-lock the payment. FOR UPDATE so a second concurrent
  -- void_payment call on the same payment blocks here (not just on the
  -- advisory lock, which is organization-wide and coarser) until the
  -- first transaction commits or rolls back.
  select * into v_payment
  from public.payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  -- 4. Permission, now that the payment's real resort_id is known (never
  -- trust a client-supplied resort_id for a permission check).
  if not public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء الدفعات' using errcode = '42501';
  end if;

  -- 5. (reason already validated in step 1)

  -- 6. Status guard -- idempotent-safe: a second click gets a clear
  -- rejection, never a silent no-op or a duplicate reversal.
  if v_payment.status = 'REVERSED' then
    raise exception 'ALREADY_REVERSED: هذه الدفعة ملغاة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;
  if v_payment.status <> 'POSTED' then
    raise exception 'NOT_VOIDABLE: لا يمكن إلغاء دفعة بحالة %', v_payment.status using errcode = '22023';
  end if;

  -- 7. Snapshot the still-active allocations for this payment (due_id +
  -- amount) before anything is mutated -- feeds both the due-recompute
  -- loop below and the audit event's "what exactly was reversed" record.
  select array_agg(distinct due_id), jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount, 'allocation_id', id))
  into v_affected_due_ids, v_allocation_snapshot
  from public.payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  -- 8. Lock the affected dues in a fixed order (by id) before touching
  -- any of them, so a hypothetical future concurrent path that locks the
  -- same dues (without going through the record_payment/void_payment
  -- advisory lock) can never deadlock against this transaction.
  if v_affected_due_ids is not null then
    perform 1 from public.dues where id = any(v_affected_due_ids) order by id for update;
  end if;

  -- 9. Reverse the allocations (mark, never delete).
  update public.payment_allocations
  set reversed_at = now(), reversed_by = v_user_id
  where payment_id = p_payment_id and reversed_at is null;

  -- 10. Recompute each affected due's status from its remaining active
  -- allocations on POSTED payments only -- same rule record_payment uses
  -- to mark PAID/PARTIALLY_PAID, extended with the OVERDUE/ISSUED split
  -- per the approved design (no independent job reclassifies a due once
  -- its payment disappears).
  if v_affected_due_ids is not null then
    foreach v_due_id in array v_affected_due_ids loop
      select d.id, d.amount, d.due_date, d.status into v_due
      from public.dues d
      where d.id = v_due_id;

      if v_due.id is not null and v_due.status <> 'VOID' then
        select coalesce(sum(pa.amount) filter (where pa.reversed_at is null and p2.status = 'POSTED'), 0)
        into v_total_paid
        from public.payment_allocations pa
        join public.payments p2 on p2.id = pa.payment_id
        where pa.due_id = v_due_id;

        if v_total_paid >= v_due.amount then
          v_new_status := 'PAID';
        elsif v_total_paid > 0 then
          v_new_status := 'PARTIALLY_PAID';
        elsif v_due.due_date < v_today then
          v_new_status := 'OVERDUE';
        else
          v_new_status := 'ISSUED';
        end if;

        update public.dues set status = v_new_status where id = v_due_id;
      end if;
    end loop;
  end if;

  -- 11. Reverse the payment itself. unallocated_amount is zeroed: a
  -- reversed payment no longer represents spendable credit.
  update public.payments
  set status = 'REVERSED',
      reversed_at = now(),
      reversed_by = v_user_id,
      reversal_reason = v_reason,
      unallocated_amount = 0
  where id = p_payment_id;

  -- 12. Audit event -- includes the pre-reversal snapshot (original
  -- amount, unallocated amount, and exactly which allocations were
  -- reversed) so the hash-chained record is self-contained even if
  -- someone later reads only the audit log.
  perform public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'PAYMENT_REVERSED',
    p_entity_type := 'PAYMENT',
    p_resort_id := v_payment.resort_id,
    p_entity_id := p_payment_id,
    p_request_id := null,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'reason', v_reason,
      'original_amount', v_payment.amount,
      'previous_unallocated_amount', v_payment.unallocated_amount,
      'receipt_no', coalesce(v_payment.receipt_no, v_payment.receipt_number::text),
      'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[])),
      'reversed_allocations', coalesce(v_allocation_snapshot, '[]'::jsonb)
    )
  );

  -- 13/14. Result; commit happens implicitly when the calling transaction
  -- ends (this whole function body already runs inside one).
  return jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'affected_due_count', coalesce(array_length(v_affected_due_ids, 1), 0),
    'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[]))
  );
end;
$$;
