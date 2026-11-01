-- Fiscal year close: permission key and income-statement exclusion of closing entries.
-- Forward-only; no earlier migration is edited.
--
-- 1. Permission 'finance.years.close'. Registered in public.permissions (permissions_key_key UNIQUE,
--    baseline:13934; FK target of role_template_permissions.permission_key, baseline:16237).
--    Attached ONLY to the TENANT_OWNER role template (role_template_permissions row; the template is
--    the organization owner: lib/auth/authorize.ts:210 `isOwner = roles.some(key === 'TENANT_OWNER')`).
--    Not attached to FINANCE_MANAGER or any other template. Not attached to any live role
--    (role_permissions): clone_tenant_role_templates (baseline:1684) copies templates only when an
--    organization is created, so existing organizations need a per-organization grant.
--    Attaching a key to a template is also what makes it assignable: replace_role_permissions_atomic
--    rejects permissions with no template row (INVALID_PERMISSION_SCOPE, 20261009130000:99).
--
-- 2. get_trial_balance: the income statement (finance/reports/income-statement), budget-vs-actual and the
--    reports hub read REVENUE / EXPENSE rows from this function. A year-end closing entry (source_type
--    'YEAR_END_CLOSING') zeroes those accounts, so without this change a closed year's income statement
--    would show zero revenue and zero expense. Closing entries are therefore excluded for REVENUE and
--    EXPENSE accounts ONLY. Balance-sheet accounts keep them.
--    get_trial_balance_with_opening is intentionally NOT changed (see the comment in section 2 below).
--
-- Nothing in this file creates closing entries; those come from the closing core migration.

-- ---------------------------------------------------------------------------
-- 1. Permission
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description)
values ('finance.years.close', 'Run the year-end closing of a fiscal year')
on conflict (key) do nothing;

-- Template grant: TENANT_OWNER only. Guarded so it is a no-op when the owner template is absent.
-- role_template_permissions primary key is (role_template_key, permission_key) (baseline:14038).
insert into public.role_template_permissions (role_template_key, permission_key)
select 'TENANT_OWNER', 'finance.years.close'
where exists (select 1 from public.role_templates where key = 'TENANT_OWNER')
  and exists (select 1 from public.permissions where key = 'finance.years.close')
on conflict (role_template_key, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. get_trial_balance: same signature, same guard, same body as 20261010120000 except the filter in
--    the EXISTS clause, which now skips YEAR_END_CLOSING lines on REVENUE / EXPENSE accounts.
--
--    Why get_trial_balance_with_opening is not changed: its P&L movement feeds the trial balance page
--    and the balance sheet. Both must include closing entries. After a closing, P&L closing balances are
--    zero and the result sits in equity; the balance sheet's current earnings (revenue - expense) is
--    zero too, so it still balances. Excluding closings there would double count the result. Its
--    RE-PRIOR line (v_prior_net) also needs closings included, for the same reason.
-- ---------------------------------------------------------------------------
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
       -- Income-statement accounts exclude the year-end closing; balance-sheet accounts keep it.
       AND (a.category NOT IN ('REVENUE', 'EXPENSE')
            OR je.source_type IS DISTINCT FROM 'YEAR_END_CLOSING')
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
