import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isolatedDbContainer } from "./helpers/isolated-target";

/**
 * Migration 20261017100900 replaced the per-row has_permission() / has_any_permission() calls of five policies (chart_of_accounts select + manage,
 * fiscal_periods select + manage, dues_select_permission) by a once-per-statement set (orgs_with_permission_keys). It must not change which rows any
 * principal can read, update or insert.
 *
 * Method (all inside a transaction that is always rolled back): for each table two COPIES are made, each carrying ONLY the policy under test --
 * the OLD expression (hard-coded below, verbatim from before the migration) on one copy and the NEW expression, read from the real catalog, on the
 * other -- so no other policy can mask a difference. Then, for every principal, under `authenticated` with that principal's JWT claims:
 *   - the ids visible through the old copy vs the new copy, in both directions (EXCEPT ALL);
 *   - the number of rows an UPDATE can reach (USING + WITH CHECK of the ALL policies);
 *   - whether an INSERT for the principal's own organization and for another organization is allowed (WITH CHECK), each probe undone.
 * Migration 20261017101000 then evaluates the platform-admin check once per statement (an uncorrelated InitPlan): the extra tests assert that in the catalog and in the plans.
 * Principals: staff of EVERY role present in the data (so roles with and without the listed keys), owners (portal members), invited / suspended
 * members, a stranger, and a platform admin created inside the transaction. Catalog assertions cover the function's properties and grants and the
 * unchanged command / roles of the five policies. ISOLATED STACK ONLY; nothing is written permanently.
 */
const OLD = {
  coa_select: `has_any_permission(organization_id, ARRAY['finance.accounts.view'::text, 'finance.reports.read'::text, 'finance.entries.create'::text, 'finance.dues.issue'::text, 'receivables.dues.create'::text, 'receivables.payments.create'::text, 'finance.expenses.read'::text, 'finance.suppliers.read'::text, 'finance.assets.read'::text, 'finance.assets.manage'::text, 'finance.service_charges.read'::text, 'finance.service_charges.manage'::text, 'finance.einvoice.read'::text, 'finance.einvoice.manage'::text, 'finance.commissions.read'::text, 'finance.commissions.manage'::text, 'finance.budgets.manage'::text, 'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.manage'::text, 'operations.maintenance.costs.post'::text, 'operations.maintenance.owner_charge'::text, 'property.leases.manage'::text, 'property.installments.manage'::text])`,
  coa_manage: `(has_permission(auth.uid(), organization_id, 'finance.accounts.manage'::text) AND organization_is_active(organization_id))`,
  fp_select: `has_any_permission(organization_id, ARRAY['finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text, 'finance.payments.read'::text, 'receivables.payments.create'::text, 'finance.dues.read'::text, 'finance.dues.issue'::text, 'finance.expenses.read'::text, 'finance.suppliers.read'::text, 'finance.einvoice.read'::text, 'finance.assets.read'::text, 'finance.entries.create'::text, 'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.post'::text, 'finance.budgets.manage'::text])`,
  fp_manage: `(has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND organization_is_active(organization_id))`,
  dues_select: `has_permission(auth.uid(), organization_id, 'finance.dues.read'::text)`,
};

