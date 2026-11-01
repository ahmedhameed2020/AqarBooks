-- Phase 3e: a missing user identity is NOT authority.
--
-- Migrations C and D let `auth.uid() IS NULL` through in payment_receipt_entry_status and the two as-of functions, on the idea
-- that "no end user" means a trusted backend. It does not: an `authenticated` request whose token carries no subject also has no
-- uid. The exception is now an explicit server-side role:
--
--   is_trusted_backend()  =  the session role is service_role, or no role was set at all (a direct administrative connection:
--                            migrations, psql, the test harness)  — read from the `role` setting, which PostgREST sets per request
--                            (authenticated / anon / service_role) and which a SECURITY DEFINER function does not change.
--
-- `authenticated` without an identity, `anon`, and an `authenticated` owner whose portal access is suspended get nothing.
--
-- Documentation correction (the text of migration D says the as-of functions return "amounts only: no journal entry, line or
-- account"): payment_allocations_as_of returns ids and amounts only, and payment_credit_balances_as_of ALSO returns
-- advance_account_id (a bare account id; the caller still cannot read chart_of_accounts or any journal entry through it).

CREATE OR REPLACE FUNCTION public.is_trusted_backend()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin', 'service_role');
$$;
REVOKE ALL ON FUNCTION public.is_trusted_backend() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_receipt_entry_status(p_payment_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT je.status
  FROM public.payments p
  JOIN public.journal_entries je ON je.id = p.journal_entry_id
  WHERE p.id = p_payment_id
    -- same audience as the payments RLS policies; a backend caller without an end user (service role, SQL) is trusted
    AND (public.is_trusted_backend()
         OR public.has_permission(auth.uid(), p.organization_id, 'finance.payments.read')
         OR p.member_id = public.current_member_id());
$function$;

CREATE OR REPLACE FUNCTION public.payment_allocations_as_of(p_org uuid, p_as_of date)
 RETURNS TABLE(allocation_id uuid, payment_id uuid, due_id uuid, amount numeric, applied_on date, kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pa.id, pa.payment_id, pa.due_id, pa.amount, pa.applied_on, pa.kind
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND (public.is_trusted_backend()
         OR public.has_permission(auth.uid(), p_org, 'finance.payments.read')
         OR (p.member_id = public.current_member_id() AND public.organization_is_active(p_org)))
    AND p.payment_date <= p_as_of
    AND pa.applied_on <= p_as_of
    AND (pa.reversed_on IS NULL OR pa.reversed_on > p_as_of);
$function$;

CREATE OR REPLACE FUNCTION public.payment_credit_balances_as_of(p_org uuid, p_as_of date)
 RETURNS TABLE(payment_id uuid, member_id uuid, unit_id uuid, advance_account_id uuid, advance_amount numeric, remaining_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.member_id, p.unit_id, p.advance_account_id, p.advance_amount,
         p.advance_amount - COALESCE((SELECT sum(pa.amount) FROM public.payment_allocations pa
                                      WHERE pa.payment_id = p.id AND pa.kind = 'CREDIT_APPLICATION'
                                        AND pa.applied_on <= p_as_of AND (pa.reversed_on IS NULL OR pa.reversed_on > p_as_of)), 0)
  FROM public.payments p
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND (public.is_trusted_backend()
         OR public.has_permission(auth.uid(), p_org, 'finance.payments.read')
         OR (p.member_id = public.current_member_id() AND public.organization_is_active(p_org)))
    AND p.advance_amount > 0
    AND p.payment_date <= p_as_of
    AND NOT (p.status = 'REVERSED' AND COALESCE(
          (SELECT r.entry_date FROM public.journal_entries r WHERE r.id = p.reversal_journal_entry_id),
          (p.reversed_at AT TIME ZONE 'UTC')::date) <= p_as_of);
$function$;
