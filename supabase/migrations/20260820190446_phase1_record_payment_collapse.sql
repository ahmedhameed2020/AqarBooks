-- Phase 1 security remediation — migration 3 of 4
--
-- Collapses record_payment to a single, properly guarded overload.
--
-- BEFORE: three overloads coexisted with three different authorization rules:
--   9-arg  -> organization membership only, with an in-code "TODO: RBAC later"
--   11-arg -> has_financial_permission('finance.payments.create')
--   12-arg -> has_permission('receivables.payments.create')   [the one in use]
--
-- ORDER IS LOAD-BEARING. Pre-flight probing showed the 9-arg overload is not
-- currently reachable through PostgREST: its parameter set is a strict subset
-- of the 11-arg's, so a 9-parameter call is ambiguous and PostgREST refuses it
-- with PGRST203. The unguarded function is therefore MASKED BY the 11-arg
-- overload. Dropping the 11-arg first would make the unguarded 9-arg uniquely
-- resolvable and turn a latent defect into a live one.
--
-- Dropping the 9-arg FIRST is safe under any execution model: after that drop
-- a 9-parameter call resolves to the 11-arg, which is permission-guarded.
-- Do not reorder these two statements, and never split them across migrations.

DROP FUNCTION public.record_payment(uuid,uuid,numeric,date,text,uuid,text,jsonb,text);
DROP FUNCTION public.record_payment(uuid,uuid,numeric,date,text,uuid,text,jsonb,text,inet,text);

-- Harden the surviving 12-arg overload.
--
-- Signature is UNCHANGED so existing callers (lib/actions/receivables.ts,
-- lib/actions/treasury.ts) need no edit. The permission key is retained as
-- 'receivables.payments.create' so no role or grant changes are required.
--
-- The ONLY change is the guard: has_permission -> has_financial_permission.
-- That adds three checks the previous guard lacked:
--   * the organization must not be SUSPENDED or ARCHIVED
--   * the caller must hold an ACTIVE organization_memberships row
--   * p_resort_id, when supplied, must belong to the organization
-- and removes one the previous guard had:
--   * the is_platform_admin() bypass
--
-- Removing the platform-admin bypass is deliberate and owner-approved:
-- platform administration is not tenant financial authority. A platform super
-- admin may administer tenants, subscriptions and configuration, but must not
-- create financial transactions inside a customer's ledger without holding
-- tenant membership and the financial permission.
--
-- post_payment_internal is NOT modified by this migration. No posting,
-- allocation, numbering or journal logic is touched.

CREATE OR REPLACE FUNCTION public.record_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_member_id uuid,
  p_unit_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_cashier_session_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_result record;
begin
  if not public.has_financial_permission(
       p_organization_id, 'receivables.payments.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات'
      using errcode = '42501';
  end if;

  select * into v_result from public.post_payment_internal(
    p_organization_id => p_organization_id,
    p_resort_id => p_resort_id,
    p_member_id => p_member_id,
    p_unit_id => p_unit_id,
    p_amount => p_amount,
    p_method => p_method,
    p_payment_date => p_payment_date,
    p_deposit_account_id => p_deposit_account_id,
    p_fiscal_period_id => p_fiscal_period_id,
    p_allocations => p_allocations,
    p_idempotency_key => p_idempotency_key,
    p_cashier_session_id => p_cashier_session_id,
    p_actor_id => auth.uid()
  );

  return v_result.payment_id;
end;
$function$;
