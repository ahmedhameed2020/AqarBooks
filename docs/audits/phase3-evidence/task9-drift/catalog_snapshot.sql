-- Independent, read-only snapshot of schema `public` straight from the PostgreSQL catalogs (no migra, no pg_dump).
-- Run identically on the live stack database and on the CLI's shadow database, then `diff` the two outputs.
-- search_path is pinned to pg_catalog so that every pg_get_*def() renders fully schema-qualified on BOTH sides (no rendering difference can come from
-- the session), and no OIDs are printed (they differ between databases). One line per fact: category|identity|facts.
set search_path = pg_catalog;
set default_transaction_read_only = on;
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
select regexp_replace(l, '\s+', ' ', 'g') from (
  -- relations: kind, owner, RLS flags, options (security_invoker / security_barrier), persistence, ACL
  select 1 s, 'rel|' || c.relname || '|' || c.relkind::text || '|' || pg_get_userbyid(c.relowner) || '|rls=' || c.relrowsecurity || '|force=' || c.relforcerowsecurity
         || '|opts=' || coalesce(c.reloptions::text, '') || '|persist=' || c.relpersistence::text || '|part=' || c.relispartition || '|acl=' || coalesce(c.relacl::text, '') as l
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind::text in ('r','p','v','m','S','f')
  union all
  -- columns: type, nullability, default, identity, generated, collation, column ACL
  select 2, 'col|' || c.relname || '|' || lpad(a.attnum::text, 4, '0') || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|notnull=' || a.attnotnull
         || '|default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || '|identity=' || a.attidentity::text || '|generated=' || a.attgenerated::text
         || '|coll=' || coalesce((select collname from pg_collation where oid = a.attcollation and a.attcollation <> 100), '') || '|acl=' || coalesce(a.attacl::text, '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relnamespace = 'public'::regnamespace and c.relkind::text in ('r','p','v','m','f') and a.attnum > 0 and not a.attisdropped
  union all
  -- constraints
  select 3, 'con|' || c.relname || '|' || k.conname || '|' || k.contype::text || '|' || pg_get_constraintdef(k.oid, true) || '|validated=' || k.convalidated
         || '|deferrable=' || k.condeferrable || '|deferred=' || k.condeferred
    from pg_constraint k join pg_class c on c.oid = k.conrelid where k.connamespace = 'public'::regnamespace
  union all
  -- indexes
  select 4, 'idx|' || c.relname || '|' || ic.relname || '|' || pg_get_indexdef(i.indexrelid) || '|valid=' || i.indisvalid || '|unique=' || i.indisunique
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid where c.relnamespace = 'public'::regnamespace
  union all
  -- view / materialized view bodies
  select 5, 'viewdef|' || c.relname || '|' || regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind::text in ('v','m')
  union all
  -- RLS policies: command, permissive, roles, USING and WITH CHECK expressions
  select 6, 'policy|' || c.relname || '|' || p.polname || '|cmd=' || p.polcmd::text || '|permissive=' || p.polpermissive
         || '|roles=' || coalesce((select string_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end, ',' order by case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles) r), '')
         || '|using=' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|check=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace
  union all
  -- triggers (non-internal): full definition and enabled state
  select 7, 'trg|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid, true) || '|enabled=' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  -- functions: whole definition (body, SECURITY DEFINER/INVOKER, SET config), volatility, leakproof, parallel, owner, ACL
  select 8, 'fn|' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|kind=' || p.prokind::text || '|secdef=' || p.prosecdef || '|vol=' || p.provolatile::text
         || '|leakproof=' || p.proleakproof || '|parallel=' || p.proparallel::text || '|strict=' || p.proisstrict || '|owner=' || pg_get_userbyid(p.proowner)
         || '|config=' || coalesce(p.proconfig::text, '') || '|acl=' || coalesce(p.proacl::text, '') || '|def=' ||
         case when p.prokind::text in ('f','p') then regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g') else '' end
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind::text <> 'a'
  union all
  -- enums and composite / domain types
  select 9, 'type|' || t.typname || '|' || t.typtype::text || '|' || coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
         || coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) from pg_attribute a where a.attrelid = t.typrelid and t.typtype::text = 'c' and t.typrelid <> 0 and a.attnum > 0 and not a.attisdropped and (select relkind from pg_class where oid = t.typrelid) = 'c'), '')
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype::text in ('e','c','d') and (t.typtype::text <> 'c' or (select relkind from pg_class where oid = t.typrelid) = 'c')
  union all
  -- sequences
  select 10, 'seq|' || c.relname || '|' || format_type(s.seqtypid, null) || '|start=' || s.seqstart || '|inc=' || s.seqincrement || '|max=' || s.seqmax || '|min=' || s.seqmin || '|cycle=' || s.seqcycle
    from pg_sequence s join pg_class c on c.oid = s.seqrelid where c.relnamespace = 'public'::regnamespace
  union all
  -- default privileges and the schema's own ACL / owner
  select 11, 'defacl|' || pg_get_userbyid(d.defaclrole) || '|' || d.defaclobjtype::text || '|' || coalesce(d.defaclacl::text, '')
    from pg_default_acl d where d.defaclnamespace in (0, 'public'::regnamespace)
  union all
  select 12, 'schema|public|owner=' || pg_get_userbyid(n.nspowner) || '|acl=' || coalesce(n.nspacl::text, '') from pg_namespace n where n.nspname = 'public'
) x order by s, l collate "C";
