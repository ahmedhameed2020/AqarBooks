-- Phase 2: ledger reports must keep reversed originals, and the trial balance gets opening balances.
-- Forward-only; no earlier migration is edited.
--
-- 1. REVERSED originals. void_payment, reverse_journal_entry, cancel_supplier_invoice and the other
--    reversal paths do not delete or edit the original entry: they post a NEW entry that mirrors it
--    (status POSTED, reversed_entry_id = original) and flip the ORIGINAL to status REVERSED. Every
--    ledger report filtered `status = 'POSTED'`, so after a reversal they kept the reversing entry and
--    dropped the original: a payment of 500 that was voided showed as -500 in cash and +500 in
--    receivables instead of netting to zero (trial balance, ledger, cash flow, cash position, bank
--    reconciliation book balance, project WIP). An entry that was posted and later reversed is still a
--    posted entry whose effect is offset by its reversal, so these reports now count POSTED and REVERSED
--    entries. DRAFT / UNDER_REVIEW entries are still excluded.


-- get_trial_balance: same signature, same guard (20261009120000); only the status filter changes.
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
    END IF;
    IF p_organization_id IS NULL
       OR NOT public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    COALESCE(SUM(l.debit), 0),
    COALESCE(SUM(l.credit), 0),
    CASE WHEN a.normal_balance = 'DEBIT'
      THEN COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)
      ELSE COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0)
    END
  FROM public.chart_of_accounts a
  LEFT JOIN public.journal_entry_lines l
    ON l.account_id = a.id
   AND EXISTS (
     SELECT 1
     FROM public.journal_entries je
     WHERE je.id = l.journal_entry_id
       AND je.organization_id = p_organization_id
       AND je.status IN ('POSTED', 'REVERSED')
       AND je.entry_date BETWEEN p_start_date AND p_end_date
   )
  WHERE a.organization_id = p_organization_id
    AND NOT a.is_group
  GROUP BY a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  ORDER BY a.code;
