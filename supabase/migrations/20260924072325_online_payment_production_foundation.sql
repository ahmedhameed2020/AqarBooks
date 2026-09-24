-- P10.1: immutable provider context, fail-closed production pilot, and durable events.

alter table public.online_payment_transactions
  add column environment text,
  add column currency text,
  add column provider_settings_id uuid,
  add column provider_merchant_identifier_snapshot text,
  add column checkout_requested_at timestamptz,
  add column checkout_created_at timestamptz,
  add column last_provider_status text,
  add column last_status_checked_at timestamptz,
  add column completed_at timestamptz;

update public.online_payment_transactions t
set environment = 'SANDBOX',
    currency = o.default_currency,
    checkout_requested_at = t.created_at,
    checkout_created_at = case when t.provider_reference is not null then t.created_at end
from public.organizations o
where o.id = t.organization_id;

with unique_settings as (
  select min(s.id::text)::uuid as id,
         s.organization_id,
         s.property_id,
         s.provider,
         min(s.merchant_identifier) as merchant_identifier
  from public.payment_provider_settings s
  where s.environment = 'SANDBOX'
    and s.enabled
    and s.status = 'ENABLED'
  group by s.organization_id, s.property_id, s.provider
  having count(*) = 1
)
update public.online_payment_transactions t
set provider_settings_id = s.id,
    provider_merchant_identifier_snapshot = s.merchant_identifier
from unique_settings s
where s.organization_id = t.organization_id
  and s.provider = t.provider
  and (s.property_id is null or s.property_id = t.property_id);

alter table public.online_payment_transactions
  alter column environment set default 'SANDBOX',
  alter column environment set not null,
  alter column currency set not null,
  add constraint online_payment_transactions_environment_check
    check (environment in ('SANDBOX', 'PRODUCTION')),
  add constraint online_payment_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  add constraint online_payment_transactions_provider_settings_id_fkey
    foreign key (provider_settings_id) references public.payment_provider_settings(id);

comment on column public.online_payment_transactions.provider_settings_id is
  'Immutable provider-settings identity selected at checkout; nullable only for unresolved legacy rows.';

create table public.online_payment_production_pilots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled_at timestamptz not null default now(),
  enabled_by uuid references auth.users(id),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.online_payment_production_pilots enable row level security;
revoke all on table public.online_payment_production_pilots from public, anon, authenticated;
grant select, insert, update, delete on table public.online_payment_production_pilots to service_role;

create table public.online_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  transaction_id uuid references public.online_payment_transactions(id),
  provider text not null check (provider in ('FAWRY')),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  event_identifier text not null,
  event_type text not null,
  provider_status text,
  signature_verified boolean not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  processing_status text not null default 'RECEIVED'
    check (processing_status in (
      'RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'QUARANTINED',
      'RETRYABLE_ERROR', 'PERMANENT_ERROR'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, event_identifier)
);

create index online_payment_events_claim_idx
  on public.online_payment_events (next_attempt_at, created_at)
  where processing_status in ('RECEIVED', 'RETRYABLE_ERROR');
create index online_payment_events_transaction_idx
  on public.online_payment_events (transaction_id, created_at desc);

create function public.online_payment_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.organization_id <> old.organization_id
     or new.property_id <> old.property_id
     or new.transaction_id is distinct from old.transaction_id
     or new.provider <> old.provider
     or new.environment <> old.environment
     or new.event_identifier <> old.event_identifier
     or new.event_type <> old.event_type
     or new.provider_status is distinct from old.provider_status
     or new.signature_verified <> old.signature_verified
     or new.redacted_payload <> old.redacted_payload
     or new.payload_hash <> old.payload_hash
     or new.created_at <> old.created_at then
    raise exception 'ONLINE_PAYMENT_EVENT_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger online_payment_events_append_only
before update on public.online_payment_events
for each row execute function public.online_payment_events_append_only();

alter table public.online_payment_events enable row level security;

create policy online_payment_events_select_owner
on public.online_payment_events for select
to authenticated
using (
  public.organization_is_active(organization_id)
  and exists (
    select 1 from public.online_payment_transactions t
    where t.id = transaction_id
      and t.member_id = public.current_member_id()
  )
);

create policy online_payment_events_select_staff
on public.online_payment_events for select
to authenticated
using (
  public.organization_is_active(organization_id)
  and public.has_financial_permission(
    organization_id,
    'finance.online_payments.manage',
    property_id
  )
);

revoke all on table public.online_payment_events from public, anon, authenticated;
grant select on table public.online_payment_events to authenticated;
grant all on table public.online_payment_events to service_role;

