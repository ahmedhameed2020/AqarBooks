
begin;
set local statement_timeout = '480s';
set local lock_timeout = '20s';
set local search_path = public, extensions;
create schema cmp_rls;
grant usage on schema cmp_rls to authenticated;
create table cmp_rls.res(label text, detail text);
create table cmp_rls.totals(t text, n bigint);
create table cmp_rls.orgs(id uuid);
grant all on cmp_rls.res, cmp_rls.totals, cmp_rls.orgs to authenticated;

-- a platform admin that exists only inside this transaction
insert into public.user_role_assignments (user_id, role_id, organization_id)
  select m.user_id, r.id, null from (select user_id from public.members where user_id is not null limit 1) m, public.roles r
   where r.key = 'PLATFORM_SUPER_ADMIN' and r.organization_id is null limit 1;
create temp table pr on commit drop as
  (select 'staff:' || x.key as label, x.u as uid, x.org as own from (
    select distinct on (r.key) r.key as key, ura.user_id as u, ura.organization_id as org,
           exists (select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where rp.role_id = r.id
                    and p.key in ('finance.accounts.view','finance.accounts.manage','finance.reports.read','finance.periods.manage','finance.dues.read','finance.payments.read','finance.entries.create')) as holds
      from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
      join public.organization_memberships om on om.user_id = ura.user_id and om.organization_id = ura.organization_id and om.status = 'active'
     where ura.organization_id is not null order by r.key, ura.user_id) x
    where x.holds order by x.key limit 10)
  union all (select 'staff-without-keys:' || x.key, x.u, x.org from (
    select distinct on (r.key) r.key as key, ura.user_id as u, ura.organization_id as org,
           exists (select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where rp.role_id = r.id
                    and p.key in ('finance.accounts.view','finance.accounts.manage','finance.reports.read','finance.periods.manage','finance.dues.read','finance.payments.read','finance.entries.create')) as holds
      from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
      join public.organization_memberships om on om.user_id = ura.user_id and om.organization_id = ura.organization_id and om.status = 'active'
     where ura.organization_id is not null order by r.key, ura.user_id) x
    where not x.holds order by x.key limit 4)
  union all (select 'owner', m.user_id, m.organization_id from (select distinct on (organization_id) user_id, organization_id from public.members where user_id is not null limit 3) m)
  union all (select 'nonactive:' || om.status, om.user_id, om.organization_id from public.organization_memberships om where om.status <> 'active' limit 4)
  union all (select 'platform_admin', ura.user_id, null::uuid from public.user_role_assignments ura join public.roles r on r.id = ura.role_id where ura.organization_id is null and r.key = 'PLATFORM_SUPER_ADMIN' limit 1)
  union all (select 'stranger', gen_random_uuid(), null::uuid);
grant select on pr to authenticated;

-- the copies hold the rows of every principal's own organization plus a deterministic sample (40 organizations by id, up to 10 non-active ones), so the OLD per-row policies finish in minutes
create table cmp_rls.sample_orgs as
  select own as id from pr where own is not null
  union select id from (select id from public.organizations order by id limit 40) b
  union select id from (select id from public.organizations where status <> 'ACTIVE' order by id limit 10) c;

-- copies carrying ONLY the policy under test
create table cmp_rls.coa_old as select * from public.chart_of_accounts where organization_id in (select id from cmp_rls.sample_orgs);  create table cmp_rls.coa_new as select * from cmp_rls.coa_old;
create table cmp_rls.fp_old as select * from public.fiscal_periods where organization_id in (select id from cmp_rls.sample_orgs);  create table cmp_rls.fp_new as select * from cmp_rls.fp_old;
create table cmp_rls.dues_old as select * from public.dues where organization_id in (select id from cmp_rls.sample_orgs);  create table cmp_rls.dues_new as select * from cmp_rls.dues_old;
alter table cmp_rls.coa_old enable row level security;  alter table cmp_rls.coa_new enable row level security;
alter table cmp_rls.fp_old enable row level security;   alter table cmp_rls.fp_new enable row level security;
alter table cmp_rls.dues_old enable row level security; alter table cmp_rls.dues_new enable row level security;
grant select, insert, update on cmp_rls.coa_old, cmp_rls.coa_new, cmp_rls.fp_old, cmp_rls.fp_new, cmp_rls.dues_old, cmp_rls.dues_new to authenticated;
insert into cmp_rls.totals select 'coa', count(*) from cmp_rls.coa_old union all select 'fp', count(*) from cmp_rls.fp_old union all select 'dues', count(*) from cmp_rls.dues_old;
insert into cmp_rls.orgs select id from cmp_rls.sample_orgs;

