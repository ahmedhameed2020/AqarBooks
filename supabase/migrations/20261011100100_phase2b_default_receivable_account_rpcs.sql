-- Phase 2b: reading and setting the organization's approved receivable account.
--
-- organization_finance_settings is readable/writable only through finance.accounts.manage (owner, finance
-- manager). The people who ISSUE dues (finance.dues.issue, e.g. the accountant) must still be able to learn which
-- account the organization approved, so reading goes through a narrow SECURITY DEFINER function; setting it
-- needs finance.accounts.manage and is audited.

CREATE OR REPLACE FUNCTION public.get_default_receivable_account(p_organization_id uuid, p_property_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_organization_id IS NULL
     OR NOT public.has_any_permission(p_organization_id, ARRAY['finance.dues.issue', 'finance.accounts.manage']) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  -- only an account that is still valid is returned; a stale setting reads as "not configured"
  SELECT s.receivable_account_id INTO v_id
  FROM public.organization_finance_settings s
  JOIN public.chart_of_accounts a ON a.id = s.receivable_account_id
  WHERE s.organization_id = p_organization_id
    AND s.property_id = p_property_id
    AND a.organization_id = p_organization_id
    AND a.category = 'ASSET' AND NOT a.is_group AND a.is_active;
  RETURN v_id;
END;
$$;
ALTER FUNCTION public.get_default_receivable_account(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_default_receivable_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_default_receivable_account(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_default_receivable_account(p_organization_id uuid, p_property_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_organization_id IS NULL
     OR NOT public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = p_property_id AND p.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND' USING errcode = '22023';
  END IF;
  SELECT receivable_account_id INTO v_old FROM public.organization_finance_settings
  WHERE organization_id = p_organization_id AND property_id = p_property_id;

  -- the validation trigger refuses a foreign / non-asset / group / inactive account
  INSERT INTO public.organization_finance_settings (organization_id, property_id, receivable_account_id)
  VALUES (p_organization_id, p_property_id, p_account_id)
  ON CONFLICT (organization_id, property_id) DO UPDATE SET receivable_account_id = EXCLUDED.receivable_account_id;

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (auth.uid(), p_organization_id, p_property_id, 'finance.default_receivable_account.set', 'organization_finance_settings', p_property_id,
          jsonb_build_object('old', v_old, 'new', p_account_id));
END;
$$;
ALTER FUNCTION public.set_default_receivable_account(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_default_receivable_account(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_receivable_account(uuid, uuid, uuid) TO authenticated, service_role;