END;
$$;
ALTER FUNCTION public.get_trial_balance(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trial_balance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(uuid, date, date) TO authenticated, service_role;

-- Other ledger reports (bodies unchanged except the status filter)
CREATE OR REPLACE FUNCTION public.get_account_ledger(p_organization_id uuid, p_account_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(entry_id uuid, entry_number bigint, entry_date date, description text, debit numeric, credit numeric, running_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  select
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    l.debit,
    l.credit,
    sum(
      case when a.normal_balance = 'DEBIT' then l.debit - l.credit else l.credit - l.debit end
    ) over (order by je.entry_date, je.entry_number, l.id) as running_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.id = p_account_id
    and a.organization_id = p_organization_id
    and je.status IN ('POSTED', 'REVERSED')
    and je.entry_date between p_start_date and p_end_date
  order by je.entry_date, je.entry_number, l.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_flow_statement(p_organization_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(section text, account_id uuid, code text, name_ar text, name_en text, category text, is_classified boolean, net_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  with cash_entries as (
    select distinct je.id
    from public.journal_entries je
    join public.journal_entry_lines l on l.journal_entry_id = je.id
    join public.chart_of_accounts a on a.id = l.account_id
    where je.organization_id = p_organization_id
      and je.status IN ('POSTED', 'REVERSED')
      and je.entry_date between p_start_date and p_end_date
      and a.is_cash_equivalent
  )
  select
    coalesce(
      a.cash_flow_section,
      case when a.category = 'EQUITY' then 'FINANCING' else 'OPERATING' end
    )::text as section,
    a.id as account_id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category::text,
    (a.cash_flow_section is not null) as is_classified,
    sum(l.credit - l.debit) as net_amount
  from public.journal_entry_lines l
  join cash_entries ce on ce.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and not a.is_cash_equivalent
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.cash_flow_section
  having sum(l.credit - l.debit) <> 0
  order by 1, a.code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_position(p_organization_id uuid, p_as_of_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  select coalesce(sum(l.debit - l.credit), 0)
  into v_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and a.is_cash_equivalent
    and je.status IN ('POSTED', 'REVERSED')
    and je.entry_date <= p_as_of_date;

  return v_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_summary(p_statement_id uuid)
 RETURNS TABLE(book_balance numeric, closing_balance numeric, opening_balance numeric, unmatched_gl_total numeric, unmatched_statement_total numeric, unmatched_gl_count integer, unmatched_statement_count integer, difference numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_gl_account uuid;
  v_period_start date;
  v_period_end date;
  v_closing numeric;
  v_opening numeric;
begin
  select s.organization_id, ba.gl_account_id, s.period_start, s.period_end,
         s.closing_balance, s.opening_balance
  into v_org, v_gl_account, v_period_start, v_period_end, v_closing, v_opening
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.read')
    or public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  with book as (
    select coalesce(sum(l.debit - l.credit), 0) as bal
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status IN ('POSTED', 'REVERSED')
      and je.entry_date <= v_period_end
  ),
  unmatched_gl as (
    select coalesce(sum(l.debit - l.credit), 0) as total, count(*)::int as cnt
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status IN ('POSTED', 'REVERSED')
      and je.entry_date between v_period_start and v_period_end
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      )
  ),
  unmatched_stmt as (
    select coalesce(sum(bl.amount), 0) as total, count(*)::int as cnt
    from public.bank_statement_lines bl
    where bl.statement_id = p_statement_id
      and bl.matched_journal_entry_line_id is null
  )
  select
    book.bal,
    v_closing,
    v_opening,
    unmatched_gl.total,
    unmatched_stmt.total,
    unmatched_gl.cnt,
    unmatched_stmt.cnt,
    (v_closing + unmatched_gl.total - unmatched_stmt.total) - book.bal
  from book, unmatched_gl, unmatched_stmt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_bank_match_candidates(p_statement_line_id uuid, p_date_tolerance_days integer DEFAULT 30)
 RETURNS TABLE(journal_entry_line_id uuid, entry_id uuid, entry_number bigint, entry_date date, description text, signed_amount numeric, date_distance integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_gl_account uuid;
  v_line_date date;
  v_amount numeric;
begin
  select bl.organization_id, ba.gl_account_id, bl.line_date, bl.amount
  into v_org, v_gl_account, v_line_date, v_amount
  from public.bank_statement_lines bl
  join public.bank_statements s on s.id = bl.statement_id
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where bl.id = p_statement_line_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_LINE_NOT_FOUND: سطر كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    (l.debit - l.credit),
    abs(je.entry_date - v_line_date)::int
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.account_id = v_gl_account
    and je.organization_id = v_org
    and je.status IN ('POSTED', 'REVERSED')
    and (l.debit - l.credit) = v_amount
    and je.entry_date between v_line_date - p_date_tolerance_days
                          and v_line_date + p_date_tolerance_days
    and not exists (
      select 1 from public.bank_statement_lines bl
      where bl.matched_journal_entry_line_id = l.id
    )
  order by abs(je.entry_date - v_line_date), je.entry_date, je.entry_number
  limit 50;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_match_bank_statement(p_statement_id uuid, p_date_tolerance_days integer DEFAULT 5)
 RETURNS TABLE(matched_count integer, ambiguous_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_gl_account uuid;
  v_status text;
  v_matched int := 0;
  v_ambiguous int := 0;
  v_unmatched int;
  v_line record;
  v_candidate uuid;
  v_candidate_count int;
begin
  select s.organization_id, ba.gl_account_id, s.status
  into v_org, v_gl_account, v_status
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: لا يمكن تعديل مطابقة كشف حساب معتمد؛ أعد فتحه أولًا' using errcode = 'P0001';
  end if;

  if p_date_tolerance_days < 0 or p_date_tolerance_days > 60 then
    raise exception 'INVALID_TOLERANCE: نطاق التسامح في التاريخ يجب أن يكون بين 0 و60 يومًا' using errcode = 'P0001';
  end if;

  for v_line in
    select id, line_date, amount
    from public.bank_statement_lines
    where statement_id = p_statement_id
      and matched_journal_entry_line_id is null
    order by line_date, sort_order, id
  loop
    select count(*), (array_agg(l.id))[1]
    into v_candidate_count, v_candidate
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status IN ('POSTED', 'REVERSED')
      and (l.debit - l.credit) = v_line.amount
      and je.entry_date between v_line.line_date - p_date_tolerance_days
                            and v_line.line_date + p_date_tolerance_days
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      );

    if v_candidate_count = 1 then
      update public.bank_statement_lines
      set matched_journal_entry_line_id = v_candidate,
          match_type = 'AUTO',
          matched_at = now(),
          matched_by = auth.uid()
      where id = v_line.id;
      v_matched := v_matched + 1;
    elsif v_candidate_count > 1 then
      v_ambiguous := v_ambiguous + 1;
    end if;
  end loop;

  select count(*) into v_unmatched
  from public.bank_statement_lines
  where statement_id = p_statement_id
    and matched_journal_entry_line_id is null;

  return query select v_matched, v_ambiguous, v_unmatched;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_wip_summary(p_project_id uuid)
 RETURNS TABLE(capitalised numeric, released numeric, wip_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wip uuid;
begin
  select pr.wip_account_id into v_wip from public.projects pr where pr.id = p_project_id;

  return query
  select
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0)
      - coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0)
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.project_id = p_project_id and je.status IN ('POSTED', 'REVERSED');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Trial balance with opening balances:  opening + period movement = closing.
--
-- get_trial_balance (above) is movement-only. A report for 2026 therefore ignored a balance carried
-- in from 2025 (e.g. an opening receivable of 10,000 dated 2025-12-31). The new function returns, per
-- account, the balance BEFORE the period, the period's debits and credits, and the closing balance.
--
-- Fiscal-year rules (no year-end closing entries exist in the product, and none are created here):
--   * Balance-sheet accounts (ASSET, LIABILITY, EQUITY): opening = everything posted before the start date.
--   * Income-statement accounts (REVENUE, EXPENSE): opening = movement from the START OF THE FISCAL YEAR
--     that contains the start date up to the day before it (year-to-date). A period that starts on the
--     first day of a fiscal year opens at zero.
--   * Result of earlier, unclosed fiscal years: since nothing closes them into retained earnings, their
--     net result is shown on ONE explicit synthetic equity line ("retained earnings of prior years - not
--     closed", is_synthetic = true) so the report balances without pretending a close happened.
--   * If no fiscal year contains the start date (fiscal_year_known = false) the start date itself is used
--     as the year boundary: income-statement accounts open at zero and everything earlier is on the
--     synthetic line.
-- Same guard as get_trial_balance. Counts POSTED and REVERSED entries (see 1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance_with_opening(
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
  opening_debit numeric,
  opening_credit numeric,
  period_debit numeric,
  period_credit numeric,
  closing_debit numeric,
  closing_credit numeric,
  opening_balance numeric,
  closing_balance numeric,
  is_synthetic boolean,
  fiscal_year_known boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_fy_start date;
  v_fy_known boolean;
  v_prior_net numeric;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
    END IF;
    IF p_organization_id IS NULL
       OR NOT public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
    END IF;
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'INVALID_PERIOD' USING errcode = '22023';
  END IF;

  SELECT max(fy.start_date) INTO v_fy_start
  FROM public.fiscal_years fy
  WHERE fy.organization_id = p_organization_id
    AND fy.start_date <= p_start_date
    AND fy.end_date >= p_start_date;
  v_fy_known := v_fy_start IS NOT NULL;
  v_fy_start := coalesce(v_fy_start, p_start_date);

  -- net (debit - credit) of income-statement accounts before the fiscal-year boundary: earlier years' results
  SELECT coalesce(sum(l.debit - l.credit), 0) INTO v_prior_net
  FROM public.journal_entry_lines l
  JOIN public.journal_entries je ON je.id = l.journal_entry_id
  JOIN public.chart_of_accounts a ON a.id = l.account_id
  WHERE je.organization_id = p_organization_id
    AND je.status IN ('POSTED', 'REVERSED')
    AND je.entry_date < v_fy_start
    AND a.category IN ('REVENUE', 'EXPENSE');

  RETURN QUERY
  WITH agg AS (
    SELECT
      a.id AS aid, a.code, a.name_ar, a.name_en, a.category, a.normal_balance,
      coalesce(sum(l.debit - l.credit) FILTER (
        WHERE je.entry_date < p_start_date
          AND (a.category IN ('ASSET', 'LIABILITY', 'EQUITY') OR je.entry_date >= v_fy_start)
      ), 0) AS open_net,
      coalesce(sum(l.debit) FILTER (WHERE je.entry_date BETWEEN p_start_date AND p_end_date), 0) AS p_debit,
      coalesce(sum(l.credit) FILTER (WHERE je.entry_date BETWEEN p_start_date AND p_end_date), 0) AS p_credit
    FROM public.chart_of_accounts a
    LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
    LEFT JOIN public.journal_entries je
      ON je.id = l.journal_entry_id
     AND je.organization_id = p_organization_id
     AND je.status IN ('POSTED', 'REVERSED')
    WHERE a.organization_id = p_organization_id AND NOT a.is_group
    GROUP BY a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  ),
  rows AS (
    SELECT aid, code, name_ar, name_en, category, normal_balance, open_net, p_debit, p_credit, false AS synth
    FROM agg
    UNION ALL
    SELECT NULL::uuid, 'RE-PRIOR', 'أرباح مرحّلة من سنوات سابقة (غير مقفلة)',
           'Retained earnings of prior years (not closed)', 'EQUITY', 'CREDIT',
           v_prior_net, 0::numeric, 0::numeric, true
    WHERE v_prior_net <> 0
  )
  SELECT
    r.aid, r.code, r.name_ar, r.name_en, r.category, r.normal_balance,
    greatest(r.open_net, 0), greatest(-r.open_net, 0),
    r.p_debit, r.p_credit,
    greatest(r.open_net + r.p_debit - r.p_credit, 0), greatest(-(r.open_net + r.p_debit - r.p_credit), 0),
    CASE WHEN r.normal_balance = 'DEBIT' THEN r.open_net ELSE -r.open_net END,
    CASE WHEN r.normal_balance = 'DEBIT' THEN r.open_net + r.p_debit - r.p_credit
         ELSE -(r.open_net + r.p_debit - r.p_credit) END,
    r.synth, v_fy_known
  FROM rows r
  ORDER BY r.synth, r.code;
END;
$$;
ALTER FUNCTION public.get_trial_balance_with_opening(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trial_balance_with_opening(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_with_opening(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit trail visible to the people who are meant to read it.
--
-- /finance/reports/audit-trail read platform_audit_logs, whose only SELECT policy is "platform admin".
-- Every tenant user - including the auditor the page was built for - therefore saw an empty report with
-- a passing permission check: "no audit trail records found" next to real activity. Organization rows
-- are now readable by holders of finance.audit.read (the row's own organization, never another's).
-- The hash-chained financial_audit_logs keep their own policy (audit.read OR reports.read, 20261009120000).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_audit_logs_select_org_auditor ON public.platform_audit_logs;
CREATE POLICY platform_audit_logs_select_org_auditor ON public.platform_audit_logs
  FOR SELECT
  USING (organization_id IS NOT NULL AND public.has_any_permission(organization_id, ARRAY['finance.audit.read']));

-- Actor names for the audit report. profiles is readable only by its owner (and platform admins), so the
-- report could not show WHO acted. This returns names for members of the caller's own organization only,
-- and only to someone allowed to read the audit trail.
CREATE OR REPLACE FUNCTION public.get_audit_actor_names(p_organization_id uuid, p_actor_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_any_permission(p_organization_id, ARRAY['finance.audit.read', 'finance.reports.read']) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.organization_memberships om ON om.user_id = p.id AND om.organization_id = p_organization_id
  WHERE p.id = ANY (p_actor_ids);
END;
$$;
ALTER FUNCTION public.get_audit_actor_names(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_audit_actor_names(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_actor_names(uuid, uuid[]) TO authenticated, service_role;