create function public.enqueue_online_payment_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_transaction_id uuid,
  p_provider text,
  p_environment text,
  p_event_identifier text,
  p_event_type text,
  p_provider_status text,
  p_signature_verified boolean,
  p_redacted_payload jsonb,
  p_payload_hash text
)
returns public.online_payment_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.online_payment_events;
begin
  if p_provider <> 'FAWRY' or p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'INVALID_PAYMENT_EVENT_SCOPE' using errcode = '22023';
  end if;
  if p_transaction_id is not null and not exists (
    select 1 from public.online_payment_transactions t
    where t.id = p_transaction_id
      and t.organization_id = p_organization_id
      and t.property_id = p_property_id
      and t.provider = p_provider
      and t.environment = p_environment
  ) then
    raise exception 'PAYMENT_EVENT_TRANSACTION_MISMATCH' using errcode = '22023';
  end if;

  insert into public.online_payment_events (
    organization_id, property_id, transaction_id, provider, environment,
    event_identifier, event_type, provider_status, signature_verified,
    redacted_payload, payload_hash
  ) values (
    p_organization_id, p_property_id, p_transaction_id, p_provider, p_environment,
    p_event_identifier, p_event_type, p_provider_status, p_signature_verified,
    coalesce(p_redacted_payload, '{}'::jsonb), p_payload_hash
  )
  on conflict (provider, environment, event_identifier) do nothing
  returning * into v_event;

  if v_event.id is null then
    select * into v_event
    from public.online_payment_events e
    where e.provider = p_provider
      and e.environment = p_environment
      and e.event_identifier = p_event_identifier;
    if v_event.payload_hash <> p_payload_hash then
      raise exception 'PAYMENT_EVENT_REPLAY_MISMATCH' using errcode = '22023';
    end if;
  end if;
  return v_event;
end;
$$;

create function public.claim_online_payment_events(p_limit integer default 25)
returns setof public.online_payment_events
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select e.id
    from public.online_payment_events e
    where e.processing_status in ('RECEIVED', 'RETRYABLE_ERROR')
      and coalesce(e.next_attempt_at, '-infinity'::timestamptz) <= now()
    order by e.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.online_payment_events e
  set processing_status = 'PROCESSING',
      attempt_count = e.attempt_count + 1,
      next_attempt_at = null,
      updated_at = now()
  from candidates c
  where e.id = c.id
  returning e.*;
$$;

create function public.complete_online_payment_event(
  p_event_id uuid,
  p_processing_status text,
  p_last_error_code text default null,
  p_next_attempt_at timestamptz default null
)
returns public.online_payment_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.online_payment_events;
begin
  if p_processing_status not in (
    'PROCESSED', 'IGNORED', 'QUARANTINED', 'RETRYABLE_ERROR', 'PERMANENT_ERROR'
  ) then
    raise exception 'INVALID_PAYMENT_EVENT_COMPLETION' using errcode = '22023';
  end if;
  if p_processing_status = 'RETRYABLE_ERROR' and p_next_attempt_at is null then
    raise exception 'RETRYABLE_EVENT_REQUIRES_NEXT_ATTEMPT' using errcode = '22023';
  end if;

  update public.online_payment_events
  set processing_status = p_processing_status,
      last_error_code = p_last_error_code,
      next_attempt_at = case when p_processing_status = 'RETRYABLE_ERROR' then p_next_attempt_at end,
      processed_at = case when p_processing_status = 'RETRYABLE_ERROR' then null else now() end,
      updated_at = now()
  where id = p_event_id and processing_status = 'PROCESSING'
  returning * into v_event;

  if v_event.id is null then
    raise exception 'PAYMENT_EVENT_NOT_CLAIMED' using errcode = '22023';
  end if;
  return v_event;
end;
$$;

