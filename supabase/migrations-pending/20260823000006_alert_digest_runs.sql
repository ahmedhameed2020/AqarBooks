-- Ledger of nightly alert-digest sends.
--
-- The in-app alerts are pulled: derived at read time, so they cannot duplicate
-- or go stale. Email is pushed, which brings both problems back -- a job that
-- retries, or a schedule that fires twice, would send the same digest again.
--
-- One row per organization per day, with a unique key doing the enforcing
-- rather than application logic. A retry after a partial failure updates the
-- existing row instead of mailing everyone a second time.
--
-- It doubles as the audit trail: who was mailed, how many alerts, and what went
-- wrong when nothing arrived.

create table if not exists public.alert_digest_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_date date not null,
  status text not null check (status in ('SENT', 'SKIPPED', 'FAILED')),
  recipients_count integer not null default 0,
  alerts_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  unique (organization_id, run_date)
);

comment on table public.alert_digest_runs is
  'One row per organization per day. The unique key is what makes the digest idempotent.';
comment on column public.alert_digest_runs.status is
  'SENT: mail dispatched. SKIPPED: nothing to report, or no eligible recipient. FAILED: the send errored.';

alter table public.alert_digest_runs enable row level security;

-- Written only by the scheduled job through the service role, which bypasses
-- RLS. Staff may read their own organization's history to answer "why did no
-- digest arrive this morning".
create policy alert_digest_runs_select on public.alert_digest_runs
  for select
  using (public.is_org_member(auth.uid(), organization_id));
