create schema if not exists legacy_migration;

revoke all on schema legacy_migration from public, anon, authenticated;

create table if not exists legacy_migration.batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  source_system text not null,
  source_data_file text,
  source_ui_file text,
  batch_key text not null unique,
  status text not null default 'DISCOVERY' check (status in ('DISCOVERY','STAGED','VALIDATED','DRY_RUN','READY','COMMITTED','RECONCILED','FAILED','ROLLED_BACK')),
  cutoff_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_record_count bigint,
  staged_record_count bigint default 0,
  loaded_record_count bigint default 0,
  rejected_record_count bigint default 0,
  warning_count bigint default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists legacy_migration_batches_scope_idx
  on legacy_migration.batches (organization_id, property_id, status);

create table if not exists legacy_migration.entity_map (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_table text not null,
  legacy_key text not null,
  legacy_parent_key text,
  target_entity text not null,
  target_id uuid,
  mapping_status text not null default 'PENDING' check (mapping_status in ('PENDING','AUTO_MAPPED','REVIEW_REQUIRED','APPROVED','LOADED','REJECTED')),
  confidence numeric(5,4),
  source_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, source_table, legacy_key, target_entity)
);

create index if not exists legacy_migration_entity_map_lookup_idx
  on legacy_migration.entity_map (batch_id, source_table, legacy_key);
create index if not exists legacy_migration_entity_map_target_idx
  on legacy_migration.entity_map (target_entity, target_id);

create table if not exists legacy_migration.exceptions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_table text not null,
  legacy_key text,
  exception_code text not null,
  severity text not null check (severity in ('INFO','WARNING','ERROR','BLOCKER')),
  message text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'OPEN' check (resolution_status in ('OPEN','RESOLVED','ACCEPTED','REJECTED')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists legacy_migration_exceptions_queue_idx
  on legacy_migration.exceptions (batch_id, severity, resolution_status);

create table if not exists legacy_migration.reconciliation_metrics (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_scope text not null,
  metric_key text not null,
  source_value numeric,
  target_value numeric,
  difference numeric generated always as (coalesce(target_value,0) - coalesce(source_value,0)) stored,
  tolerance numeric not null default 0,
  passed boolean generated always as (abs(coalesce(target_value,0) - coalesce(source_value,0)) <= tolerance) stored,
  metadata jsonb not null default '{}'::jsonb,
  measured_at timestamptz not null default now(),
  unique (batch_id, metric_scope, metric_key)
);

revoke all on all tables in schema legacy_migration from public, anon, authenticated;

grant usage on schema legacy_migration to service_role;
grant select, insert, update, delete on all tables in schema legacy_migration to service_role;
;
