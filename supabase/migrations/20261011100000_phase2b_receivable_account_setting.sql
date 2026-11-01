-- Phase 2b: an explicit, validated receivable account for issuing dues.
--
-- Before: the dues dialog preselected the first ASSET account by code (1110 Cash), the server action fell back
-- to the due type's REVENUE account and then to any asset account, and issue_dues accepted any account id
-- without checking organization, category or state. There was no organization setting for "the receivables
-- account".
-- Now: organization_finance_settings carries receivable_account_id (per property, like its siblings),
-- validated by a trigger; issue_dues refuses a missing / foreign / non-asset / group / inactive account.

ALTER TABLE public.organization_finance_settings
  ADD COLUMN IF NOT EXISTS receivable_account_id uuid REFERENCES public.chart_of_accounts(id);

CREATE OR REPLACE FUNCTION public.validate_receivable_account_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.receivable_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = NEW.receivable_account_id
      AND a.organization_id = NEW.organization_id
      AND a.category = 'ASSET'
      AND NOT a.is_group
      AND a.is_active
  ) THEN
    RAISE EXCEPTION 'RECEIVABLE_ACCOUNT_INVALID: حساب الذمم المدينة يجب أن يكون حساب أصول فرعيًا نشطًا في هذه المؤسسة' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_receivable_account_setting() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_receivable_account_setting ON public.organization_finance_settings;
CREATE TRIGGER trg_validate_receivable_account_setting
  BEFORE INSERT OR UPDATE ON public.organization_finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_receivable_account_setting();

CREATE OR REPLACE FUNCTION public.issue_dues(p_organization_id uuid, p_resort_id uuid, p_unit_ids uuid[], p_due_type_id uuid, p_receivable_account_id uuid, p_amount numeric, p_amount_by_unit_type jsonb DEFAULT NULL::jsonb, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT (CURRENT_DATE + '15 days'::interval), p_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_unit_id uuid;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issued_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_skipped_unit_ids uuid[] := ARRAY[]::uuid[];
  v_action text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.dues.issue', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' USING ERRCODE = '42501';
  END IF;

  -- The receivable side must be an active, postable ASSET account of THIS organization. Nothing is guessed:
  -- a missing or foreign account is refused (it used to be accepted as-is).
  IF p_receivable_account_id IS NULL THEN
    RAISE EXCEPTION 'RECEIVABLE_ACCOUNT_REQUIRED: حدِّد حساب الذمم المدينة' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = p_receivable_account_id
      AND a.organization_id = p_organization_id
      AND a.category = 'ASSET'
      AND NOT a.is_group
      AND a.is_active
  ) THEN
    RAISE EXCEPTION 'RECEIVABLE_ACCOUNT_INVALID: حساب الذمم المدينة يجب أن يكون حساب أصول فرعيًا نشطًا في هذه المؤسسة' USING ERRCODE = '22023';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND property_id = p_resort_id;

    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dues
      WHERE unit_id = v_unit_id
        AND due_type_id = p_due_type_id
        AND issue_date = p_issue_date
        AND COALESCE(description, '') = COALESCE(p_description, '')
        AND status <> 'VOID'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_skipped_unit_ids := array_append(v_skipped_unit_ids, v_unit_id);
    ELSE
      INSERT INTO public.dues (
        organization_id,
        property_id,
        unit_id,
        due_type_id,
        receivable_account_id,
        amount,
        issue_date,
        due_date,
        description,
        status,
        created_by
      ) VALUES (
        p_organization_id,
        p_resort_id,
        v_unit_id,
        p_due_type_id,
        p_receivable_account_id,
        v_unit_amount,
        p_issue_date,
        p_due_date,
        p_description,
        'ISSUED',
        v_user_id
      );

      v_issued_count := v_issued_count + 1;
      v_total_amount := v_total_amount + v_unit_amount;
    END IF;
  END LOOP;

  v_action := CASE WHEN array_length(p_unit_ids, 1) = 1 THEN 'DUE_ISSUED' ELSE 'DUE_BATCH_ISSUED' END;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := v_action,
    p_entity_type := 'DUE',
    p_resort_id := p_resort_id,
    p_entity_id := NULL,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'target_units_count', array_length(p_unit_ids, 1),
      'issued_count', v_issued_count,
      'skipped_count', v_skipped_count,
      'total_amount', v_total_amount,
      'due_type_id', p_due_type_id,
      'issue_date', p_issue_date,
      'due_date', p_due_date
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$function$;

ALTER FUNCTION public.issue_dues(uuid, uuid, uuid[], uuid, uuid, numeric, jsonb, date, date, text, inet, text) OWNER TO postgres;
