-- Final Hardening Sprint: financial correctness, reversal integrity, authorization,
-- atomic role updates, and ownership invariants.

-- Trial balance must include only POSTED journal entries in the requested period.
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  account_id uuid,
  code text,
  name_ar text,
  name_en text,
  category text,
  normal_balance text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    COALESCE(SUM(l.debit), 0) AS total_debit,
    COALESCE(SUM(l.credit), 0) AS total_credit,
    CASE WHEN a.normal_balance = 'DEBIT'
      THEN COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)
      ELSE COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0)
    END AS balance
  FROM public.chart_of_accounts a
  LEFT JOIN public.journal_entry_lines l
    ON l.account_id = a.id
   AND EXISTS (
     SELECT 1
     FROM public.journal_entries je
     WHERE je.id = l.journal_entry_id
       AND je.organization_id = p_organization_id
       AND je.status = 'POSTED'
       AND je.entry_date BETWEEN p_start_date AND p_end_date
   )
  WHERE a.organization_id = p_organization_id
    AND NOT a.is_group
  GROUP BY a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  ORDER BY a.code;
$$;
ALTER FUNCTION public.get_trial_balance(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trial_balance(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(uuid, date, date) TO authenticated, service_role;

-- The reversal action is emitted by void_payment and must be a valid audit event.
ALTER TABLE public.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;
ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT check_audit_action CHECK (action = ANY (ARRAY[
    'PAYMENT_CREATED', 'PAYMENT_IDEMPOTENT_REPLAY', 'PAYMENT_ALLOCATION_CREATED',
    'PAYMENT_REVERSED', 'DUE_ISSUED', 'DUE_BATCH_ISSUED',
    'RECURRING_DUES_GENERATED', 'RECURRING_DUES_SKIPPED', 'OPERATION_REJECTED',
    'LEASE_RENT_DUE_GENERATED', 'LEASE_RENT_DUE_SKIPPED'
  ]));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid
    REFERENCES public.journal_entries(id);

-- Audit-chain verification is tenant-bound and permission-bound even though it
-- runs as the function owner. service_role remains available for controlled
-- server-side verification, while anonymous and unrelated tenants are denied.
CREATE OR REPLACE FUNCTION public.verify_financial_audit_chain(p_organization_id uuid)
RETURNS TABLE(
  log_id uuid,
  action text,
  occurred_at timestamptz,
  stored_hash text,
  calculated_hash text,
  is_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rec record;
  v_prev_hash text := NULL;
  v_calc_hash text;
  v_payload text;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
  END IF;
  IF auth.role() <> 'service_role'
     AND NOT public.has_permission(auth.uid(), p_organization_id, 'finance.audit.read')
     AND NOT public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;

  FOR v_rec IN
    SELECT * FROM public.financial_audit_logs
    WHERE organization_id = p_organization_id
    ORDER BY occurred_at ASC, id ASC
  LOOP
    v_payload := concat_ws('|', v_rec.organization_id::text,
      COALESCE(v_rec.property_id::text, ''), COALESCE(v_rec.actor_user_id::text, 'SYSTEM'),
      v_rec.action, v_rec.entity_type, COALESCE(v_rec.entity_id::text, ''),
      COALESCE(v_rec.request_id, ''), COALESCE(v_rec.ip_address::text, ''),
      COALESCE(v_rec.user_agent, ''), to_char(v_rec.occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      v_rec.metadata::text, COALESCE(v_prev_hash, 'GENESIS_BLOCK'));
    v_calc_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    log_id := v_rec.id;
    action := v_rec.action;
    occurred_at := v_rec.occurred_at;
    stored_hash := v_rec.event_hash;
    calculated_hash := v_calc_hash;
    is_valid := v_rec.event_hash = v_calc_hash
      AND COALESCE(v_rec.previous_hash, 'GENESIS_BLOCK') = COALESCE(v_prev_hash, 'GENESIS_BLOCK');
    RETURN NEXT;
    v_prev_hash := v_rec.event_hash;
  END LOOP;
END;
$$;
ALTER FUNCTION public.verify_financial_audit_chain(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_financial_audit_chain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_financial_audit_chain(uuid) TO authenticated, service_role;

-- Atomic replacement of role grants. Any validation or insert failure rolls
-- back the delete because the entire function executes as one transaction.
CREATE OR REPLACE FUNCTION public.replace_role_permissions_atomic(
  p_organization_id uuid,
  p_role_id uuid,
  p_permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.roles;
  v_invalid_count integer;
BEGIN
  SELECT * INTO v_role
  FROM public.roles
  WHERE id = p_role_id
    AND organization_id = p_organization_id
  FOR UPDATE;
  IF v_role.id IS NULL OR v_role.is_system THEN
    RAISE EXCEPTION 'CANNOT_MODIFY_SYSTEM_ROLE' USING errcode = '42501';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_permission_ids, ARRAY[]::uuid[])) AS id
  ) requested
  LEFT JOIN public.permissions p ON p.id = requested.id
  LEFT JOIN public.role_template_permissions rtp ON rtp.permission_key = p.key
  WHERE p.id IS NULL OR p.key LIKE 'platform.%' OR rtp.permission_key IS NULL;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'INVALID_PERMISSION_SCOPE' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('replace_role_permissions_' || p_role_id::text));
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT p_role_id, permission_id
  FROM unnest(COALESCE(p_permission_ids, ARRAY[]::uuid[])) AS requested(permission_id);
END;
$$;
ALTER FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) TO service_role;

-- Enforce the aggregate ownership invariant for every direct INSERT/UPDATE,
-- including writes that bypass the application action. The advisory lock makes
-- concurrent writers to the same unit serialize before the aggregate check.
CREATE OR REPLACE FUNCTION public.enforce_unit_ownership_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('unit_ownership_total_' || NEW.organization_id::text || ':' || NEW.unit_id::text));
  SELECT COALESCE(SUM(share_percentage), 0) INTO v_total
  FROM public.unit_ownerships uo
  WHERE uo.organization_id = NEW.organization_id
    AND uo.unit_id = NEW.unit_id
    AND (TG_OP = 'INSERT' OR uo.id <> NEW.id)
    AND uo.start_date <= COALESCE(NEW.end_date, 'infinity'::date)
    AND COALESCE(uo.end_date, 'infinity'::date) >= NEW.start_date;
  IF v_total + NEW.share_percentage > 100 THEN
    RAISE EXCEPTION 'UNIT_OWNERSHIP_TOTAL_EXCEEDED: active ownership cannot exceed 100%% (requested total: %)',
      v_total + NEW.share_percentage USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_unit_ownership_total ON public.unit_ownerships;