create policy p_sel on cmp_rls.coa_old for select using (has_any_permission(organization_id, ARRAY['finance.accounts.view'::text, 'finance.reports.read'::text, 'finance.entries.create'::text, 'finance.dues.issue'::text, 'receivables.dues.create'::text, 'receivables.payments.create'::text, 'finance.expenses.read'::text, 'finance.suppliers.read'::text, 'finance.assets.read'::text, 'finance.assets.manage'::text, 'finance.service_charges.read'::text, 'finance.service_charges.manage'::text, 'finance.einvoice.read'::text, 'finance.einvoice.manage'::text, 'finance.commissions.read'::text, 'finance.commissions.manage'::text, 'finance.budgets.manage'::text, 'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.manage'::text, 'operations.maintenance.costs.post'::text, 'operations.maintenance.owner_charge'::text, 'property.leases.manage'::text, 'property.installments.manage'::text]));
create policy p_man on cmp_rls.coa_old for all using ((has_permission(auth.uid(), organization_id, 'finance.accounts.manage'::text) AND organization_is_active(organization_id))) with check ((has_permission(auth.uid(), organization_id, 'finance.accounts.manage'::text) AND organization_is_active(organization_id)));
create policy p_sel on cmp_rls.fp_old for select using (has_any_permission(organization_id, ARRAY['finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text, 'finance.payments.read'::text, 'receivables.payments.create'::text, 'finance.dues.read'::text, 'finance.dues.issue'::text, 'finance.expenses.read'::text, 'finance.suppliers.read'::text, 'finance.einvoice.read'::text, 'finance.assets.read'::text, 'finance.entries.create'::text, 'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.post'::text, 'finance.budgets.manage'::text]));
create policy p_man on cmp_rls.fp_old for all using ((has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND organization_is_active(organization_id))) with check ((has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND organization_is_active(organization_id)));
create policy p_sel on cmp_rls.dues_old for select using (has_permission(auth.uid(), organization_id, 'finance.dues.read'::text));

-- the NEW expressions are read from the real policies (fully qualified rendering) so exactly what the migration installed is what is tested
do $d$
declare q text; w text; pair record;
begin
  set local search_path = pg_catalog;
  for pair in select * from (values
      ('chart_of_accounts_select_permission','coa','sel'), ('chart_of_accounts_manage','coa','man'),
      ('fiscal_periods_select_permission','fp','sel'), ('fiscal_periods_manage','fp','man'), ('dues_select_permission','dues','sel')) v(pol, t, kind) loop
    select pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) into q, w from pg_policy where polname = pair.pol;
    if pair.kind = 'sel' then execute format('create policy p_sel on cmp_rls.%s_new for select using (%s)', pair.t, q);
    else execute format('create policy p_man on cmp_rls.%s_new for all using (%s) with check (%s)', pair.t, q, w); end if;
  end loop;
end $d$;

create function cmp_rls.compare(p_label text, p_uid uuid, p_own uuid, p_other uuid) returns void language plpgsql as $f$
declare t text; a bigint; b bigint; n bigint; ids_o uuid[]; ids_n uuid[]; xo bigint; xn bigint; ok_o boolean; ok_n boolean; org uuid; kind text;
begin
  foreach t in array array['coa','fp','dues'] loop
    execute format('select coalesce(array_agg(id), ''{}'') from cmp_rls.%s_old', t) into ids_o;
    execute format('select coalesce(array_agg(id), ''{}'') from cmp_rls.%s_new', t) into ids_n;
    select count(*) into a from (select unnest(ids_n) except all select unnest(ids_o)) x;
    select count(*) into b from (select unnest(ids_o) except all select unnest(ids_n)) x;
    n := coalesce(array_length(ids_o, 1), 0);
    if a <> 0 or b <> 0 then insert into cmp_rls.res values ('select-differs', p_label || '|' || t || '|only_new=' || a::text || '|only_old=' || b::text); end if;
    insert into cmp_rls.res values ('seen', p_label || '|' || t || '|' || n::text);
  end loop;
  foreach t in array array['coa','fp'] loop
    execute format('with u as (update cmp_rls.%s_old set id = id returning 1) select count(*) from u', t) into xo;
    execute format('with u as (update cmp_rls.%s_new set id = id returning 1) select count(*) from u', t) into xn;
    if xo <> xn then insert into cmp_rls.res values ('update-differs', p_label || '|' || t || '|old=' || xo::text || '|new=' || xn::text); end if;
    insert into cmp_rls.res values ('updatable', p_label || '|' || t || '|' || xo::text);
    foreach kind in array array['own','other'] loop
      org := case kind when 'own' then p_own else p_other end;
      continue when org is null;
        begin execute format('insert into cmp_rls.%s_old (id, organization_id) values (gen_random_uuid(), %L)', t, org); raise exception 'probe-ok' using errcode = 'P0001';
        exception when others then ok_o := (sqlerrm = 'probe-ok'); end;
        begin execute format('insert into cmp_rls.%s_new (id, organization_id) values (gen_random_uuid(), %L)', t, org); raise exception 'probe-ok' using errcode = 'P0001';
        exception when others then ok_n := (sqlerrm = 'probe-ok'); end;
        if ok_o is distinct from ok_n then insert into cmp_rls.res values ('insert-differs', p_label || '|' || t || '|' || kind || '|old=' || ok_o::text || '|new=' || ok_n::text); end if;
        insert into cmp_rls.res values ('insert', p_label || '|' || t || '|' || kind || '|' || ok_o::text);
    end loop;
  end loop;
end $f$;
grant execute on function cmp_rls.compare(text, uuid, uuid, uuid) to authenticated;

do $d$
declare r record; other uuid;
begin
  for r in select * from pr loop
    select id into other from cmp_rls.orgs where id is distinct from r.own limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    raise notice '% %', clock_timestamp()::time, r.label; perform cmp_rls.compare(r.label, r.uid, r.own, other);
    reset role;
  end loop;
end $d$;

-- the platform admin must see every row through the new policy as well
insert into cmp_rls.res select 'admin-total-mismatch', t.t from cmp_rls.totals t
 where (select detail from cmp_rls.res where label = 'seen' and detail like 'platform_admin|' || t.t || '|%' limit 1) is distinct from ('platform_admin|' || t.t || '|' || t.n::text);

-- catalog facts about the function and the five policies
insert into cmp_rls.res select 'fn', p.prosecdef::text || '|' || p.provolatile::text || '|' || coalesce(p.proconfig::text, '') || '|' || coalesce(p.proacl::text, '')
  from pg_proc p where p.proname = 'orgs_with_permission_keys' and p.pronamespace = 'public'::regnamespace;
insert into cmp_rls.res select 'ref-acl', p.proacl::text from pg_proc p where p.proname = 'has_permission' and p.pronamespace = 'public'::regnamespace;
insert into cmp_rls.res select 'fn-priv', has_function_privilege('anon', 'public.orgs_with_permission_keys(text[])', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.orgs_with_permission_keys(text[])', 'execute')::text || '|' || has_function_privilege('service_role', 'public.orgs_with_permission_keys(text[])', 'execute')::text;
insert into cmp_rls.res select 'policy', p.polname || '|cmd=' || p.polcmd::text || '|permissive=' || p.polpermissive::text || '|roles=' || (select string_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end, ',') from unnest(p.polroles) r)
    || '|per_row_helper=' || ((coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ '(has_permission|has_any_permission)\(')::text
  from pg_policy p where p.polname in ('chart_of_accounts_select_permission','chart_of_accounts_manage','fiscal_periods_select_permission','fiscal_periods_manage','dues_select_permission');
insert into cmp_rls.res select 'untouched', p.polname || '|' || pg_get_expr(p.polqual, p.polrelid) from pg_policy p where p.polname = 'dues_select_own_via_maintenance_cost';

select label || '|' || detail from cmp_rls.res order by label, detail;
rollback;
