create table if not exists legacy_migration.raw_sectors (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  sect text,
  sec_title text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_members (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  acc_nm text,
  title text,
  full_name text,
  sector text,
  membership_no text,
  legacy_field5 text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_coa1 (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  code_l1 text,
  name_l1 text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_coa2 (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  posting_flag text,
  code_l1 text,
  code_l2 text,
  name_l2 text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_coa3 (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  posting_flag text,
  code_l2 text,
  code_l3 text,
  name_l3 text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_coa4 (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  posting_flag text,
  code_l3 text,
  code_l4 text,
  name_l4 text,
  sector text,
  unit_code text,
  membership_no text,
  title text,
  full_name text,
  address text,
  manager text,
  phone text,
  mobile text,
  note text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_entry_headers (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  nm text,
  entry_date text,
  gl_no text,
  entry_type text,
  from_to text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_entry_headers_alt (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  entry_date text,
  gl_no text,
  entry_type text,
  from_to text,
  description text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_journal_lines (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  entry_date text,
  due_date text,
  debit text,
  credit text,
  account_no text,
  paid text,
  advance_cheque text,
  due_amount text,
  gl_no text,
  entry_type text,
  amount_type text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_amount_types (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  db_cat text,
  mst_cat text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

create table if not exists legacy_migration.raw_entry_types (
  id bigserial primary key,
  batch_id uuid not null references legacy_migration.batches(id) on delete cascade,
  source_row_no bigint,
  code text,
  label text,
  source_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'RAW',
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_no)
);

revoke all on all tables in schema legacy_migration from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema legacy_migration to service_role;
grant usage, select on all sequences in schema legacy_migration to service_role;

create index if not exists idx_raw_coa4_batch_code on legacy_migration.raw_coa4(batch_id, code_l4);
create index if not exists idx_raw_coa4_batch_member on legacy_migration.raw_coa4(batch_id, membership_no);
create index if not exists idx_raw_coa4_batch_unit on legacy_migration.raw_coa4(batch_id, sector, unit_code);
create index if not exists idx_raw_members_batch_member on legacy_migration.raw_members(batch_id, membership_no);
create index if not exists idx_raw_journal_lines_batch_gl on legacy_migration.raw_journal_lines(batch_id, gl_no);
create index if not exists idx_raw_journal_lines_batch_account on legacy_migration.raw_journal_lines(batch_id, account_no);
;