create function public.mark_online_payment_checkout_created(
  p_transaction_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.online_payment_transactions
  set provider_reference = coalesce(p_provider_reference, provider_reference),
      checkout_created_at = now(),
      updated_at = now()
  where id = p_transaction_id
    and status = 'PENDING'
    and checkout_created_at is null;
  if not found then
    raise exception 'CHECKOUT_TRANSACTION_NOT_PENDING_OR_ALREADY_CREATED' using errcode = '22023';
  end if;
end;
$$;

drop function public.create_online_payment_checkout_transaction(uuid[], text);

create function public.create_online_payment_checkout_transaction(
  p_due_ids uuid[],
  p_provider text,
  p_environment text,
  p_provider_settings_id uuid,
  p_client_request_id text
)
returns table(transaction_id uuid, amount numeric, is_replay boolean, provider_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_due record;
  v_settings public.payment_provider_settings;
  v_organization_id uuid;
  v_property_id uuid;
  v_currency text;
  v_total numeric(19,4) := 0;
  v_matched_count integer := 0;
  v_transaction_id uuid;
  v_existing public.online_payment_transactions;
begin
  if v_member_id is null then
    raise exception 'NOT_A_PORTAL_MEMBER' using errcode = '42501';
  end if;
  if p_provider <> 'FAWRY' or p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'INVALID_PROVIDER_ENVIRONMENT' using errcode = '22023';
  end if;
  if p_due_ids is null or array_length(p_due_ids, 1) is null then
    raise exception 'NO_DUES_SELECTED' using errcode = '22023';
  end if;
  if nullif(btrim(p_client_request_id), '') is null then
    raise exception 'CLIENT_REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;

  for v_due in
    select d.* from public.dues d
    where d.id = any(p_due_ids)
      and exists (
        select 1 from public.unit_ownerships uo
        where uo.unit_id = d.unit_id
          and uo.member_id = v_member_id
          and (uo.end_date is null or uo.end_date >= current_date)
      )
    for update
  loop
    if v_due.status in ('VOID', 'PAID') then
      raise exception 'DUE_NOT_PAYABLE' using errcode = '22023';
    end if;
    if v_organization_id is null then
      v_organization_id := v_due.organization_id;
      v_property_id := v_due.property_id;
    elsif v_due.organization_id <> v_organization_id or v_due.property_id <> v_property_id then
      raise exception 'CROSS_PROPERTY_NOT_ALLOWED' using errcode = '22023';
    end if;
    v_total := v_total + v_due.amount;
    v_matched_count := v_matched_count + 1;
  end loop;

  if v_matched_count <> array_length(p_due_ids, 1) then
    raise exception 'SOME_DUES_NOT_FOUND_OR_NOT_OWNED' using errcode = '22023';
  end if;
  if not public.organization_is_active(v_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE' using errcode = '42501';
  end if;

  select * into v_settings
  from public.payment_provider_settings s
  where s.id = p_provider_settings_id
  for share;

  if v_settings.id is null
     or v_settings.organization_id <> v_organization_id
     or (v_settings.property_id is not null and v_settings.property_id <> v_property_id)
     or v_settings.provider <> p_provider
     or v_settings.environment <> p_environment
     or not v_settings.enabled
     or v_settings.status <> 'ENABLED'
     or v_settings.verified_at is null
     or nullif(btrim(v_settings.merchant_identifier), '') is null then
    raise exception 'PAYMENT_PROVIDER_SETTINGS_NOT_READY' using errcode = '22023';
  end if;

  if p_environment = 'PRODUCTION' and not exists (
    select 1 from public.online_payment_production_pilots p
    where p.organization_id = v_organization_id
      and (p.expires_at is null or p.expires_at > now())
  ) then
    raise exception 'PRODUCTION_PILOT_NOT_ALLOWED' using errcode = '42501';
  end if;

  select * into v_existing
  from public.online_payment_transactions t
  where t.organization_id = v_organization_id
    and t.client_request_id = p_client_request_id;

  if v_existing.id is not null then
    if v_existing.member_id <> v_member_id
       or v_existing.provider <> p_provider
       or v_existing.environment <> p_environment
       or v_existing.provider_settings_id is distinct from p_provider_settings_id
       or (select array_agg(a.due_id order by a.due_id)
           from public.online_payment_transaction_allocations a
           where a.transaction_id = v_existing.id)
          is distinct from
          (select array_agg(x.due_id order by x.due_id)
           from unnest(p_due_ids) as x(due_id)) then
      raise exception 'CLIENT_REQUEST_ID_CONFLICT' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.amount, true, v_existing.provider_reference;
    return;
  end if;

  if public.due_ids_have_pending_online_checkout(p_due_ids) then
    raise exception 'DUE_HAS_PENDING_CHECKOUT' using errcode = '22023';
  end if;

  select o.default_currency into v_currency
  from public.organizations o where o.id = v_organization_id;

  insert into public.online_payment_transactions (
    organization_id, property_id, member_id, client_request_id, provider,
    environment, currency, provider_settings_id,
    provider_merchant_identifier_snapshot, amount, checkout_requested_at, expires_at
  ) values (
    v_organization_id, v_property_id, v_member_id, p_client_request_id, p_provider,
    p_environment, v_currency, v_settings.id,
    v_settings.merchant_identifier, v_total, now(), now() + interval '20 minutes'
  ) returning id into v_transaction_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  select v_transaction_id, d.id, d.amount
  from public.dues d where d.id = any(p_due_ids);

  return query select v_transaction_id, v_total, false, null::text;
end;
$$;

revoke all on function public.online_payment_events_append_only() from public, anon, authenticated;
revoke all on function public.enqueue_online_payment_event(uuid, uuid, uuid, text, text, text, text, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_online_payment_events(integer) from public, anon, authenticated;
revoke all on function public.complete_online_payment_event(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_online_payment_checkout_created(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_online_payment_event(uuid, uuid, uuid, text, text, text, text, text, boolean, jsonb, text) to service_role;
grant execute on function public.claim_online_payment_events(integer) to service_role;
grant execute on function public.complete_online_payment_event(uuid, text, text, timestamptz) to service_role;
grant execute on function public.mark_online_payment_checkout_created(uuid, text) to service_role;

revoke all on function public.create_online_payment_checkout_transaction(uuid[], text, text, uuid, text) from public, anon;
grant execute on function public.create_online_payment_checkout_transaction(uuid[], text, text, uuid, text) to authenticated, service_role;
