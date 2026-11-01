-- Deposit account of a receipt must be a cash box or a bank account of the SAME organization.
--
-- Problem: record_payment / record_advance_payment accepted ANY account of the organization as the deposit account (post time only checks that it
-- is not a group, is active and belongs to the organization). A receipt deposited to the receivables control account (1130) debits the receivable
-- instead of cash. The receipts screen used to offer every non-group ASSET account, and only its ORDER (lib/finance/deposit-accounts.ts) kept the
-- cash account first -- the server accepted a direct request for any account.
--
-- Rule (not a block on one account code): the account must be ASSET, active, not a group, flagged is_cash_equivalent (cash / bank / short-term
-- deposit -- the flag the standard chart sets on 1110 and 1120 and not on 1130), and be the GL account of an ACTIVE cashbox or an ACTIVE bank account
-- of the same organization. One function states it (deposit_account_is_valid); the screen's list (list_deposit_accounts) reads the same relation, so
-- the list and the server cannot disagree.
--
-- The LINK itself is also validated (treasury_gl_account_is_valid + triggers on cashboxes and bank_accounts). Without that, anyone holding
-- finance.accounts.manage could point a cash box at the receivables account (create_cashbox only checked the category; the app inserts into
-- cashboxes / bank_accounts directly under the *_manage RLS policy, whose WITH CHECK looks at the permission only, and the foreign key accepts an
-- account of ANOTHER organization) and thereby make it a valid deposit account. The triggers fire on INSERT and on UPDATE of organization_id /
-- gl_account_id only; rows already linked are not touched, they are judged by deposit_account_is_valid when a receipt is recorded.
-- Who may do what stays as it was: linking needs finance.accounts.manage; recording a receipt needs receivables.payments.create; neither implies
-- the other (tested).
--
-- What does NOT change:
--   * receipts already posted (no data is read or written by this migration: functions only, no backfill, no new column, no new table);
--   * the cashier-session check (DEPOSIT_ACCOUNT_MISMATCH) stays as it is, after this one;
--   * post_payment_internal / post_advance_payment_internal bodies, and therefore the online-payment path, whose clearing account has its own
--     validation trigger (validate_online_payments_clearing_account) and is posted by a trusted caller without a user;
--   * clear_incoming_cheque: it deposits to the cheque's bank account GL account, which passes the rule while that bank account is active;
--   * grants of record_payment / record_advance_payment (CREATE OR REPLACE keeps them).
--
-- Effect on organizations that never linked their cash account to a cashbox: new receipts to that account are REFUSED with DEPOSIT_ACCOUNT_INVALID
-- until the account is linked (create_cashbox / a bank account). Nothing is linked automatically.
--
-- A retry of an already-posted receipt (same idempotency key) is not re-validated: it returns the stored receipt and posts nothing.

-- The account of a cash box / bank account: same organization, ASSET, leaf, active, cash-like.
CREATE OR REPLACE FUNCTION public.treasury_gl_account_is_valid(p_organization_id uuid, p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = p_account_id
      AND a.organization_id = p_organization_id
      AND a.is_active
      AND NOT a.is_group
      AND a.category = 'ASSET'
      AND a.is_cash_equivalent
  );
