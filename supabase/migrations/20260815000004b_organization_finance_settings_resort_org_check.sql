-- Follow-up to 20260815000004_organization_finance_settings.sql.
--
-- Code review found a real gap: validate_online_payments_clearing_account()
-- validated the *account's* org/resort against the row, but never checked
-- that new.resort_id itself belongs to new.organization_id. Concretely: an
-- admin with finance.accounts.manage on Org A, holding an org-wide
-- (resort_id is null) ASSET account in Org A, could insert
-- organization_finance_settings(organization_id = A, resort_id = <a resort
-- that actually belongs to Org B>, account = A's org-wide account) and every
-- existing check would pass.
--
-- This exact bug class was already found and fixed once in this codebase,
-- for a different table -- see 20260812000032_banks_resort_validation.sql.
-- Same pattern, adapted here.
create or replace function public.validate_online_payments_clearing_account()
returns trigger
language plpgsql
as $$
declare
  v_account public.chart_of_accounts;
begin
  if not exists (
    select 1 from public.resorts where id = new.resort_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select * into v_account
  from public.chart_of_accounts
  where id = new.online_payments_clearing_account_id;

  if v_account.id is null or v_account.organization_id <> new.organization_id then
    raise exception 'CLEARING_ACCOUNT_NOT_IN_ORGANIZATION: الحساب المحدد لا يتبع هذا الكيان' using errcode = '22023';
  end if;
  if v_account.category <> 'ASSET' then
    raise exception 'CLEARING_ACCOUNT_NOT_ASSET: حساب المقاصة يجب أن يكون من نوع أصول' using errcode = '22023';
  end if;
  if v_account.is_group then
    raise exception 'CLEARING_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي كحساب مقاصة' using errcode = '22023';
  end if;
  if not v_account.is_active then
    raise exception 'CLEARING_ACCOUNT_INACTIVE: حساب المقاصة غير نشط' using errcode = '22023';
  end if;
  if v_account.resort_id is not null and v_account.resort_id <> new.resort_id then
    raise exception 'CLEARING_ACCOUNT_RESORT_MISMATCH: حساب المقاصة يتبع موقعًا مختلفًا' using errcode = '22023';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