const SCRIPT = `
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
  union all (select 'nonactive:' || x.status, x.user_id, x.organization_id from (select om.status, om.user_id, om.organization_id, row_number() over (partition by om.status order by om.user_id) rn from public.organization_memberships om where om.status <> 'active') x where x.rn <= 2)
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

create policy p_sel on cmp_rls.coa_old for select using (${OLD.coa_select});
create policy p_man on cmp_rls.coa_old for all using (${OLD.coa_manage}) with check (${OLD.coa_manage});
create policy p_sel on cmp_rls.fp_old for select using (${OLD.fp_select});
create policy p_man on cmp_rls.fp_old for all using (${OLD.fp_manage}) with check (${OLD.fp_manage});
create policy p_sel on cmp_rls.dues_old for select using (${OLD.dues_select});

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
    perform cmp_rls.compare(r.label, r.uid, r.own, other);
    reset role;
  end loop;
end $d$;

-- plans (EXPLAIN ANALYZE of the REAL tables, read only) for a regular staff user, the platform admin and a stranger
create function cmp_rls.plans(p_label text) returns void language plpgsql as $f$
declare t text; l text; n int;
begin
  foreach t in array array['chart_of_accounts','fiscal_periods','dues'] loop
    n := 0;
    for l in execute 'explain (analyze, costs off, timing off, summary off) select count(*) from public.' || t loop
      n := n + 1;
      insert into cmp_rls.res values ('plan', p_label || '~' || t || '~' || lpad(n::text, 3, '0') || '~' || l);
    end loop;
  end loop;
end $f$;
grant execute on function cmp_rls.plans(text) to authenticated;
do $d$
declare r record;
begin
  for r in (select * from pr where label = (select min(label) from pr where label like 'staff:%') or label in ('platform_admin','stranger')) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp_rls.plans(r.label);
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
    || '|per_row_helper=' || ((coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ '(has_permission|has_any_permission)\\(')::text
  from pg_policy p where p.polname in ('chart_of_accounts_select_permission','chart_of_accounts_manage','fiscal_periods_select_permission','fiscal_periods_manage','dues_select_permission');
insert into cmp_rls.res
  select 'admin-subselect', p.polname || '~' || k.part || '~' || m[1]
    from pg_policy p
    cross join lateral (values ('using', pg_get_expr(p.polqual, p.polrelid)), ('check', pg_get_expr(p.polwithcheck, p.polrelid))) k(part, e)
    cross join lateral regexp_matches(coalesce(k.e, ''), '[(] SELECT (.*?is_platform_admin[(]auth[.]uid[(][)][)])', 'g') m
   where p.polname in ('chart_of_accounts_select_permission','chart_of_accounts_manage','fiscal_periods_select_permission','fiscal_periods_manage','dues_select_permission');
insert into cmp_rls.res select 'untouched', p.polname || '|' || pg_get_expr(p.polqual, p.polrelid) from pg_policy p where p.polname = 'dues_select_own_via_maintenance_cost';

select label || '|' || detail from cmp_rls.res order by label, detail;
rollback;
`;

const out = () =>
  execFileSync("docker", ["exec", "-i", isolatedDbContainer(), "psql", "-U", "postgres", "-d", process.env.RLS_TEST_DB ?? "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: SCRIPT, encoding: "utf8", timeout: 540_000, stdio: ["pipe", "pipe", "pipe"],
  });

