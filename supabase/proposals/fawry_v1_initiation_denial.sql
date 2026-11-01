-- REVIEW PROPOSAL ONLY: outside migrations; never run by a migration runner.
-- No deployment authorization. Validate deployed signatures/writers/pending
-- obligations and approve exact web impact before applying to any real DB.
-- V1 denies ALL Fawry initiation, including sandbox, without a runtime toggle.
-- Existing transaction reads, record_payment, signed settlement and cron stay.
begin;

-- Abort rather than leave a historical/dynamic overload unprotected.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_online_payment_checkout_transaction'
      and pg_catalog.oidvectortypes(p.proargtypes) <> 'uuid[], text, text, uuid, text'
  ) then
    raise exception 'UNREVIEWED_CHECKOUT_OVERLOAD' using errcode = '42501';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'mark_online_payment_checkout_created'
      and pg_catalog.oidvectortypes(p.proargtypes) <> 'uuid, text'
  ) then
    raise exception 'UNREVIEWED_FINALIZATION_OVERLOAD' using errcode = '42501';
  end if;
end;
$$;

-- Preserve the public API signature and grants. No replay/reference return,
-- settings lookup, insert, allocation write or provider call can occur.
create or replace function public.create_online_payment_checkout_transaction(
  p_due_ids uuid[], p_provider text, p_environment text,
  p_provider_settings_id uuid, p_client_request_id text
)
returns table(transaction_id uuid, amount numeric, is_replay boolean, provider_reference text)
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'FAWRY_INITIATION_DISABLED' using errcode = '42501';
end;
$$;
revoke all on function public.create_online_payment_checkout_transaction(uuid[], text, text, uuid, text) from public, anon;
grant execute on function public.create_online_payment_checkout_transaction(uuid[], text, text, uuid, text) to authenticated, service_role;

create or replace function public.mark_online_payment_checkout_created(
  p_transaction_id uuid, p_provider_reference text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.online_payment_transactions t
             where t.id = p_transaction_id and t.provider = 'FAWRY') then
    raise exception 'FAWRY_INITIATION_DISABLED' using errcode = '42501';
  end if;
  -- Preserve the pre-existing behavior for other providers; the table trigger
  -- independently rejects a concurrent provider switch or Fawry direct write.
  update public.online_payment_transactions
  set provider_reference = coalesce(p_provider_reference, provider_reference),
      checkout_created_at = now(), updated_at = now()
  where id = p_transaction_id and status = 'PENDING' and checkout_created_at is null;
  if not found then
    raise exception 'CHECKOUT_TRANSACTION_NOT_PENDING_OR_ALREADY_CREATED' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.mark_online_payment_checkout_created(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_online_payment_checkout_created(uuid, text) to service_role;

-- RLS cannot constrain service_role. An ALWAYS trigger protects normal DML
-- even with bypassrls or replication-role mode; it does not constrain an
-- owner/superuser able to disable/drop triggers, replace functions or DDL.
create or replace function public.deny_fawry_v1_initiation_writes()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.provider = 'FAWRY' then
      raise exception 'FAWRY_INITIATION_DISABLED' using errcode = '42501';
    end if;
  elsif old.provider = 'FAWRY' or new.provider = 'FAWRY' then
    -- Permit the first settlement, but never reset a terminal transaction or
    -- erase/replace its established financial linkage (also in replica mode).
    if (old.status is distinct from 'PENDING' and new.status is distinct from old.status)
       or (old.payment_id is not null and new.payment_id is distinct from old.payment_id)
       or (old.paid_at is not null and new.paid_at is distinct from old.paid_at) then
      raise exception 'FAWRY_INITIATION_DISABLED' using errcode = '42501';
    end if;
    -- Allow ordinary settlement/payload updates on existing rows without
    -- altering the original reference or initiation identity.
    if new.provider is distinct from old.provider
       or new.id is distinct from old.id
       or new.environment is distinct from old.environment
       or new.organization_id is distinct from old.organization_id
       or new.property_id is distinct from old.property_id
       or new.member_id is distinct from old.member_id
       or new.client_request_id is distinct from old.client_request_id
       or new.provider_settings_id is distinct from old.provider_settings_id
       or new.provider_merchant_identifier_snapshot is distinct from old.provider_merchant_identifier_snapshot
       or new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.provider_reference is distinct from old.provider_reference
       or new.checkout_requested_at is distinct from old.checkout_requested_at
       or new.checkout_created_at is distinct from old.checkout_created_at then
      raise exception 'FAWRY_INITIATION_DISABLED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.deny_fawry_v1_initiation_writes() from public, anon, authenticated, service_role;
create trigger trg_deny_fawry_v1_initiation_writes
before insert or update on public.online_payment_transactions
for each row execute function public.deny_fawry_v1_initiation_writes();
alter table public.online_payment_transactions enable always trigger trg_deny_fawry_v1_initiation_writes;

commit;
