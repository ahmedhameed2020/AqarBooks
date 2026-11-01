-- Read-only integrity inventory for a restored copy of the cloud database.
-- No writes: creates only session-scoped temp objects.

\pset pager off

-- 1. Object counts
select 'public_tables' as metric, count(*)::text as value from pg_tables where schemaname='public'
union all select 'public_views', count(*)::text from pg_views where schemaname='public'
union all select 'public_functions', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'public_policies', count(*)::text from pg_policies where schemaname='public'
union all select 'public_triggers', count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all select 'auth_table_rows_objects', count(*)::text from information_schema.tables where table_schema='auth';

-- 2. Constraint inventory
select contype::text as constraint_type, convalidated::text as validated, count(*) as n
from pg_constraint where connamespace='public'::regnamespace
group by 1,2 order by 1,2;

-- 3. Foreign-key orphan audit across public and auth
drop table if exists pg_temp.fk_orphans;
create temp table fk_orphans(schema_name text, child_table text, constraint_name text, orphan_rows bigint);
do $$
declare r record; n bigint;
begin
  for r in
    select n.nspname as sch, c.relname as child, con.conname as cname,
           pg_get_constraintdef(con.oid) as def,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(con.conkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum) as child_cols,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(con.confkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.attnum) as parent_cols,
           quote_ident(pn.nspname)||'.'||quote_ident(pc.relname) as parent
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_class pc on pc.oid=con.confrelid
    join pg_namespace pn on pn.oid=pc.relnamespace
    where con.contype='f' and n.nspname in ('public','auth')
  loop
    execute format(
      'select count(*) from %I.%I ch where (%s) is not null and not exists (select 1 from %s pa where (%s)=(%s))',
      r.sch, r.child, r.child_cols, r.parent,
      'ch.'||replace(r.child_cols, ',', ', ch.'),
      'pa.'||replace(r.parent_cols, ',', ', pa.')
    ) into n;
    if n > 0 then
      insert into pg_temp.fk_orphans values (r.sch, r.child, r.cname, n);
    end if;
  end loop;
end $$;

select 'orphan_fk_violations' as metric, coalesce(sum(orphan_rows),0)::text as value from pg_temp.fk_orphans;
select * from pg_temp.fk_orphans order by orphan_rows desc;

-- 4. Key row counts
select 'organizations' t, count(*) n from public.organizations
union all select 'journal_entries', count(*) from public.journal_entries
union all select 'journal_entry_lines', count(*) from public.journal_entry_lines
union all select 'payments', count(*) from public.payments
union all select 'payment_allocations', count(*) from public.payment_allocations
union all select 'members', count(*) from public.members
union all select 'units', count(*) from public.units
union all select 'chart_of_accounts', count(*) from public.chart_of_accounts
union all select 'auth_users', count(*) from auth.users
union all select 'auth_identities', count(*) from auth.identities
union all select 'auth_sessions', count(*) from auth.sessions
order by 1;

-- 5. Auth wiring: trigger calling the public signup handler
select tgname, pg_get_triggerdef(t.oid) as def
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='auth' and c.relname='users' and not t.tgisinternal;

-- 6. Sequence sanity: sequences still at 1 would break inserts
select schemaname||'.'||sequencename as seq, last_value
from pg_sequences where schemaname='public' and last_value is not null
order by last_value desc limit 8;
