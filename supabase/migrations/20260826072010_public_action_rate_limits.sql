-- Durable, shared rate limiting for public server actions.
--
-- WHY A TABLE AND NOT AN IN-MEMORY COUNTER
-- lib/actions/demo.ts::enterDemoAction previously called auth.signInWithPassword
-- on every submission with no limit at all. A process-local Map/counter would
-- have been the wrong fix even if one had existed: this app runs on Cloudflare
-- Workers, where each isolate has its own memory and cold starts discard it, so
-- an in-memory counter neither survives nor coordinates across the edge. This
-- table is read and written through the SAME already-live Postgres database
-- every isolate already talks to, which makes it durable and globally shared by
-- construction -- exactly the property lib/actions/leads.ts already relies on
-- for its own "one submission per email per hour" guard (see that file's
-- comment). This migration generalises that proven pattern into a reusable
-- primitive instead of inventing a second, demo-specific mechanism.
--
-- WHY NOT A CLOUDFLARE KV / DURABLE OBJECT BINDING
-- wrangler.jsonc declares no KV namespace, Durable Object, or D1 binding, and
-- no file in this codebase calls getCloudflareContext() to reach one at
-- runtime -- introducing that plumbing here would be a first-of-its-kind
-- addition, unproven anywhere else in the app, for a problem the existing
-- Postgres-backed pattern already solves. It would also be unverifiable from a
-- sandboxed CI/build environment with no route to the deployed edge, whereas
-- this table can be (and was) exercised directly against the real database.
--
-- WHY GENERIC (action, client_key) AND NOT DEMO-SPECIFIC COLUMNS
-- The only caller today is demo entry, but nothing about the mechanism is
-- demo-specific -- the same table and function can gate any other public,
-- unauthenticated action later without another migration.

create table if not exists public.public_action_rate_limits (
  id bigint generated always as identity primary key,
  action text not null,
  client_key text not null,
  created_at timestamptz not null default now()
);

comment on table public.public_action_rate_limits is
  'Durable rate-limit ledger for public (unauthenticated) server actions. '
  'Rows are attempts, not counters: a window is enforced by counting recent '
  'rows for (action, client_key). Written only via check_and_record_rate_limit, '
  'never directly by application code.';

-- The only access pattern is "count recent rows for this (action, client_key)",
-- so the index matches that exactly. created_at trails so the range scan for
-- the window stays index-only per key.
create index if not exists public_action_rate_limits_lookup_idx
  on public.public_action_rate_limits (action, client_key, created_at desc);

alter table public.public_action_rate_limits enable row level security;

-- No policy for anon/authenticated on any command: with RLS enabled and no
-- matching policy, PostgREST denies by default. The table is written and read
-- exclusively through the SECURITY DEFINER function below, which runs as the
-- function owner and therefore bypasses RLS on its own terms -- the same
-- posture demo_leads and contact_requests already use.

-- Atomic check-and-record: returns true (and records the attempt) when the
-- caller is still under the limit, false (recording nothing) when not.
--
-- The advisory lock serialises concurrent calls for the SAME (action,
-- client_key) only -- unrelated keys never contend -- so two requests from the
-- same visitor arriving in the same millisecond cannot both read the count
-- before either writes, which would otherwise let a race admit one extra
-- request past the threshold. This mirrors the lock pattern already used by
-- create_organization_onboarding and run_lease_rent_generation.
--
-- Stale rows for this client_key are deleted before counting, scoped to the
-- index above, so the table self-trims instead of needing a separate cron
-- sweep -- proportional to one visitor's own attempt history, not a table scan.
create or replace function public.check_and_record_rate_limit(
  p_action text,
  p_client_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count int;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_PARAMS' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('rate_limit_' || p_action || ':' || p_client_key));

  delete from public.public_action_rate_limits
  where action = p_action
    and client_key = p_client_key
    and created_at < v_window_start;

  select count(*) into v_count
  from public.public_action_rate_limits
  where action = p_action
    and client_key = p_client_key
    and created_at >= v_window_start;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.public_action_rate_limits (action, client_key)
  values (p_action, p_client_key);

  return true;
end;
$$;

comment on function public.check_and_record_rate_limit is
  'Atomic durable rate-limit check. Call only via the service-role client from '
  'trusted server code -- never expose to anon/authenticated. Returns true and '
  'records the attempt when still under p_limit within the trailing '
  'p_window_seconds for (p_action, p_client_key); returns false and records '
  'nothing when the limit is already met.';

revoke all on function public.check_and_record_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, text, int, int) to service_role;

revoke all on public.public_action_rate_limits from public, anon, authenticated;
grant all on public.public_action_rate_limits to service_role;