$$;
REVOKE ALL ON FUNCTION public.treasury_gl_account_is_valid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_gl_account_is_valid(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_treasury_gl_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.treasury_gl_account_is_valid(NEW.organization_id, NEW.gl_account_id) THEN
    RAISE EXCEPTION 'GL_ACCOUNT_NOT_CASH_OR_BANK: حساب الأستاذ يجب أن يكون حساب نقدية أو بنك فعّالًا (أصول، غير مجمّع، نقدية/ما في حكمها) داخل نفس الكيان'
      USING errcode = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_treasury_gl_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cashboxes_validate_gl_account ON public.cashboxes;
CREATE TRIGGER trg_cashboxes_validate_gl_account
  BEFORE INSERT OR UPDATE OF organization_id, gl_account_id ON public.cashboxes
  FOR EACH ROW EXECUTE FUNCTION public.validate_treasury_gl_account();
DROP TRIGGER IF EXISTS trg_bank_accounts_validate_gl_account ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_validate_gl_account
  BEFORE INSERT OR UPDATE OF organization_id, gl_account_id ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_treasury_gl_account();

CREATE OR REPLACE FUNCTION public.deposit_account_is_valid(p_organization_id uuid, p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.treasury_gl_account_is_valid(p_organization_id, p_account_id)
    AND (
      EXISTS (SELECT 1 FROM public.cashboxes c
              WHERE c.organization_id = p_organization_id AND c.gl_account_id = p_account_id AND c.is_active)
      OR EXISTS (SELECT 1 FROM public.bank_accounts b
              WHERE b.organization_id = p_organization_id AND b.gl_account_id = p_account_id AND b.is_active)
    );
$$;
REVOKE ALL ON FUNCTION public.deposit_account_is_valid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_account_is_valid(uuid, uuid) TO service_role;

-- The list the receipts screen offers: exactly the accounts deposit_account_is_valid accepts, only for a caller who may record receipts
-- (an empty list, not an error, for anyone else: the page stays readable).
CREATE OR REPLACE FUNCTION public.list_deposit_accounts(p_organization_id uuid, p_resort_id uuid DEFAULT NULL)
RETURNS TABLE(account_id uuid, code text, name_ar text, name_en text, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH src AS (
    SELECT c.gl_account_id AS account_id, 'CASHBOX'::text AS source
    FROM public.cashboxes c WHERE c.organization_id = p_organization_id AND c.is_active
    UNION ALL
    SELECT b.gl_account_id, 'BANK'::text
    FROM public.bank_accounts b WHERE b.organization_id = p_organization_id AND b.is_active
  )
  SELECT a.id, a.code, a.name_ar, a.name_en, max(s.source)
  FROM src s
  JOIN public.chart_of_accounts a ON a.id = s.account_id AND a.organization_id = p_organization_id
  WHERE a.is_active AND NOT a.is_group AND a.category = 'ASSET' AND a.is_cash_equivalent
    AND auth.uid() IS NOT NULL
    AND public.has_financial_permission(p_organization_id, 'receivables.payments.create', p_resort_id)
  GROUP BY a.id, a.code, a.name_ar, a.name_en
  ORDER BY a.code, a.id;
$$;
REVOKE ALL ON FUNCTION public.list_deposit_accounts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_deposit_accounts(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_payment(
  p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text, p_payment_date date,
  p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_result record;
begin
  if not public.has_financial_permission(
       p_organization_id, 'receivables.payments.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات'
      using errcode = '42501';
  end if;

  if not public.deposit_account_is_valid(p_organization_id, p_deposit_account_id)
     and not (p_idempotency_key is not null and exists (
       select 1 from public.payments where organization_id = p_organization_id and idempotency_key = p_idempotency_key)) then
    raise exception 'DEPOSIT_ACCOUNT_INVALID: حساب الإيداع يجب أن يكون مرتبطًا بخزينة أو بحساب بنكي فعّال في هذا الكيان'
      using errcode = '22023';
  end if;

  select * into v_result from public.post_payment_internal(
    p_organization_id => p_organization_id,
    p_resort_id => p_resort_id,
    p_member_id => p_member_id,
    p_unit_id => p_unit_id,
    p_amount => p_amount,
    p_method => p_method,
    p_payment_date => p_payment_date,
    p_deposit_account_id => p_deposit_account_id,
    p_fiscal_period_id => p_fiscal_period_id,
    p_allocations => p_allocations,
    p_idempotency_key => p_idempotency_key,
    p_cashier_session_id => p_cashier_session_id,
    p_actor_id => auth.uid()
  );

  return v_result.payment_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.record_advance_payment(
  p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text,
  p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb,
  p_idempotency_key text, p_cashier_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_financial_permission(p_organization_id, 'receivables.payments.create', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات' USING errcode = '42501';
  END IF;
  IF NOT public.deposit_account_is_valid(p_organization_id, p_deposit_account_id)
     AND NOT (p_idempotency_key IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.payments WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key)) THEN
    RAISE EXCEPTION 'DEPOSIT_ACCOUNT_INVALID: حساب الإيداع يجب أن يكون مرتبطًا بخزينة أو بحساب بنكي فعّال في هذا الكيان' USING errcode = '22023';
  END IF;
  RETURN public.post_advance_payment_internal(p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
    p_deposit_account_id, p_fiscal_period_id, p_allocations, p_idempotency_key, p_cashier_session_id, auth.uid());
END;
$$;

-- Audit of the one flag the deposit rule leans on. The chart's own audit trigger (log_coa_change) does not track is_cash_equivalent, so an accounts
-- manager could reclassify an ordinary account as cash-like (and then link it) without a trace. This trigger writes ONE platform_audit_logs row per
-- ACTUAL change of the flag (WHEN old <> new: a no-op update, or an update of any other column, writes nothing). It adds no permission: the
-- function is SECURITY DEFINER and executable by nobody but the trigger machinery; who may update the flag is still decided by the *_manage policy
-- (finance.accounts.manage), unchanged.
CREATE OR REPLACE FUNCTION public.log_coa_cash_equivalent_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (
    auth.uid(), NEW.organization_id, 'coa.cash_equivalent_changed', 'chart_of_account', NEW.id,
    jsonb_build_object(
      'code', NEW.code,
      'from', OLD.is_cash_equivalent,
      'to', NEW.is_cash_equivalent,
      'linked_to_active_cashbox_or_bank',
        EXISTS (SELECT 1 FROM public.cashboxes c WHERE c.organization_id = NEW.organization_id AND c.gl_account_id = NEW.id AND c.is_active)
        OR EXISTS (SELECT 1 FROM public.bank_accounts b WHERE b.organization_id = NEW.organization_id AND b.gl_account_id = NEW.id AND b.is_active)
    )
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_coa_cash_equivalent_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_coa_cash_equivalent_audit ON public.chart_of_accounts;
CREATE TRIGGER trg_coa_cash_equivalent_audit
  AFTER UPDATE OF is_cash_equivalent ON public.chart_of_accounts
  FOR EACH ROW WHEN (OLD.is_cash_equivalent IS DISTINCT FROM NEW.is_cash_equivalent)
  EXECUTE FUNCTION public.log_coa_cash_equivalent_change();
