-- Phase 5, Task 4: atomic checkout-transaction creation for the owner
-- portal. SECURITY INVOKER (not DEFINER) -- runs as the member's own
-- authenticated session, so current_member_id()/RLS already do the
-- ownership work; this function's only job is atomicity + the
-- sum-of-allocations invariant Phase 3 flagged as needing enforcement here.
create or replace function public.create_online_payment_checkout_transaction(
  p_due_ids uuid[],
  p_provider text
)
returns table (transaction_id uuid, amount numeric(19,4))
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_due record;
  v_organization_id uuid;
  v_resort_id uuid;
  v_total numeric(19,4) := 0;
  v_matched_count integer := 0;
  v_transaction_id uuid;
begin
  if v_member_id is null then
    raise exception 'NOT_A_PORTAL_MEMBER: لست مسجّلاً كمالك في هذا النظام' using errcode = '42501';
  end if;
  -- PAYMOB intentionally excluded here, not just at the app layer -- Task 3
  -- ships Paymob's adapter as contract-tests-only (no vendor-verified HMAC
  -- known-answer test exists yet), so this RPC must not let a checkout
  -- transaction be created for a provider whose signature verification is
  -- unproven. Add 'PAYMOB' back to this list only as part of the explicit
  -- follow-up task that re-enables it for production (see Task 3's status
  -- note in the plan).
  if p_provider not in ('FAWRY') then
    raise exception 'INVALID_PROVIDER: مزود الدفع غير معروف أو غير مُفعّل حاليًا' using errcode = '22023';
  end if;
  if p_due_ids is null or array_length(p_due_ids, 1) is null then
    raise exception 'NO_DUES_SELECTED: يرجى اختيار استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  for v_due in
    select d.* from public.dues d
    where d.id = any(p_due_ids)
      and exists (
        select 1 from public.unit_ownerships uo
        where uo.unit_id = d.unit_id and uo.member_id = v_member_id
          and (uo.end_date is null or uo.end_date >= current_date)
      )
  loop
    if v_due.status in ('VOID', 'PAID') then
      raise exception 'DUE_NOT_PAYABLE: الاستحقاق % لم يعد قابلاً للسداد', v_due.id using errcode = '22023';
    end if;
    if v_organization_id is null then
      v_organization_id := v_due.organization_id;
      v_resort_id := v_due.resort_id;
    elsif v_due.resort_id <> v_resort_id then
      -- Design doc Decision 4: single-resort only in V1, even though
      -- multi-unit is allowed within one resort.
      raise exception 'CROSS_RESORT_NOT_ALLOWED: لا يمكن دمج استحقاقات من مواقع مختلفة في عملية دفع واحدة' using errcode = '22023';
    end if;
    v_total := v_total + v_due.amount;
    v_matched_count := v_matched_count + 1;
  end loop;

  if v_matched_count <> array_length(p_due_ids, 1) then
    -- Some requested due_ids either don't exist, aren't owned by this
    -- member, or weren't caught by the loop's own status check --
    -- reject the whole request rather than silently proceeding with a
    -- subset the member didn't actually ask to pay.
    raise exception 'SOME_DUES_NOT_FOUND_OR_NOT_OWNED: بعض الاستحقاقات غير موجودة أو غير مملوكة لك' using errcode = '22023';
  end if;

  insert into public.online_payment_transactions (
    organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at
  ) values (
    v_organization_id, v_resort_id, v_member_id, gen_random_uuid()::text, p_provider, v_total, now() + interval '20 minutes'
  )
  returning id into v_transaction_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  select v_transaction_id, d.id, d.amount from public.dues d where d.id = any(p_due_ids);

  return query select v_transaction_id, v_total;
end;
$$;

-- No REVOKE/GRANT changes needed -- SECURITY INVOKER means this function
-- carries no more privilege than the calling authenticated member already
-- has via RLS. Callable by authenticated (the default for a new function
-- with no explicit revoke), which is correct here since the function's own
-- body re-derives everything from current_member_id() and never trusts a
-- caller-supplied identity.

notify pgrst, 'reload schema';
