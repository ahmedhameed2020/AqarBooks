-- Phase 2c: a zero arithmetic difference is not enough to finalize a bank reconciliation.
--
-- get_bank_reconciliation_summary treats an unmatched bank line as a reconciling item, so importing a bank fee that was
-- never booked makes the difference zero (the bank-only line cancels the book/bank gap) while the books still lack the
-- expense. finalize_bank_reconciliation accepted that. Now every statement line must be matched to a book entry OR carry
-- an explicit, audited explanation (a legitimate exception, e.g. a bank item that will be booked next period).
-- Book-only items (cheques/deposits in transit) remain ordinary reconciling items, as before.

ALTER TABLE public.bank_statement_lines
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.bank_statement_lines DROP CONSTRAINT IF EXISTS bank_statement_lines_resolution_coherent;
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_resolution_coherent CHECK (
  (resolution IS NULL AND resolution_reason IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
  OR (resolution = 'EXPLAINED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND char_length(btrim(coalesce(resolution_reason, ''))) >= 10 AND matched_journal_entry_line_id IS NULL)
);

-- The explanation columns can only be written by the two functions below (which audit); matching a line clears it.
CREATE OR REPLACE FUNCTION public.guard_bank_statement_line_resolution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.matched_journal_entry_line_id IS NOT NULL THEN
    NEW.resolution := NULL; NEW.resolution_reason := NULL; NEW.resolved_by := NULL; NEW.resolved_at := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.resolution IS NOT NULL AND coalesce(current_setting('aqar.bank_line_resolution', true), '') <> 'on' THEN
      RAISE EXCEPTION 'BANK_LINE_RESOLUTION_VIA_FUNCTION_ONLY' USING errcode = '42501';
    END IF;
  ELSIF (NEW.resolution, NEW.resolution_reason, NEW.resolved_by, NEW.resolved_at)
        IS DISTINCT FROM (OLD.resolution, OLD.resolution_reason, OLD.resolved_by, OLD.resolved_at)
        AND coalesce(current_setting('aqar.bank_line_resolution', true), '') <> 'on' THEN
    RAISE EXCEPTION 'BANK_LINE_RESOLUTION_VIA_FUNCTION_ONLY' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_bank_statement_line_resolution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_bank_statement_line_resolution ON public.bank_statement_lines;
CREATE TRIGGER trg_guard_bank_statement_line_resolution
  BEFORE INSERT OR UPDATE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_bank_statement_line_resolution();

CREATE OR REPLACE FUNCTION public.explain_bank_statement_line(p_line_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line public.bank_statement_lines;
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT * INTO v_line FROM public.bank_statement_lines WHERE id = p_line_id;
  IF v_line.id IS NULL OR auth.uid() IS NULL
     OR NOT public.has_permission(auth.uid(), v_line.organization_id, 'finance.bank_reconciliation.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  SELECT status INTO v_status FROM public.bank_statements WHERE id = v_line.statement_id;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'BANK_STATEMENT_NOT_DRAFT' USING errcode = 'P0001'; END IF;
  IF v_line.matched_journal_entry_line_id IS NOT NULL THEN RAISE EXCEPTION 'LINE_ALREADY_MATCHED' USING errcode = '22023'; END IF;
  IF char_length(v_reason) < 10 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: التبرير مطلوب (10 إلى 500 حرف)' USING errcode = '22023';
  END IF;

  PERFORM set_config('aqar.bank_line_resolution', 'on', true);
  UPDATE public.bank_statement_lines
  SET resolution = 'EXPLAINED', resolution_reason = v_reason, resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_line_id;
  PERFORM set_config('aqar.bank_line_resolution', 'off', true);

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  VALUES (auth.uid(), v_line.organization_id, 'finance.bank_statement_line.explained', 'bank_statement_line', p_line_id, v_reason,
          jsonb_build_object('statement_id', v_line.statement_id, 'amount', v_line.amount, 'line_date', v_line.line_date));
END;
$$;
ALTER FUNCTION public.explain_bank_statement_line(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.explain_bank_statement_line(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.explain_bank_statement_line(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unexplain_bank_statement_line(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line public.bank_statement_lines;
  v_status text;
BEGIN
  SELECT * INTO v_line FROM public.bank_statement_lines WHERE id = p_line_id;
  IF v_line.id IS NULL OR auth.uid() IS NULL
     OR NOT public.has_permission(auth.uid(), v_line.organization_id, 'finance.bank_reconciliation.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  SELECT status INTO v_status FROM public.bank_statements WHERE id = v_line.statement_id;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'BANK_STATEMENT_NOT_DRAFT' USING errcode = 'P0001'; END IF;
  IF v_line.resolution IS NULL THEN RETURN; END IF;

  PERFORM set_config('aqar.bank_line_resolution', 'on', true);
  UPDATE public.bank_statement_lines
  SET resolution = NULL, resolution_reason = NULL, resolved_by = NULL, resolved_at = NULL
  WHERE id = p_line_id;
  PERFORM set_config('aqar.bank_line_resolution', 'off', true);

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  VALUES (auth.uid(), v_line.organization_id, 'finance.bank_statement_line.explanation_removed', 'bank_statement_line', p_line_id, v_line.resolution_reason,
          jsonb_build_object('statement_id', v_line.statement_id, 'amount', v_line.amount));
END;
$$;
ALTER FUNCTION public.unexplain_bank_statement_line(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.unexplain_bank_statement_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unexplain_bank_statement_line(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_bank_reconciliation(p_statement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_status text;
  v_difference numeric;
  v_tolerance numeric;
  v_unhandled integer;
begin
  select organization_id, status into v_org, v_status
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: كشف الحساب معتمد بالفعل' using errcode = 'P0001';
  end if;

  select difference into v_difference
  from public.get_bank_reconciliation_summary(p_statement_id);

  select power(10::numeric, -public.currency_decimals(o.default_currency)) / 2
  into v_tolerance
  from public.organizations o where o.id = v_org;
  v_tolerance := coalesce(v_tolerance, 0.005);

  if abs(v_difference) >= v_tolerance then
    raise exception 'RECONCILIATION_NOT_BALANCED: لا يمكن اعتماد المطابقة والفرق % غير صفري', v_difference
      using errcode = 'P0001';
  end if;

  -- A bank line that is neither matched to a book entry nor explicitly explained is an unhandled item: the arithmetic
  -- difference can be zero while the books lack the entry (an unbooked bank fee). Refuse, in the database.
  select count(*) into v_unhandled
  from public.bank_statement_lines bl
  where bl.statement_id = p_statement_id
    and bl.matched_journal_entry_line_id is null
    and bl.resolution is null;
  if v_unhandled > 0 then
    raise exception 'RECONCILIATION_UNHANDLED_LINES: % سطر/أسطر بالكشف غير مطابقة ولا مُبرَّرة — قيّدها وطابقها أو دوّن تبريرًا صريحًا', v_unhandled
      using errcode = 'P0001';
  end if;

  update public.bank_statements
  set status = 'RECONCILED',
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = p_statement_id;
end;
$function$;
