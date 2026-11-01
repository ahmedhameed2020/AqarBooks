-- Phase 1.2: separate financial READ permissions inside an organization.
-- Forward-only; no earlier migration is edited.
--
-- Until now 16 finance tables were readable by every ACTIVE member of the organization
-- (`<table>_select_member` = is_org_member). A gate operator or technician could therefore read
-- the chart of accounts, bank accounts and numbers, cashboxes, cheques, budgets and fiscal periods,
-- and list_projects exposed project budgets and WIP balances to any member.
--
-- Each table now has ONE permission-keyed SELECT policy built from the permission keys that the
-- pages/flows reading it already require (docs/audits/_parts/E-read-matrix.md). The old
-- `*_select_member` policies are dropped, never supplemented. The `*_manage` ALL policies are
-- untouched: they are permissive, so holders of the write key keep reading through them.
-- finance.reports.read is deliberately NOT applied to every table (bank accounts, cashboxes,
-- cash movements and cashier sessions do not accept it).

CREATE OR REPLACE FUNCTION public.has_any_permission(p_organization_id uuid, p_permission_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Identity comes only from auth.uid(); the user id is not a parameter, so this cannot be used
  -- to probe another user's permissions. Same authority model as has_permission(): ACTIVE
  -- membership in this exact organization plus a tenant-scoped role holding any listed key
  -- (never PLATFORM_SUPER_ADMIN through a role), or platform admin.
  select auth.uid() is not null and (
    public.is_platform_admin(auth.uid())
    or (
      exists (
        select 1 from public.organization_memberships om
        where om.user_id = auth.uid()
          and om.organization_id = p_organization_id
          and om.status = 'active'
      )
      and exists (
        select 1
        from public.user_role_assignments ura
        join public.roles r on r.id = ura.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where ura.user_id = auth.uid()
          and ura.organization_id = p_organization_id
          and p.key = any (p_permission_keys)
          and (r.organization_id = p_organization_id
               or (r.organization_id is null and r.key <> 'PLATFORM_SUPER_ADMIN'))
      )
    )
  );
$$;
ALTER FUNCTION public.has_any_permission(uuid, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_any_permission(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permission-keyed SELECT policies (old membership-only policies dropped)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS chart_of_accounts_select_member ON public.chart_of_accounts;
DROP POLICY IF EXISTS chart_of_accounts_select_permission ON public.chart_of_accounts;
CREATE POLICY chart_of_accounts_select_permission ON public.chart_of_accounts FOR SELECT USING (public.has_any_permission(organization_id, array['finance.accounts.view', 'finance.reports.read', 'finance.entries.create', 'finance.dues.issue', 'receivables.dues.create', 'receivables.payments.create', 'finance.expenses.read', 'finance.suppliers.read', 'finance.assets.read', 'finance.assets.manage', 'finance.service_charges.read', 'finance.service_charges.manage', 'finance.einvoice.read', 'finance.einvoice.manage', 'finance.commissions.read', 'finance.commissions.manage', 'finance.budgets.manage', 'banking.accounts.view', 'cashier.transactions.read', 'operations.maintenance.costs.manage', 'operations.maintenance.costs.post', 'operations.maintenance.owner_charge', 'property.leases.manage', 'property.installments.manage']));

DROP POLICY IF EXISTS fiscal_years_select_member ON public.fiscal_years;
DROP POLICY IF EXISTS fiscal_years_select_permission ON public.fiscal_years;
CREATE POLICY fiscal_years_select_permission ON public.fiscal_years FOR SELECT USING (public.has_any_permission(organization_id, array['finance.periods.manage', 'finance.reports.read', 'finance.accounts.view']));

DROP POLICY IF EXISTS fiscal_periods_select_member ON public.fiscal_periods;
DROP POLICY IF EXISTS fiscal_periods_select_permission ON public.fiscal_periods;
CREATE POLICY fiscal_periods_select_permission ON public.fiscal_periods FOR SELECT USING (public.has_any_permission(organization_id, array['finance.periods.manage', 'finance.reports.read', 'finance.accounts.view', 'finance.payments.read', 'receivables.payments.create', 'finance.dues.read', 'finance.dues.issue', 'finance.expenses.read', 'finance.suppliers.read', 'finance.einvoice.read', 'finance.assets.read', 'finance.entries.create', 'banking.accounts.view', 'cashier.transactions.read', 'operations.maintenance.costs.post', 'finance.budgets.manage']));

DROP POLICY IF EXISTS cost_centers_select_member ON public.cost_centers;
DROP POLICY IF EXISTS cost_centers_select_permission ON public.cost_centers;
CREATE POLICY cost_centers_select_permission ON public.cost_centers FOR SELECT USING (public.has_any_permission(organization_id, array['finance.accounts.view', 'finance.reports.read']));

DROP POLICY IF EXISTS budgets_select_member ON public.budgets;
DROP POLICY IF EXISTS budgets_select_permission ON public.budgets;
CREATE POLICY budgets_select_permission ON public.budgets FOR SELECT USING (public.has_any_permission(organization_id, array['finance.reports.read']));

DROP POLICY IF EXISTS banks_select_member ON public.banks;
DROP POLICY IF EXISTS banks_select_permission ON public.banks;
CREATE POLICY banks_select_permission ON public.banks FOR SELECT USING (public.has_any_permission(organization_id, array['banking.accounts.view', 'finance.bank_reconciliation.read', 'finance.bank_reconciliation.manage', 'banking.cheques.manage', 'banking.reconciliations.manage', 'finance.audit.read']));

DROP POLICY IF EXISTS bank_accounts_select_member ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_select_permission ON public.bank_accounts;
CREATE POLICY bank_accounts_select_permission ON public.bank_accounts FOR SELECT USING (public.has_any_permission(organization_id, array['banking.accounts.view', 'finance.bank_reconciliation.read', 'finance.bank_reconciliation.manage', 'banking.cheques.manage', 'banking.reconciliations.manage', 'finance.audit.read']));

DROP POLICY IF EXISTS cashboxes_select_member ON public.cashboxes;
DROP POLICY IF EXISTS cashboxes_select_permission ON public.cashboxes;
CREATE POLICY cashboxes_select_permission ON public.cashboxes FOR SELECT USING (public.has_any_permission(organization_id, array['cashier.transactions.read', 'cashier.sessions.open', 'cashier.sessions.close', 'cashier.transactions.create', 'receivables.payments.create', 'finance.payments.create']));

DROP POLICY IF EXISTS cash_transactions_select_member ON public.cash_transactions;
DROP POLICY IF EXISTS cash_transactions_select_permission ON public.cash_transactions;
CREATE POLICY cash_transactions_select_permission ON public.cash_transactions FOR SELECT USING (public.has_any_permission(organization_id, array['cashier.transactions.read', 'cashier.reconciliations.approve', 'finance.audit.read']));

DROP POLICY IF EXISTS cheques_select_member ON public.cheques;
DROP POLICY IF EXISTS cheques_select_permission ON public.cheques;
CREATE POLICY cheques_select_permission ON public.cheques FOR SELECT USING (public.has_any_permission(organization_id, array['banking.accounts.view', 'banking.cheques.manage', 'finance.reports.read', 'finance.payments.read', 'cashier.transactions.read', 'finance.audit.read']));

DROP POLICY IF EXISTS due_types_select_member ON public.due_types;
DROP POLICY IF EXISTS due_types_select_permission ON public.due_types;
CREATE POLICY due_types_select_permission ON public.due_types FOR SELECT USING (public.has_any_permission(organization_id, array['finance.dues.read', 'finance.dues.issue', 'receivables.dues.create', 'finance.service_charges.read', 'finance.einvoice.read', 'property.units.view', 'property.members.view', 'property.reports.read', 'operations.maintenance.owner_charge']));

DROP POLICY IF EXISTS expense_categories_select_member ON public.expense_categories;
DROP POLICY IF EXISTS expense_categories_select_permission ON public.expense_categories;
CREATE POLICY expense_categories_select_permission ON public.expense_categories FOR SELECT USING (public.has_any_permission(organization_id, array['finance.expenses.read', 'finance.suppliers.read', 'operations.maintenance.costs.manage', 'operations.maintenance.costs.post']));

DROP POLICY IF EXISTS projects_select_member ON public.projects;
DROP POLICY IF EXISTS projects_select_permission ON public.projects;
CREATE POLICY projects_select_permission ON public.projects FOR SELECT USING (public.has_any_permission(organization_id, array['finance.accounts.view', 'finance.reports.read']));

DROP POLICY IF EXISTS cashier_sessions_select_member ON public.cashier_sessions;
DROP POLICY IF EXISTS cashier_sessions_select_permission ON public.cashier_sessions;
CREATE POLICY cashier_sessions_select_permission ON public.cashier_sessions FOR SELECT USING ((public.has_any_permission(organization_id, array['cashier.transactions.read', 'cashier.sessions.open', 'cashier.sessions.close', 'cashier.reconciliations.approve', 'finance.audit.read'])) OR (opened_by = auth.uid() AND public.is_org_member(auth.uid(), organization_id)));

DROP POLICY IF EXISTS journal_entry_lines_select_member ON public.journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_select_permission ON public.journal_entry_lines;
CREATE POLICY journal_entry_lines_select_permission ON public.journal_entry_lines FOR SELECT USING (EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = journal_entry_lines.journal_entry_id AND public.has_any_permission(je.organization_id, array['finance.reports.read', 'finance.entries.create', 'finance.entries.review', 'finance.accounts.view', 'finance.audit.read'])));

DROP POLICY IF EXISTS cheque_status_history_select_member ON public.cheque_status_history;
DROP POLICY IF EXISTS cheque_status_history_select_permission ON public.cheque_status_history;
CREATE POLICY cheque_status_history_select_permission ON public.cheque_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.cheques c WHERE c.id = cheque_status_history.cheque_id AND public.has_any_permission(c.organization_id, array['banking.accounts.view', 'banking.cheques.manage', 'finance.reports.read', 'finance.payments.read', 'cashier.transactions.read', 'finance.audit.read'])));

