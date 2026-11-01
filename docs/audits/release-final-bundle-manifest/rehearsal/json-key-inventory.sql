-- JSON KEY INVENTORY (v2) -- READ-ONLY, catalog + JSON structure only. NOT RUN ON PRODUCTION (G0 pending).
-- Run by the owner from an EMPTY working folder, with a role prepared by json-inventory-role.sql (not with a broader role):
--   PGOPTIONS="-c statement_timeout=600000" psql "$PROD_INVENTORY_URL" -X -v allow="$APPROVED_KEYS" -f json-key-inventory.sql
--   $APPROVED_KEYS = the approved list, one "table|column|key" per entry, entries separated by ';' (see json-inventory-approved-example.txt).
-- Writes exactly two files: json-inventory.txt and json-inventory-proposed.txt.
--
-- WHAT IS NEVER WRITTEN
--   * no JSON value, string or number;
--   * no key NAME unless it is on the approved list (the list decides; the shape of a name does not). Unapproved names are counted only;
--   * no key name that is not a plain ASCII identifier, even if it is approved (approved entries that are not identifiers are ignored and reported as ignored).
-- DISTINCT ROWS: every count of rows uses count(DISTINCT row ctid) inside this one statement (one snapshot), never the number of JSON elements.
-- GUARD: if this role is subject to row-level security on any JSON table, the script stops BEFORE reading any JSON, because a partial inventory would look complete.
-- Paths: key | [].key (array of objects, one level) | . (top-level scalar). Deeper nesting is outside the inventory and outside the export.
-- PROPOSAL: UUID / TS / BOOL when every value at an approved path has that shape; NUM when every value is a number (written as '#?JSONKEEP', commented: the owner uncomments on purpose); otherwise REVIEW (never proposed).
-- A path is proposed only when it occurs in at least 3 distinct rows.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
\pset footer off
\if :{?allow}
\else
\set allow ''
\endif

-- GUARD (no write, no JSON value is read before it passes)
do $$
declare r record; bad text := ''; me oid := (select oid from pg_roles where rolname = current_user);
begin
  for r in
    select c.relname, c.relforcerowsecurity, c.relowner = me as is_owner,
           (select rolbypassrls from pg_roles where rolname = current_user) as bypass
    from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p') and c.relrowsecurity
      and exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and t.typname in ('json', 'jsonb'))
  loop
    if not r.bypass and (r.relforcerowsecurity or not r.is_owner) then bad := bad || ' ' || r.relname; end if;
  end loop;
  if bad <> '' then
    raise exception 'RLS-GUARD: row security applies to this role on:%. A partial inventory would look complete, so nothing was read. Use a role that bypasses RLS and only holds SELECT (decision needed; see the G0 report).', bad;
  end if;
end $$;

-- approved list sanity: entries must be table|column|identifier
select 'IGNORED approved entry (not table|column|plain-identifier): ' || count(*) as note
from regexp_split_to_table(:'allow', ';') l
where l <> '' and not (split_part(l, '|', 1) ~ '^[a-z_][a-z0-9_]*$' and split_part(l, '|', 2) ~ '^[a-z_][a-z0-9_]*$' and split_part(l, '|', 3) ~ '^[A-Za-z][A-Za-z0-9_]{0,40}$' and split_part(l, '|', 4) = '');

