-- JSON INVENTORY ROLE (prepared, NOT RUN ON PRODUCTION; needs G0 and the owner's decision on row security first).
-- Creates a role that can read the JSON columns and nothing else: not an owner, not a superuser, no CREATEDB/CREATEROLE/INHERIT,
-- no write privilege, no CREATE on schema public, no membership in any role, and NO BYPASSRLS (per the G0 condition).
-- Consequence (tested on TEST data): on any JSON table that has row security enabled, json-key-inventory.sql stops with RLS-GUARD,
-- so this role cannot produce a complete inventory on such tables. The owner must choose one of:
--   (a) a SELECT-only role WITH bypassrls (grant it explicitly: alter role aqar_json_inventory bypassrls;) -- contradicts the no-BYPASSRLS condition; approval needed;
--   (b) keep this role and accept that the inventory stops on RLS tables (no inventory from production);
--   (c) another approach decided by the owner.
-- The password is NOT in this file. Set it by hand: \password aqar_json_inventory   (never in a file, never in a chat).
-- Run as a superuser/admin, once, on the target database only, after G0 is approved. Idempotent.
\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'aqar_json_inventory') then
    create role aqar_json_inventory login;
  end if;
end $$;
alter role aqar_json_inventory login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;
alter role aqar_json_inventory set default_transaction_read_only = on;
alter role aqar_json_inventory set statement_timeout = '600000';
alter role aqar_json_inventory set search_path = pg_catalog, public;

do $$
declare r record;
begin
  execute format('grant connect on database %I to aqar_json_inventory', current_database());
  grant usage on schema public to aqar_json_inventory;
  for r in
    select distinct c.oid::regclass::text as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid and t.typname in ('json', 'jsonb')
    where c.relkind in ('r', 'p')
  loop
    execute format('grant select on table %s to aqar_json_inventory', r.tbl);
  end loop;
end $$;

-- verification: the run fails if any requirement is not met
do $$
declare r record; bad text := ''; rid oid := (select oid from pg_roles where rolname = 'aqar_json_inventory');
begin
  if (select rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication from pg_roles where oid = rid) then bad := bad || ' attribute;'; end if;
  if (select rolbypassrls from pg_roles where oid = rid) then bad := bad || ' bypassrls;'; end if;
  if exists (select 1 from pg_auth_members where member = rid) then bad := bad || ' membership;'; end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relowner = rid) then bad := bad || ' owns-objects;'; end if;
  if has_schema_privilege(rid, 'public', 'CREATE') then bad := bad || ' create-on-public;'; end if;
  for r in
    select distinct c.oid::regclass::text as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid and t.typname in ('json', 'jsonb')
    where c.relkind in ('r', 'p')
  loop
    if not has_table_privilege(rid, r.tbl, 'SELECT') then bad := bad || ' no-select:' || r.tbl || ';'; end if;
    if has_table_privilege(rid, r.tbl, 'INSERT,UPDATE,DELETE,TRUNCATE') then bad := bad || ' write:' || r.tbl || ';'; end if;
  end loop;
  if bad <> '' then raise exception 'json-inventory-role verification failed:%', bad; end if;
  raise notice 'json-inventory-role verification passed';
end $$;
