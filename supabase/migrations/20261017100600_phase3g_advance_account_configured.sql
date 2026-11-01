-- Phase 3g: tell the receipts screen WHETHER an advance account is approved, without exposing the setting itself.
--
-- organization_finance_settings is readable only with finance.accounts.manage (policy organization_finance_settings_manage). A cashier
-- (receivables.payments.create) who opens the receipts page therefore read "no setting" and the screen reported "advance account not
-- configured" and blocked an advance that the database would have accepted. Widening the table policy would expose every other
-- setting (clearing and commission accounts, ...), so this returns ONE boolean and nothing else, to people who can already record or
-- read receipts of the organization.

CREATE OR REPLACE FUNCTION public.customer_advance_account_configured(p_organization_id uuid, p_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT s.customer_advance_account_id IS NOT NULL
    FROM public.organization_finance_settings s
    WHERE s.organization_id = p_organization_id AND s.property_id = p_property_id
      AND public.organization_is_active(p_organization_id)
      AND public.has_any_permission(p_organization_id, ARRAY['receivables.payments.create', 'finance.payments.read', 'finance.accounts.manage'])
  ), false);
$function$;
REVOKE ALL ON FUNCTION public.customer_advance_account_configured(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_advance_account_configured(uuid, uuid) TO authenticated;