-- ---------------------------------------------------------------------------
-- list_projects is SECURITY DEFINER and bypasses the table policy, so it is guarded itself:
-- membership alone no longer returns project budgets / WIP balances.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_projects(p_organization_id uuid)
 RETURNS TABLE(id uuid, code text, name_ar text, name_en text, status text, accounts_set boolean, budget_amount numeric, capitalised numeric, released numeric, wip_balance numeric, budget_variance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_any_permission(p_organization_id, array['finance.accounts.view','finance.accounts.manage','finance.reports.read']) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المشاريع'
      using errcode = '42501';
  end if;

  return query
  select pr.id, pr.code, pr.name_ar, pr.name_en, pr.status,
         (pr.wip_account_id is not null and pr.cost_of_sales_account_id is not null),
         pr.budget_amount, s.capitalised, s.released, s.wip_balance,
         case when pr.budget_amount is null then null
              else pr.budget_amount - s.capitalised end
  from public.projects pr
  cross join lateral public.project_wip_summary(pr.id) s
  where pr.organization_id = p_organization_id
  order by (pr.status <> 'ACTIVE'), pr.code;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Remaining finance functions reviewed in Phase 1.2
-- post_fx_difference: posted a journal entry through the unguarded internals for ANY organization
--   id (executable by every signed-in user). Now authorized like the path that legitimately reaches
--   it (settle_supplier_invoice_fx_difference requires finance.entries.create).
-- post_supplier_invoice_in_currency: the posting was already guarded by post_supplier_invoice; the
--   wrapper's own pre-reads ran before that check (organization existence / exchange-rate probe).
--   Authorize first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_fx_difference(p_organization_id uuid, p_property_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_difference numeric, p_counter_account_id uuid, p_description text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ready boolean;
  v_gain uuid;
  v_loss uuid;
  v_reason text;
  v_scale int;
  v_currency text;
  v_diff numeric;
  v_entry_id uuid;
begin
  -- Phase 1.2: this function posts a journal entry through the unguarded internals, and it was
  -- executable by every signed-in user for any organization id. Same authority as the posting
  -- path that legitimately reaches it (settle_supplier_invoice_fx_difference requires
  -- finance.entries.create); the check is resort-scoped like record_expense / post_supplier_invoice.
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فروق العملة' using errcode = '42501';
  end if;

  select r.ready, r.gain_account_id, r.loss_account_id, r.reason
  into v_ready, v_gain, v_loss, v_reason
  from public.check_fx_readiness(p_organization_id) r;

  if not v_ready then
    raise exception
      '%: عيّن حسابي ربح وخسارة فرق العملة قبل ترحيل أي فرق', v_reason
      using errcode = 'P0001';
  end if;

  select o.default_currency into v_currency from public.organizations o where o.id = p_organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));
  v_diff := round(p_difference, v_scale);

  if v_diff = 0 then
    return null;
  end if;

  if v_diff > 0 then
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', p_counter_account_id, 'debit', v_diff, 'credit', 0),
        jsonb_build_object('account_id', v_gain, 'debit', 0, 'credit', v_diff)
      ),
      p_idempotency_key
    );
  else
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_loss, 'debit', -v_diff, 'credit', 0),
        jsonb_build_object('account_id', p_counter_account_id, 'debit', 0, 'credit', -v_diff)
      ),
      p_idempotency_key
    );
  end if;

  perform public.post_journal_entry_internal(v_entry_id);
  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_supplier_invoice_in_currency(p_organization_id uuid, p_resort_id uuid, p_supplier_id uuid, p_purchase_order_id uuid, p_invoice_number text, p_expense_account_id uuid, p_net_amount numeric, p_discount_amount numeric, p_vat_rate numeric, p_vat_account_id uuid, p_wht_rate numeric, p_wht_account_id uuid, p_invoice_date date, p_due_date date, p_fiscal_period_id uuid, p_currency text, p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_base text;
  v_rate numeric;
  v_scale int;
  v_base_net numeric;
  v_base_discount numeric;
  v_invoice_id uuid;
  v_foreign_gross numeric;
begin
  -- Phase 1.2: authorize before reading anything. post_supplier_invoice enforces this later, but
  -- the organization lookup and the exchange-rate probe below ran first, so a caller without
  -- access could tell whether another organization exists and holds a rate for a currency.
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فواتير في هذا الموقع' using errcode = '42501';
  end if;

  select o.default_currency into v_base
  from public.organizations o where o.id = p_organization_id;
  if v_base is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) = upper(v_base) then
    return public.post_supplier_invoice(
      p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
      p_invoice_number, p_expense_account_id, p_net_amount, p_discount_amount,
      p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
      p_invoice_date, p_due_date, p_fiscal_period_id
    );
  end if;

  if p_exchange_rate is not null then
    if p_exchange_rate <= 0 then
      raise exception 'EXCHANGE_RATE_INVALID: السعر يجب أن يكون أكبر من صفر'
        using errcode = '22023';
    end if;
    v_rate := p_exchange_rate;
  else
    select g.rate into v_rate
    from public.get_exchange_rate(p_organization_id, p_currency, v_base, p_invoice_date) g;

    if v_rate is null then
      raise exception
        'EXCHANGE_RATE_MISSING: لا يوجد سعر صرف لـ % مقابل % في % أو قبله — سجّل السعر أو مرّر سعر الفاتورة',
        upper(p_currency), upper(v_base), p_invoice_date
        using errcode = 'P0001';
    end if;
  end if;

  v_scale := public.currency_decimals(v_base);
  v_base_net := round(p_net_amount * v_rate, v_scale);
  v_base_discount := round(coalesce(p_discount_amount, 0) * v_rate, v_scale);

  v_invoice_id := public.post_supplier_invoice(
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
    p_invoice_number, p_expense_account_id, v_base_net, v_base_discount,
    p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
    p_invoice_date, p_due_date, p_fiscal_period_id
  );

  v_foreign_gross := round(
    (p_net_amount - coalesce(p_discount_amount, 0))
    * (1 + coalesce(p_vat_rate, 0) / 100), 4);

  update public.supplier_invoices
  set currency = upper(p_currency),
      exchange_rate = v_rate,
      foreign_net_amount = p_net_amount,
      foreign_discount_amount = coalesce(p_discount_amount, 0),
      foreign_amount = v_foreign_gross
  where id = v_invoice_id;

  return v_invoice_id;
