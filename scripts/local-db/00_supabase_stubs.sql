-- Minimal stand-ins for the parts of a Supabase project that plain PostgreSQL
-- does not have, so the repository's own baseline + migrations can be replayed
-- on a throwaway local cluster (see scripts/local-db/README.md).
--
-- NOT a replica of Supabase: only what the application SQL and its tests touch.
-- Never apply this to a real Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin superuser; end if;
end $$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists auth;
create schema if not exists storage;
grant usage on schema extensions, auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text default 'authenticated',
  role text default 'authenticated',
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists users_email_lower_key on auth.users (lower(email));

create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now()
);
create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  user_id text,
  session_id uuid references auth.sessions (id) on delete cascade,
  token text
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_user)
$$;

-- ---------------------------------------------------------------- storage
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;

-- ---------------------------------------------------------------- vault
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text, description text, secret text, created_at timestamptz default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
$$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id
$$;

-- ---------------------------------------------------------------- realtime
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