CREATE TRIGGER trg_unit_ownership_total
BEFORE INSERT OR UPDATE OF organization_id, unit_id, share_percentage, start_date, end_date
ON public.unit_ownerships
FOR EACH ROW EXECUTE FUNCTION public.enforce_unit_ownership_total();

-- Functional atomic reversal: reverse allocations, create and post a balanced
-- opposite journal entry linked to the original, then mark the source entry and
-- payment reversed and append the immutable audit event.
CREATE OR REPLACE FUNCTION public.void_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_payment public.payments;
  v_original public.journal_entries;
  v_reversal_entry_id uuid;
  v_period_id uuid;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_affected_due_ids uuid[];
  v_allocation_snapshot jsonb;
  v_due_id uuid;
  v_due public.dues;
  v_total_paid numeric(19,4);
  v_new_status text;
  v_reversal_lines jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501'; END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023'; END IF;
  IF char_length(v_reason) > 1000 THEN RAISE EXCEPTION 'REASON_TOO_LONG' USING errcode = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  SELECT * INTO v_payment FROM public.payments
  WHERE id = p_payment_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING errcode = '22023'; END IF;
  IF NOT public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.property_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  IF v_payment.status = 'REVERSED' THEN RAISE EXCEPTION 'ALREADY_REVERSED' USING errcode = '22023'; END IF;
  IF v_payment.status <> 'POSTED' THEN RAISE EXCEPTION 'NOT_VOIDABLE' USING errcode = '22023'; END IF;

  SELECT * INTO v_original FROM public.journal_entries
  WHERE id = v_payment.journal_entry_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_original.id IS NULL OR v_original.status <> 'POSTED' THEN
    RAISE EXCEPTION 'PAYMENT_JOURNAL_ENTRY_MISSING' USING errcode = '22023';
  END IF;
  SELECT id INTO v_period_id FROM public.fiscal_periods
  WHERE organization_id = p_organization_id AND status = 'OPEN'
    AND current_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC LIMIT 1;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'NO_OPEN_REVERSAL_PERIOD' USING errcode = '22023'; END IF;

  SELECT array_agg(DISTINCT due_id), jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount, 'allocation_id', id))
    INTO v_affected_due_ids, v_allocation_snapshot
  FROM public.payment_allocations WHERE payment_id = p_payment_id AND reversed_at IS NULL;
  IF v_affected_due_ids IS NOT NULL THEN
    PERFORM 1 FROM public.dues WHERE id = ANY(v_affected_due_ids) ORDER BY id FOR UPDATE;
  END IF;
  UPDATE public.payment_allocations SET reversed_at = now(), reversed_by = v_user_id
  WHERE payment_id = p_payment_id AND reversed_at IS NULL;

  IF v_affected_due_ids IS NOT NULL THEN
    FOREACH v_due_id IN ARRAY v_affected_due_ids LOOP
      SELECT * INTO v_due FROM public.dues WHERE id = v_due_id;
      IF v_due.id IS NOT NULL AND v_due.status <> 'VOID' THEN
        SELECT COALESCE(SUM(pa.amount) FILTER (WHERE pa.reversed_at IS NULL AND p2.status = 'POSTED'), 0)
          INTO v_total_paid FROM public.payment_allocations pa JOIN public.payments p2 ON p2.id = pa.payment_id
          WHERE pa.due_id = v_due_id;
        v_new_status := CASE WHEN v_total_paid >= v_due.amount THEN 'PAID'
          WHEN v_total_paid > 0 THEN 'PARTIALLY_PAID'
          WHEN v_due.due_date < current_date THEN 'OVERDUE' ELSE 'ISSUED' END;
        UPDATE public.dues SET status = v_new_status WHERE id = v_due_id;
      END IF;
    END LOOP;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit, 'credit', debit,
    'description', COALESCE(description, 'Payment reversal')) ORDER BY line_number)
    INTO v_reversal_lines FROM public.journal_entry_lines WHERE journal_entry_id = v_original.id;
  v_reversal_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_original.property_id, v_period_id, current_date,
    'Payment reversal: ' || COALESCE(v_payment.receipt_no, v_payment.receipt_number::text, p_payment_id::text),
    'PAYMENT_VOUCHER', v_reversal_lines, 'payment-reversal:' || p_payment_id::text);
  PERFORM public.post_journal_entry_internal(v_reversal_entry_id);
  UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = v_original.id;
  UPDATE public.journal_entries SET reversed_entry_id = v_original.id WHERE id = v_reversal_entry_id;
  UPDATE public.payments SET status = 'REVERSED', reversed_at = now(), reversed_by = v_user_id,
    reversal_reason = v_reason, unallocated_amount = 0, reversal_journal_entry_id = v_reversal_entry_id
  WHERE id = p_payment_id;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id, p_action := 'PAYMENT_REVERSED',
    p_entity_type := 'PAYMENT', p_resort_id := v_payment.property_id, p_entity_id := p_payment_id,
    p_request_id := NULL, p_ip_address := p_ip_address, p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object('reason', v_reason, 'original_amount', v_payment.amount,
      'previous_unallocated_amount', v_payment.unallocated_amount, 'reversal_journal_entry_id', v_reversal_entry_id,
      'affected_due_ids', to_jsonb(COALESCE(v_affected_due_ids, ARRAY[]::uuid[])),
      'reversed_allocations', COALESCE(v_allocation_snapshot, '[]'::jsonb)));
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id,
    'reversal_journal_entry_id', v_reversal_entry_id,
    'affected_due_ids', to_jsonb(COALESCE(v_affected_due_ids, ARRAY[]::uuid[])));
END;
$$;
ALTER FUNCTION public.void_payment(uuid, uuid, text, inet, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_payment(uuid, uuid, text, inet, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_payment(uuid, uuid, text, inet, text) TO authenticated, service_role;