end;
$function$;

-- run_due_schedules() is the cron batch entry point (all organizations, no arguments). Nothing in the
-- application calls it; scheduling runs as a privileged role. A signed-in user could invoke it, and
-- generate_recurring_dues would then authorize the caller per organization, aborting the whole batch
-- on the first organization they do not belong to. Withdrawn from clients; service_role keeps it.
REVOKE ALL ON FUNCTION public.run_due_schedules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_schedules() TO service_role;

-- ---------------------------------------------------------------------------
-- replace_role_permissions_atomic signature migration (expand step).
-- 20261009130000 dropped the 3-argument form. During a rolling deploy an application instance that
-- still calls it would get "function not found". Re-creating the old behaviour would re-open a path
-- with no actor check, so the 3-argument signature is restored ONLY as a fail-closed shim: it raises,
-- touches no data, and is executable by service_role alone. Old instances are refused with a clear
-- error until upgraded; the 4-argument function (which re-verifies the acting user) is the only
-- implementation. Drop the shim in a later "contract" migration once no instance calls it.
-- ---------------------------------------------------------------------------
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
BEGIN
  RAISE EXCEPTION 'SIGNATURE_RETIRED: replace_role_permissions_atomic now requires p_actor_user_id; upgrade the application before changing role permissions'
    USING errcode = '0A000';
END;
$$;
ALTER FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) TO service_role;
