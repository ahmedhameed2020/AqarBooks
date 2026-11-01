-- EXPORT PREFLIGHT -- metadata only, NO DATA. Run by the owner on the production database in a READ-ONLY session; send the output (not any data) for review.
--   PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=20000" psql "$PROD_READONLY_URL" -X -A -F '|' -f export-preflight.sql -o preflight-output.txt
-- Nothing below reads a row of customer data: only catalog views and size functions. Role passwords are not exposed by pg_roles.

\echo '== P1 server'
select version() as server_version, current_setting('server_version_num') as server_version_num;
\echo '== P2 extensions (name | version | schema): the rehearsal container must create the same ones in the same schemas'
select e.extname, e.extversion, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1;
\echo '== P3 roles (names and flags only)'
select rolname, rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname !~ '^pg_' order by 1;
\echo '== P4 sizes'
select pg_database_size(current_database()) as database_bytes, pg_size_pretty(pg_database_size(current_database())) as database_size;
select n.nspname as schema, pg_size_pretty(sum(pg_total_relation_size(c.oid))) as size, count(*) filter (where c.relkind in ('r','p')) as tables
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','auth','supabase_migrations','storage','vault','realtime') and c.relkind in ('r','p','m') group by 1 order by sum(pg_total_relation_size(c.oid)) desc;
\echo '== P5 the 30 largest public tables (name | total size | estimated rows)'
select c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) as total_size, c.reltuples::bigint as est_rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') order by pg_total_relation_size(c.oid) desc limit 30;
\echo '== P6 migration ledger (version | name only)'
select version, name from supabase_migrations.schema_migrations order by version;
\echo '== P7 settings that affect restore compatibility'
select name, setting from pg_settings where name in ('server_encoding','lc_collate','lc_ctype','wal_level','max_wal_size','shared_preload_libraries','timezone','standard_conforming_strings') order by 1;
\echo '== P8 auth.users shape (column names and nullability only)'
select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'auth' and table_name = 'users' order by ordinal_position;
\echo '== P9 sensitive-looking public columns the export generator will redact or mask (names only)'
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and column_name ~* '(secret|token|hmac|password|passwd|credential|api_key|private_key|otp|passcode|salt|nonce|payload|raw_|_raw$|full_name|phone|email|address|guest_name|plate|ip_address)'
order by 1, 2;
