-- Phase 4, Task 1: one clearing (ASSET) account per (organization, resort) for
-- posting online payments before real bank settlement -- see design doc
-- "Finalized decisions" -> Decision 1. Explicit config only, no fallback.

create table public.organization_finance_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  online_payments_clearing_account_id uuid not null references public.chart_of_accounts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resort_id)
);

create trigger trg_organization_finance_settings_updated_at
  before update on public.organization_finance_settings
  for each row execute function public.set_updated_at();

-- Config-time validation: catch a bad account choice at admin-setup time,
-- not silently at the first webhook. record_online_payment (Task 4)
-- re-validates the SAME four conditions again at call time, since an
-- account can be deactivated after this row is configured -- this trigger
-- is a fast-feedback convenience, not the only guard.
create or replace function public.validate_online_payments_clearing_account()
returns trigger
language plpgsql
as $$
declare
  v_account public.chart_of_accounts;
begin
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

create trigger trg_validate_online_payments_clearing_account
  before insert or update on public.organization_finance_settings
  for each row execute function public.validate_online_payments_clearing_account();

alter table public.organization_finance_settings enable row level security;

-- Same permission key already used for chart-of-accounts/banking config
-- across this codebase (20260810000018_accounting_rls.sql,
-- 20260810000033_treasury_banking_rls.sql) -- not a new permission.
create policy organization_finance_settings_manage
  on public.organization_finance_settings
  for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

notify pgrst, 'reload schema';