select string_agg(format($q$
  select %1$L::text as t, %2$L::text as c, g.path, g.key, g.types, g.nrows, g.proposal, 'P' as kind
  from (
    select path, key, string_agg(distinct ty, ',' order by ty) as types, count(distinct rid) as nrows,
      case
        when count(*) = count(*) filter (where ty = 'string' and s ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then 'UUID'
        when count(*) = count(*) filter (where ty = 'string' and s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9:.]+(Z|[+-][0-9:]+)?)?$') then 'TS'
        when count(*) = count(*) filter (where ty = 'boolean') then 'BOOL'
        when count(*) = count(*) filter (where ty = 'number') then 'NUM'
        else 'REVIEW' end as proposal
    from (
      select e.key as k, jsonb_typeof(e.value) as ty, e.value #>> '{}' as s, e.key as path, e.key as key, x.ctid::text as rid
        from public.%3$I x, jsonb_each(case when jsonb_typeof(x.%4$I::jsonb) = 'object' then x.%4$I::jsonb else '{}'::jsonb end) e
        where e.key ~ '^[A-Za-z][A-Za-z0-9_]{0,40}$' and jsonb_typeof(e.value) <> 'null'
      union all
      select e.key, jsonb_typeof(e.value), e.value #>> '{}', '[].' || e.key, e.key, x.ctid::text
        from public.%3$I x, jsonb_array_elements(case when jsonb_typeof(x.%4$I::jsonb) = 'array' then x.%4$I::jsonb else '[]'::jsonb end) el,
             jsonb_each(case when jsonb_typeof(el) = 'object' then el else '{}'::jsonb end) e
        where e.key ~ '^[A-Za-z][A-Za-z0-9_]{0,40}$' and jsonb_typeof(e.value) <> 'null'
      union all
      select '.', jsonb_typeof(x.%4$I::jsonb), x.%4$I::jsonb #>> '{}', '.', '', x.ctid::text
        from public.%3$I x where jsonb_typeof(x.%4$I::jsonb) in ('number', 'boolean', 'string')
    ) leaves
    group by path, key
  ) g
  union all
  select %1$L, %2$L, '<non-identifier keys>', '', 'count only', nk.n, 'DROPPED', 'N'
  from (
    select count(distinct rid) as n from (
      select x.ctid::text as rid from public.%3$I x, jsonb_each(case when jsonb_typeof(x.%4$I::jsonb) = 'object' then x.%4$I::jsonb else '{}'::jsonb end) e where e.key !~ '^[A-Za-z][A-Za-z0-9_]{0,40}$'
      union all
      select x.ctid::text from public.%3$I x, jsonb_array_elements(case when jsonb_typeof(x.%4$I::jsonb) = 'array' then x.%4$I::jsonb else '[]'::jsonb end) el,
             jsonb_each(case when jsonb_typeof(el) = 'object' then el else '{}'::jsonb end) e where e.key !~ '^[A-Za-z][A-Za-z0-9_]{0,40}$'
    ) z0
  ) nk where nk.n > 0
$q$, c.relname, a.attname, c.relname, a.attname), E'\n  union all\n') as invq
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
join pg_type ty on ty.oid = a.atttypid and ty.typname in ('json', 'jsonb')
where c.relkind in ('r', 'p') \gset

\o json-inventory.txt
with z as (
  select q.*,
         (q.key <> '' and (q.t || '|' || q.c || '|' || q.key) in (select l from regexp_split_to_table(:'allow', ';') l)) as approved,
         sum(case when q.kind = 'P' then 1 else 0 end) over (partition by q.t, q.c) as np
  from (:invq) q
)
select 'INV|' || t || '|' || c || '|' || path || '|' || types || '|' || nrows || '|' || proposal
  from z where np <= 150 and kind = 'P' and approved
union all
select 'INV|' || t || '|' || c || '|<' || count(*) || ' paths not on the approved list: names withheld>|-|-|WITHHELD'
  from z where np <= 150 and kind = 'P' and not approved group by t, c
union all
select 'INV|' || t || '|' || c || '|' || path || '|' || types || '|' || nrows || '|' || proposal
  from z where np <= 150 and kind = 'N'
union all
select distinct 'INV|' || t || '|' || c || '|<DYNAMIC: ' || np || ' paths, nothing listed>|-|-|WITHHELD'
  from z where np > 150
order by 1;

\o json-inventory-proposed.txt
select '# approved paths that occur in at least 3 distinct rows and have one shape. Lines starting #? are NUM and need a deliberate uncomment. Paste into reviewed-columns.sql only after the owner signs off.';
with z as (
  select q.*,
         (q.key <> '' and (q.t || '|' || q.c || '|' || q.key) in (select l from regexp_split_to_table(:'allow', ';') l)) as approved,
         sum(case when q.kind = 'P' then 1 else 0 end) over (partition by q.t, q.c) as np
  from (:invq) q
)
select case when proposal = 'NUM' then '#?' else '' end || 'JSONKEEP|' || t || '|' || c || '|' || path || '|' || proposal
  from z where np <= 150 and kind = 'P' and approved and nrows >= 3 and proposal in ('UUID', 'TS', 'BOOL', 'NUM')
order by 1;
\o
