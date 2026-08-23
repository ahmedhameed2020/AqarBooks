-- Operational alerts: dismissals and per-organization thresholds.
--
-- WHY THERE IS NO notifications TABLE HERE
-- The alerts this product needs are all statements about data that already
-- exists: cheques falling due, leases about to expire, dues past their date.
-- Storing them would mean a scheduler, de-duplication, and a staleness problem
-- -- a stored "lease expiring" row keeps shouting for weeks after the lease was
-- renewed, because nothing links the row back to the fact that produced it.
--
-- Deriving them at read time has none of those failure modes: the alert exists
-- exactly as long as the condition does, and disappears by itself the moment a
-- cheque is deposited or a due is paid. It also cannot drift from the ledger,
-- because it IS the ledger.
--
-- What genuinely needs storing is only what the derivation cannot know:
--   1. that a specific person chose to silence a specific fact
--   2. the thresholds each organization considers "soon"
--
-- This replaces a screen whose contents were literals in the source: three
-- invented alerts naming banks with no column to hold them, a tenant who does
-- not exist, and a VAT period derived from nothing -- identical for every
-- tenant, unremovable because there was nothing to remove.

begin;

-- 1. Dismissals ------------------------------------------------------------
-- alert_key encodes the FACT, not the alert type: it carries the row id and
-- the value that made it fire (e.g. 'lease_expiring:<uuid>:2026-09-15'). So
-- silencing is scoped to that exact situation -- if the lease is extended, the
-- key changes and the alert legitimately returns instead of staying buried.
create table if not exists public.alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  dismissed_at timestamptz not null default now(),
  unique (user_id, alert_key)
);

comment on table public.alert_dismissals is
  'Per-user silencing of a derived alert. The key encodes the underlying fact, so a changed fact re-raises the alert.';

create index if not exists idx_alert_dismissals_lookup
  on public.alert_dismissals (user_id, organization_id);

alter table public.alert_dismissals enable row level security;

-- Dismissals are personal: one person silencing an alert must not silence it
-- for their colleagues, so this is scoped to the row's own user rather than to
-- a permission.
create policy alert_dismissals_own on public.alert_dismissals
  for all
  using (user_id = auth.uid() and public.is_org_member(auth.uid(), organization_id))
  with check (user_id = auth.uid() and public.is_org_member(auth.uid(), organization_id));

-- 2. Thresholds ------------------------------------------------------------
-- One row per organization. Absent row means "use the defaults", which is why
-- every column carries one.
create table if not exists public.alert_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cheque_lead_days integer not null default 7,
  lease_lead_days integer not null default 30,
  overdue_min_days integer not null default 1,
  cheques_enabled boolean not null default true,
  leases_enabled boolean not null default true,
  overdue_enabled boolean not null default true,
  unreachable_owners_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint alert_settings_lead_days_sane check (
    cheque_lead_days between 1 and 180
    and lease_lead_days between 1 and 365
    and overdue_min_days between 0 and 365
  )
);

comment on table public.alert_settings is
  'Per-organization thresholds for derived operational alerts. A missing row means defaults.';

alter table public.alert_settings enable row level security;

-- Everyone in the org sees the thresholds their alerts are computed from;
-- changing them is an administrative act.
create policy alert_settings_select on public.alert_settings
  for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy alert_settings_manage on public.alert_settings
  for all
  using (
    public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage')
    and public.organization_is_active(organization_id)
  );

commit;
