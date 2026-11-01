-- Phase 2e: upgrade path to the strict bank-reconciliation finalize.
--
-- An earlier version of migration 20261012100000 (Phase 2c) shipped an audited "explain a statement line instead of
-- matching it" exception: columns bank_statement_lines.resolution*, a coherence constraint, a guard trigger, the
-- functions explain_bank_statement_line / unexplain_bank_statement_line, and a finalize_bank_reconciliation that let an
-- explained line through. That exception was withdrawn (it allowed a bank fee to be deferred and the reconciliation to
-- be finalized with the fee outside the books) and the 2c file now contains only the strict finalize.
-- Editing a migration does not change a database that already applied the old text, so this forward migration converges
-- any such database to the strict design. On a database built from the current files it is a no-op apart from
-- re-creating the same finalize function.
--
-- What it does, in order:
--   1. records, in platform_audit_logs, one 'finance.bank_statement_line.explanation_retired' row for every line that is
--      still explained (original reason, actor and time are kept in the row) - the explanation columns are about to go;
--   2. drops the guard trigger, its function, the explain / unexplain functions, the coherence constraint and the columns;
--   3. re-creates finalize_bank_reconciliation strictly: every statement line must be matched to a booked entry.
-- Never touched: bank_statements, bank_statement_lines rows (date, description, reference, amount, match), RECONCILED
-- statements and all existing platform_audit_logs rows (including the earlier explained / explanation_removed events).
-- A line that was explained keeps blocking finalize until its entry is booked, posted and matched.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bank_statement_lines' AND column_name = 'resolution'
  ) THEN
    EXECUTE $q$
      INSERT INTO public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
      SELECT NULL, bl.organization_id, 'finance.bank_statement_line.explanation_retired', 'bank_statement_line', bl.id, bl.resolution_reason,
             jsonb_build_object('statement_id', bl.statement_id, 'amount', bl.amount, 'line_date', bl.line_date,
                                'explained_by', bl.resolved_by, 'explained_at', bl.resolved_at,
                                'note', 'explanation mechanism withdrawn; the line must now be matched to a booked entry')
      FROM public.bank_statement_lines bl
      WHERE bl.resolution IS NOT NULL
    $q$;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_bank_statement_line_resolution ON public.bank_statement_lines;
DROP FUNCTION IF EXISTS public.guard_bank_statement_line_resolution();
DROP FUNCTION IF EXISTS public.explain_bank_statement_line(uuid, text);
DROP FUNCTION IF EXISTS public.unexplain_bank_statement_line(uuid);
ALTER TABLE public.bank_statement_lines DROP CONSTRAINT IF EXISTS bank_statement_lines_resolution_coherent;
ALTER TABLE public.bank_statement_lines
  DROP COLUMN IF EXISTS resolution,
  DROP COLUMN IF EXISTS resolution_reason,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS resolved_at;

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

  -- Every bank statement line must be matched to a BOOKED entry. A bank-only item (a fee, interest, a charge) makes the
  -- arithmetic difference zero while the books still lack the entry, so it cannot be finalized until the entry is
  -- created, posted and matched. There is deliberately no "explain / defer" exception at this stage: deferring a
  -- bank charge to a later period is an accounting decision with its own controls, to be designed separately.
  select count(*) into v_unhandled
  from public.bank_statement_lines bl
  where bl.statement_id = p_statement_id
    and bl.matched_journal_entry_line_id is null;
  if v_unhandled > 0 then
    raise exception 'RECONCILIATION_UNHANDLED_LINES: % سطر/أسطر بالكشف غير مطابقة لقيد محاسبي — سجّل القيد وطابقه قبل اعتماد المطابقة', v_unhandled
      using errcode = 'P0001';
  end if;

  update public.bank_statements
  set status = 'RECONCILED',
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = p_statement_id;
end;
$function$;