describe("RLS: set-based permission policies are equivalent to the per-row ones (migration 20261017100900)", () => {
  const lines = out().split("\n").filter((l) => l.includes("|")).map((l) => { const i = l.indexOf("|"); return [l.slice(0, i), l.slice(i + 1)] as const; });
  const of = (label: string) => lines.filter(([l]) => l === label).map(([, d]) => d);

  it("no principal sees, can update, or can insert anything different through the new policies", () => {
    for (const bad of ["select-differs", "update-differs", "insert-differs", "admin-total-mismatch"]) expect(of(bad), bad).toEqual([]);
  });

  it("is not vacuous: many principals of different roles, staff really see rows, the stranger sees none, the platform admin sees all", () => {
    const seen = of("seen").map((d) => d.split("|"));
    const principals = new Set(seen.map((s) => s[0]));
    expect(principals.size).toBeGreaterThanOrEqual(10);
    expect([...principals].some((p) => p.startsWith("staff:"))).toBe(true);
    expect([...principals].some((p) => p.startsWith("staff-without-keys:")), "roles without the listed keys are covered").toBe(true);
    expect(principals.has("platform_admin")).toBe(true);
    expect([...principals].some((p) => p === "nonactive:invited") && [...principals].some((p) => p === "nonactive:suspended"), "invited and suspended principals are covered").toBe(true);
    for (const t of ["coa", "fp", "dues"]) {
      expect(seen.some((s) => s[0].startsWith("staff:") && s[1] === t && Number(s[2]) > 0), `a staff principal sees ${t}`).toBe(true);
      expect(seen.filter((s) => s[0] === "stranger" && s[1] === t).every((s) => Number(s[2]) === 0), `stranger sees nothing in ${t}`).toBe(true);
    }
    // writes: a staff principal can insert for its own organization somewhere and nobody can insert for another organization
    const ins = of("insert").map((d) => d.split("|"));
    expect(ins.some((s) => s[0].startsWith("staff:") && s[2] === "own" && s[3] === "true")).toBe(true);
    expect(ins.filter((s) => s[0] !== "platform_admin" && s[2] === "other").every((s) => s[3] === "false")).toBe(true);
    expect(of("updatable").some((d) => d.startsWith("staff:") && Number(d.split("|")[2]) > 0)).toBe(true);
  });

  it("the function is SECURITY DEFINER, STABLE, search_path pinned, and has exactly the grants of has_permission (not anon, not PUBLIC)", () => {
    const [fn] = of("fn"); const [ref] = of("ref-acl");
    const [secdef, vol, config, acl] = fn.split("|");
    expect(secdef).toBe("true");
    expect(vol).toBe("s");
    expect(config).toContain("search_path=public");
    expect(acl).toBe(ref);
    expect(of("fn-priv")[0]).toBe("false|true|true");
  });

  it("the platform-admin check is an uncorrelated sub-select: no table column inside it, and every policy has one (using, and check for the manage policies)", () => {
    const subs = of("admin-subselect").map((d) => d.split("~"));
    expect(subs.length).toBeGreaterThanOrEqual(7); // 3 select policies (using) + 2 manage policies (using + check)
    for (const [pol, part, text] of subs) {
      expect(text, `${pol} ${part}`).toContain("is_platform_admin");
      expect(text, `${pol} ${part}: the sub-select must not reference the row`).not.toMatch(/organization_id|id|unit_id|member_id/);
    }
    const per = new Map<string, number>();
    for (const [pol, part] of subs) per.set(`${pol}/${part}`, (per.get(`${pol}/${part}`) ?? 0) + 1);
    for (const key of ["chart_of_accounts_select_permission/using", "chart_of_accounts_manage/using", "chart_of_accounts_manage/check", "fiscal_periods_select_permission/using", "fiscal_periods_manage/using", "fiscal_periods_manage/check", "dues_select_permission/using"])
      expect(per.get(key), key).toBeGreaterThanOrEqual(1);
  });

  it("the plans show an InitPlan executed once and no per-row is_platform_admin call, for a regular user, the platform admin and a stranger", () => {
    const plans = of("plan").map((d) => d.split("~"));
    const who = new Set(plans.map((p) => p[0]));
    expect([...who].some((w) => w.startsWith("staff:")) && who.has("platform_admin") && who.has("stranger"), `plans for staff, admin and stranger: ${[...who]}`).toBe(true);
    for (const w of who) for (const t of ["chart_of_accounts", "fiscal_periods", "dues"]) {
      const lines = plans.filter((p) => p[0] === w && p[1] === t).sort((a, b) => a[2].localeCompare(b[2])).map((p) => p.slice(3).join("~"));
      const text = lines.join(String.fromCharCode(10));
      expect(text, `${w} ${t}: InitPlan present`).toMatch(/InitPlan \d+/);
      // every InitPlan result is executed at most once (a short-circuited one prints "never executed"), and at least one really ran, once
      const results = lines.map((l, k) => (/^\s*InitPlan \d+/.test(l) ? lines[k + 1] : null)).filter((l): l is string => l !== null);
      expect(results.length, `${w} ${t}: InitPlan nodes`).toBeGreaterThanOrEqual(1);
      for (const r of results) expect(r, `${w} ${t}: an InitPlan must run at most once`).toMatch(/Result \((actual rows=1 loops=1|never executed)\)/);
      expect(results.some((r) => /actual rows=1 loops=1/.test(r)), `${w} ${t}: at least one InitPlan ran, exactly once`).toBe(true);
      const filters = lines.filter((l) => /Filter:/.test(l));
      expect(filters.some((l) => /\.col1/.test(l)), `${w} ${t}: the filter reads the InitPlan result`).toBe(true);
      expect(filters.join(" "), `${w} ${t}: is_platform_admin is not called per row in a Filter`).not.toMatch(/is_platform_admin/);
    }
  });

  it("the five policies keep their command, permissive flag and roles, no longer call a per-row permission helper, and the owner routes are untouched", () => {
    const pol = of("policy").map((d) => d.split("|"));
    expect(pol.map((p) => p[0]).sort()).toEqual(["chart_of_accounts_manage", "chart_of_accounts_select_permission", "dues_select_permission", "fiscal_periods_manage", "fiscal_periods_select_permission"]);
    for (const p of pol) {
      expect(p[1], p[0]).toBe(p[0].endsWith("_manage") ? "cmd=*" : "cmd=r");
      expect(p[2], p[0]).toBe("permissive=true");
      expect(p[3], p[0]).toBe("roles=PUBLIC");
      expect(p[4], p[0]).toBe("per_row_helper=false");
    }
    expect(of("untouched")[0]).toContain("work_order_cost_member_can_read_due");
  });
});
