-- Phase 3h: the owner's statement needs the REAL remaining of each due, whoever paid it, and the dues of a member who no longer owns the unit.
--
-- Two gaps, both caused by owner RLS being keyed to who the caller is TODAY:
--   1. A new owner N sees the unit's dues (dues_select_own) but not the receipts of the previous owner M (payments_select_own is
--      per member). A due that M's receipt settled in full therefore looked "unpaid" to N and was counted as a new debt.
--   2. When ownership ends, M loses sight of the dues M was charged (dues_select_own is by CURRENT ownership) while still seeing their
--      own receipts: M's ledger kept the receipts without the charges they settled, so ledger and net diverged.
--
-- own_statement_dues(p_org, p_as_of): the dues the caller's statement covers, each with the amount settled as of the date by ANY
-- receipt in force (an amount only: no receipt, payer or credit information). The set is the union of
--   (a) every route owner RLS already grants (current ownership, lease tenant, installment buyer, maintenance cost requester), so no due
--       that is visible today disappears;
--   (b) dues issued while the caller owned the unit (the history that ownership RLS drops);
--   (c) dues that one of the caller's own receipts allocated to.
-- own_due_settlement_lines(p_org): for those dues, the settlements made by receipts of OTHER payers, as dated amounts (and their
-- reversal dates), so the ledger can show "settled by a previous owner / another payer" without saying whose receipt it was.
--
-- Both: signed-in member only (current_member_id()), active organization, no staff branch, no trusted-backend branch, authenticated only.
-- The helper payment_receipt_entry_status() is NOT used here: it answers only for the caller's own receipts, which is the very limit
-- these functions exist to go beyond for the settled AMOUNT.

CREATE OR REPLACE FUNCTION public.own_statement_dues(p_org uuid, p_as_of date)
 RETURNS TABLE(due_id uuid, unit_id uuid, unit_code text, amount numeric, issue_date date, due_date date, description text,
               status text, settled_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT public.current_member_id() AS id)
  SELECT d.id, d.unit_id, u.code, d.amount, d.issue_date, d.due_date, d.description, d.status,
         COALESCE((SELECT sum(pa.amount)
                   FROM public.payment_allocations pa
                   JOIN public.payments p ON p.id = pa.payment_id
                   JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
                   WHERE pa.due_id = d.id
                     AND p.payment_date <= p_as_of
                     AND pa.applied_on <= p_as_of
                     AND (pa.reversed_on IS NULL OR pa.reversed_on > p_as_of)), 0)::numeric(19,4)
  FROM public.dues d
  JOIN public.units u ON u.id = d.unit_id
  CROSS JOIN me
  WHERE d.organization_id = p_org
    AND me.id IS NOT NULL
    AND public.organization_is_active(p_org)
    AND d.status <> 'VOID'
    AND d.issue_date <= p_as_of
    AND (
      -- (a) what owner RLS shows today
      d.unit_id IN (SELECT uo.unit_id FROM public.unit_ownerships uo
                    WHERE uo.member_id = me.id AND (uo.end_date IS NULL OR uo.end_date >= CURRENT_DATE))
      OR (d.source_type = 'LEASE_RENT' AND d.source_id IN (SELECT l.id FROM public.unit_leases l WHERE l.tenant_member_id = me.id))
      OR (d.source_type = 'INSTALLMENT_PLAN' AND d.source_id IN (
            SELECT pi.id FROM public.plan_installments pi JOIN public.installment_plans ip ON ip.id = pi.plan_id WHERE ip.buyer_member_id = me.id))
      OR public.work_order_cost_member_can_read_due(d)
      -- (b) charged while the caller owned the unit
      OR EXISTS (SELECT 1 FROM public.unit_ownerships uo
                 WHERE uo.member_id = me.id AND uo.unit_id = d.unit_id
                   AND (uo.start_date IS NULL OR uo.start_date <= d.issue_date)
                   AND (uo.end_date IS NULL OR uo.end_date >= d.issue_date))
      -- (c) settled, wholly or partly, by one of the caller's own receipts
      OR EXISTS (SELECT 1 FROM public.payment_allocations pa JOIN public.payments p ON p.id = pa.payment_id
                 WHERE pa.due_id = d.id AND p.member_id = me.id)
    );
$function$;
REVOKE ALL ON FUNCTION public.own_statement_dues(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_statement_dues(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.own_due_settlement_lines(p_org uuid)
 RETURNS TABLE(allocation_id uuid, due_id uuid, amount numeric, applied_on date, reversed_on date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pa.id, pa.due_id, pa.amount, pa.applied_on, pa.reversed_on
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  JOIN public.journal_entries je ON je.id = p.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
  WHERE p.organization_id = p_org
    AND public.current_member_id() IS NOT NULL
    AND public.organization_is_active(p_org)
    -- another payer (or an unnamed cash customer): the caller's own receipts are already on the statement as receipts
    AND p.member_id IS DISTINCT FROM public.current_member_id()
    AND pa.due_id IN (SELECT s.due_id FROM public.own_statement_dues(p_org, DATE '9999-12-31') s);
$function$;
REVOKE ALL ON FUNCTION public.own_due_settlement_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_due_settlement_lines(uuid) TO authenticated;
