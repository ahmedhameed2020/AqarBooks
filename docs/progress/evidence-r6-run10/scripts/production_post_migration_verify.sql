-- Post-migration verification for production (read-only except temp objects).
\pset pager off

select 'applied_migrations' as metric, count(*)::text as value from supabase_migrations.schema_migrations
union all select 'tables', count(*)::text from pg_tables where schemaname='public'
union all select 'functions', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies', count(*)::text from pg_policies where schemaname='public'
union all select 'constraints', count(*)::text from pg_constraint where connamespace='public'::regnamespace
union all select 'rls_tables', count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity
union all select 'unvalidated_fk', count(*)::text from pg_constraint where connamespace='public'::regnamespace and contype='f' and not convalidated
union all select 'organizations', count(*)::text from public.organizations
union all select 'journal_entries', count(*)::text from public.journal_entries
union all select 'journal_entry_lines', count(*)::text from public.journal_entry_lines
union all select 'payments', count(*)::text from public.payments
union all select 'payment_allocations', count(*)::text from public.payment_allocations
union all select 'members', count(*)::text from public.members
union all select 'units', count(*)::text from public.units
union all select 'chart_of_accounts', count(*)::text from public.chart_of_accounts
union all select 'auth_users', count(*)::text from auth.users
union all select 'auth_identities', count(*)::text from auth.identities
union all select 'auth_sessions', count(*)::text from auth.sessions
union all select 'signup_trigger', count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and t.tgname='trg_on_auth_user_created';

select 'table' as kind, table_name as name from information_schema.tables
where table_schema='public' and table_name in ('fiscal_year_closings','payment_credit_requests')
union all
select 'function', p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('close_fiscal_year','apply_payment_credit','assert_open_fiscal_period_for_date','reverse_journal_entry','record_online_payment','issue_dues','generate_recurring_dues','generate_lease_rent_dues')
order by 1,2;

select 'policy_on_closings' as metric, count(*)::text as value from pg_policies where schemaname='public' and tablename='fiscal_year_closings';

-- FK orphan audit (temp objects only)
drop table if exists pg_temp.fk_orphans;
create temp table fk_orphans(schema_name text, child_table text, constraint_name text, orphan_rows bigint);
do $$
declare r record; n bigint;
begin
  for r in
    select n.nspname as sch, c.relname as child, con.conname as cname,
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
    execute format('select count(*) from %I.%I ch where (%s) is not null and not exists (select 1 from %s pa where (%s)=(%s))',
      r.sch, r.child, r.child_cols, r.parent,
      'ch.'||replace(r.child_cols, ',', ', ch.'),
      'pa.'||replace(r.parent_cols, ',', ', pa.')) into n;
    if n > 0 then insert into pg_temp.fk_orphans values (r.sch, r.child, r.cname, n); end if;
  end loop;
end $$;

select 'orphan_fk_violations' as metric, coalesce(sum(orphan_rows),0)::text as value from pg_temp.fk_orphans;
select * from pg_temp.fk_orphans order by orphan_rows desc;
