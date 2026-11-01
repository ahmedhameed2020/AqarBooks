-- Phase 2c: a zero arithmetic difference is not enough to finalize a bank reconciliation.
--
-- get_bank_reconciliation_summary treats an unmatched bank line as a reconciling item, so importing a bank fee that was
-- never booked makes the difference zero (the bank-only line cancels the book/bank gap) while the books still lack the
-- expense. finalize_bank_reconciliation accepted that. Now every statement line must be matched to a book entry; the
-- fee must be booked (created, posted) and matched first. Book-only items (cheques / deposits in transit) remain
-- ordinary reconciling items, as before. No general "explain / defer" exception exists in this phase.

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
