CREATE OR REPLACE FUNCTION public.audit_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN v_changed := array_append(v_changed, 'code'); END IF;
  IF NEW.name_ar IS DISTINCT FROM OLD.name_ar THEN v_changed := array_append(v_changed, 'name_ar'); END IF;
  IF NEW.name_en IS DISTINCT FROM OLD.name_en THEN v_changed := array_append(v_changed, 'name_en'); END IF;
  IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN v_changed := array_append(v_changed, 'property_id'); END IF;
  IF NEW.wip_account_id IS DISTINCT FROM OLD.wip_account_id THEN v_changed := array_append(v_changed, 'wip_account_id'); END IF;
  IF NEW.cost_of_sales_account_id IS DISTINCT FROM OLD.cost_of_sales_account_id THEN
    v_changed := array_append(v_changed, 'cost_of_sales_account_id');
  END IF;
  IF NEW.budget_amount IS DISTINCT FROM OLD.budget_amount THEN v_changed := array_append(v_changed, 'budget_amount'); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN v_changed := array_append(v_changed, 'status'); END IF;
  IF cardinality(v_changed) > 0 THEN
    PERFORM public.append_financial_audit_event(
      NEW.organization_id, 'PROJECT_UPDATED', 'PROJECT', NULL, NEW.id, NULL, NULL, NULL,
      jsonb_build_object('project_id', NEW.id, 'changed_fields', to_jsonb(v_changed),
                         'has_postings', public.project_has_postings(OLD.id))
    );
  END IF;
  RETURN NULL;
END;
$$;
