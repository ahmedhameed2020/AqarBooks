-- Phase 5, Task 4 fix (code review "Important" finding): reject a checkout
-- request when any requested due already has a non-expired PENDING
-- allocation in ANOTHER transaction -- closes a double-booking gap where
-- two concurrent/double-clicked checkout attempts (or two co-owners of the
-- same unit racing each other) could both create separate PENDING
-- transactions allocating the same due. Not a financial-correctness bug
-- (record_online_payment's FOR UPDATE lock + balance re-check already makes
-- the loser fail safely with DUE_ALREADY_SETTLED at settlement time), but a
-- production-readiness gap: it silently creates a duplicate live provider
-- checkout session and confusing UX.
--
-- RLS-visibility check (verified live against ataslxkcflxuilpgyepm, NOT
-- assumed): online_payment_transactions_select_own and
-- online_payment_transaction_allocations_select_own (20260815000002) are
-- both scoped to `member_id = current_member_id()`. A plain SELECT inside
-- create_online_payment_checkout_transaction (SECURITY INVOKER) can only
-- ever see the CALLING member's own PENDING transactions -- confirmed by a
-- live probe: member A creates a PENDING transaction+allocation against a
-- due on a unit co-owned by member B; impersonating member B and running
-- the exact join this check needs returned 0 rows, even though the
-- conflicting row exists. A same-member double-click would still be caught
-- by an INVOKER-scoped check (it's their own row), but a co-owner race
-- would NOT be -- silently defeating this fix's purpose for the
-- joint-obligation case dues_select_own already treats as shared visibility.
--
-- Fix: a narrow SECURITY DEFINER helper, same pattern as
-- current_member_id()/has_permission() elsewhere in this project. Returns
-- ONLY a boolean (no transaction/allocation data), so it carries no
-- broader data-exposure risk -- the calling member is entitled to know
-- "does a conflict exist" regardless of whose transaction caused it, since
-- it directly blocks their own checkout attempt.
create or replace function public.due_ids_have_pending_online_checkout(p_due_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.online_payment_transaction_allocations opta
    join public.online_payment_transactions opt on opt.id = opta.transaction_id
    where opta.due_id = any(p_due_ids)
      and opt.status = 'PENDING'
      and opt.expires_at > now()
  );
$$;

revoke execute on function public.due_ids_have_pending_online_checkout(uuid[]) from public, anon;
grant execute on function public.due_ids_have_pending_online_checkout(uuid[]) to authenticated;

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

  -- Double-booking guard (Task 4 fix) -- placed AFTER the ownership/status/
  -- cross-resort loop so a due that's VOID/PAID/not-owned still surfaces
  -- its own specific error first, but BEFORE the insert below.
  if public.due_ids_have_pending_online_checkout(p_due_ids) then
    raise exception 'DUE_HAS_PENDING_CHECKOUT: يوجد بالفعل عملية دفع معلّقة لأحد الاستحقاقات المختارة، يرجى الانتظار أو إعادة المحاولة لاحقًا' using errcode = '22023';
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

-- No REVOKE/GRANT changes needed on create_online_payment_checkout_transaction
-- itself -- unchanged from 20260816000001 (SECURITY INVOKER, PUBLIC-callable
-- by default, no explicit revoke). Only the new helper above gets its own
-- explicit authenticated-only grant.

notify pgrst, 'reload schema';
