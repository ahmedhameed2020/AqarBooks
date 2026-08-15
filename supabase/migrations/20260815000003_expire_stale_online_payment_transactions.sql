-- Lazy sweep, same rationale as expire_stale_member_invitations
-- (20260814000004): this project has no pg_cron extension enabled, so
-- expiry is checked lazily rather than on a schedule. UNLIKE that
-- function's original version, this one is restricted to service_role from
-- the start -- a Checkpoint 2 security review found expire_stale_member_
-- invitations() had shipped with no authorization check at all, callable
-- by any signed-in user to trigger a global, cross-tenant write, and had to
-- be hardened after the fact (20260814000006). This function starts
-- hardened instead of repeating that mistake: it is not callable by
-- `authenticated` at all. Phase 4's checkout flow (or a future scheduled
-- job) will call it via the admin/service-role client, matching how
-- lib/actions/member-portal.ts already calls expire_stale_member_
-- invitations() via createAdminClient() rather than the per-request client.
create or replace function public.expire_stale_online_payment_transactions()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    -- failed_at doubles as "left PENDING for a non-PAID terminal state"
    -- rather than adding a third timestamp column -- failure_code/
    -- failure_message stay null here since a plain timeout has no provider
    -- failure code to record, distinguishing it from a provider-reported
    -- failure (which would set failure_code/failure_message alongside
    -- failed_at via the future webhook path, not this sweep).
    update public.online_payment_transactions
    set status = 'EXPIRED', failed_at = now()
    where status = 'PENDING' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.expire_stale_online_payment_transactions() from public, anon, authenticated;
grant execute on function public.expire_stale_online_payment_transactions() to service_role;

notify pgrst, 'reload schema';
