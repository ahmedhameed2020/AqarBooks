-- Phase 3f: the owner's statement needs HISTORY, which owner RLS hides.
--
-- payments_select_own / payment_allocations_select_own only expose POSTED receipts. A receipt that was later voided therefore
-- disappears from the owner's statement altogether, including the period BEFORE the void in which it really reduced the balance.
-- The statement must keep the receipt visible up to its reversal date and show a financial reversal movement dated at the date of
-- the ACTUAL reversal journal entry (never "today").
--
-- Two narrow readers, strictly the signed-in owner's own rows in an active organization (no staff branch, no trusted-backend
-- branch: a staff user or another organization's owner has no current_member_id() matching these rows and gets nothing).
-- They return amounts, dates and ids only: no journal entry, line, account or reason text.

CREATE OR REPLACE FUNCTION public.own_statement_receipts(p_org uuid)
 RETURNS TABLE(payment_id uuid, unit_id uuid, receipt_no text, receipt_number bigint, payment_date date, amount numeric,
               advance_amount numeric, status text, reversed_on date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.unit_id, p.receipt_no, p.receipt_number, p.payment_date, p.amount, p.advance_amount, p.status,
         CASE WHEN p.status = 'REVERSED' THEN COALESCE(
           (SELECT r.entry_date FROM public.journal_entries r WHERE r.id = p.reversal_journal_entry_id),
           (p.reversed_at AT TIME ZONE 'UTC')::date) END
  FROM public.payments p
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND p.member_id IS NOT NULL
    AND p.member_id = public.current_member_id()
    AND public.organization_is_active(p_org)
    AND p.status IN ('POSTED', 'REVERSED');
$function$;
REVOKE ALL ON FUNCTION public.own_statement_receipts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_statement_receipts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.own_credit_application_lines(p_org uuid)
 RETURNS TABLE(allocation_id uuid, payment_id uuid, due_id uuid, amount numeric, applied_on date, reversed_on date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pa.id, pa.payment_id, pa.due_id, pa.amount, pa.applied_on, pa.reversed_on
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND p.member_id IS NOT NULL
    AND p.member_id = public.current_member_id()
    AND public.organization_is_active(p_org)
    AND pa.kind = 'CREDIT_APPLICATION';
$function$;
REVOKE ALL ON FUNCTION public.own_credit_application_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_credit_application_lines(uuid) TO authenticated;
