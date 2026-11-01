import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isolatedDbContainer } from "./helpers/isolated-target";

/**
 * Migration 20261017101200: fiscal_years evaluates its permission checks once per statement (select policy + the ALL "manage" policy).
 *
 * Measured before: `count(*)` over 1,394 rows took ~4.4 s under load (37,100 buffers) because has_any_permission / has_permission / organization_is_active were called
 * for every row of two permissive policies; interleaved on a copy 1,156 ms -> 18 ms.
 *
 * This test proves the INSTALLED policies (read from the catalog, fully qualified) return exactly what the previous expressions (hard-coded below) did, inside a
 * transaction that is always rolled back. Copies carry only the policy under test. Per principal, under `authenticated` with that principal's JWT claims:
 *   READ    the visible ids, in both directions;
 *   UPDATE  the number of rows an UPDATE can reach, and the outcome of moving a visible row to ANOTHER organization (WITH CHECK: rows moved, or denied);
 *   DELETE  the number of rows a DELETE can reach (each probe is undone);
 *   INSERT  whether an INSERT for the principal's own organization and for another organization is allowed (WITH CHECK).
 * Principals: staff of every role present (with and without the keys), owners, invited and suspended members, a stranger, and a platform admin created inside the
 * transaction. Also asserted on the REAL table: exactly two policies (one SELECT, one ALL), PUBLIC, permissive, no per-row permission helper, an uncorrelated
 * platform-admin sub-select, the table ACL unchanged, and the plans (InitPlan executed at most once, no per-row is_platform_admin) for a regular user, the platform
 * admin and a stranger. ISOLATED STACK ONLY; nothing is written permanently.
 */
const KEYS = `ARRAY['finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text]`;
const SEL_OLD = `public.has_any_permission(organization_id, ${KEYS})`;
const MAN_OLD = `(public.has_permission(auth.uid(), organization_id, 'finance.periods.manage'::text) AND public.organization_is_active(organization_id))`;
const ACL_BEFORE = "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";

const HOLDS = `exists (select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where rp.role_id = r.id and p.key in ('finance.periods.manage','finance.reports.read','finance.accounts.view'))`;
const staffQuery = `select distinct on (r.key) r.key as key, ura.user_id as u, ura.organization_id as org, ${HOLDS} as holds
      from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
      join public.organization_memberships om on om.user_id = ura.user_id and om.organization_id = ura.organization_id and om.status = 'active'
     where ura.organization_id is not null order by r.key, ura.user_id`;

const SCRIPT = `
begin;
set local statement_timeout = '480s';
set local lock_timeout = '20s';
set local search_path = public, extensions;
create schema cmp_fy;
grant usage on schema cmp_fy to authenticated;
create table cmp_fy.res(label text, detail text);
create table cmp_fy.orgs(id uuid);
grant all on cmp_fy.res, cmp_fy.orgs to authenticated;

insert into public.user_role_assignments (user_id, role_id, organization_id)
  select m.user_id, r.id, null from (select user_id from public.members where user_id is not null limit 1) m, public.roles r
   where r.key = 'PLATFORM_SUPER_ADMIN' and r.organization_id is null limit 1;
create temp table pr on commit drop as
  (select 'staff:' || x.key as label, x.u as uid, x.org as own from (${staffQuery}) x where x.holds order by x.key limit 10)
  union all (select 'staff-without-keys:' || x.key, x.u, x.org from (${staffQuery}) x where not x.holds order by x.key limit 4)
  union all (select 'owner', m.user_id, m.organization_id from (select distinct on (organization_id) user_id, organization_id from public.members where user_id is not null limit 3) m)
  union all (select 'nonactive:' || x.status, x.user_id, x.organization_id from (select om.status, om.user_id, om.organization_id, row_number() over (partition by om.status order by om.user_id) rn from public.organization_memberships om where om.status <> 'active') x where x.rn <= 2)
  union all (select 'platform_admin', ura.user_id, null::uuid from public.user_role_assignments ura join public.roles r on r.id = ura.role_id where ura.organization_id is null and r.key = 'PLATFORM_SUPER_ADMIN' limit 1)
  union all (select 'stranger', gen_random_uuid(), null::uuid);
grant select on pr to authenticated;

create table cmp_fy.sample_orgs as
  select own as id from pr where own is not null
  union select id from (select id from public.organizations order by id limit 40) b
  union select id from (select id from public.organizations where status <> 'ACTIVE' order by id limit 10) c;
insert into cmp_fy.orgs select id from cmp_fy.sample_orgs;
create table cmp_fy.fy_old as select * from public.fiscal_years where organization_id in (select id from cmp_fy.sample_orgs);
create table cmp_fy.fy_new as select * from cmp_fy.fy_old;
alter table cmp_fy.fy_old enable row level security; alter table cmp_fy.fy_new enable row level security;
grant select, insert, update, delete on cmp_fy.fy_old, cmp_fy.fy_new to authenticated;
create table cmp_fy.totals as select count(*) n from cmp_fy.fy_old;

create policy p_sel on cmp_fy.fy_old for select using (${SEL_OLD});
create policy p_man on cmp_fy.fy_old for all using (${MAN_OLD}) with check (${MAN_OLD});

-- the NEW policies are the INSTALLED ones (fully qualified rendering), re-created on the copy
do $d$
declare q text; w text;
begin
  set local search_path = pg_catalog;
  select pg_get_expr(polqual, polrelid) into q from pg_policy where polname = 'fiscal_years_select_permission';
  execute format('create policy p_sel on cmp_fy.fy_new for select using (%s)', q);
  select pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) into q, w from pg_policy where polname = 'fiscal_years_manage';
  execute format('create policy p_man on cmp_fy.fy_new for all using (%s) with check (%s)', q, w);
end $d$;

create function cmp_fy.probe(p_tbl text, p_kind text, p_org uuid) returns text language plpgsql as $f$
declare n bigint := -1;
begin
  begin
    if p_kind = 'insert' then
      execute format('insert into cmp_fy.%s (id, organization_id) values (gen_random_uuid(), %L)', p_tbl, p_org); n := 1;
    elsif p_kind = 'update' then
      execute format('update cmp_fy.%s set id = id', p_tbl); get diagnostics n = row_count;
    elsif p_kind = 'delete' then
      execute format('delete from cmp_fy.%s', p_tbl); get diagnostics n = row_count;
    elsif p_kind = 'move' then
      execute format('update cmp_fy.%1$s set organization_id = %2$L where id in (select id from cmp_fy.%1$s limit 3)', p_tbl, p_org); get diagnostics n = row_count;
    end if;
    raise exception 'probe-undo' using errcode = 'P0001';
  exception when others then
    if sqlerrm <> 'probe-undo' then return 'denied'; end if;
  end;
  return 'rows=' || n::text;
end $f$;
grant execute on function cmp_fy.probe(text, text, uuid) to authenticated;

create function cmp_fy.compare(p_label text, p_own uuid, p_other uuid) returns void language plpgsql as $f$
declare io uuid[]; i_n uuid[]; a bigint; b bigint; kind text; ro text; rn text; org uuid;
begin
  select coalesce(array_agg(id), '{}') into io from cmp_fy.fy_old;
  select coalesce(array_agg(id), '{}') into i_n from cmp_fy.fy_new;
  select count(*) into a from (select unnest(i_n) except all select unnest(io)) x; select count(*) into b from (select unnest(io) except all select unnest(i_n)) x;
  if a <> 0 or b <> 0 then insert into cmp_fy.res values ('read-differs', p_label || '|only_new=' || a::text || '|only_old=' || b::text); end if;
  insert into cmp_fy.res values ('seen', p_label || '|' || coalesce(array_length(io, 1), 0)::text);
  foreach kind in array array['update','delete'] loop
    ro := cmp_fy.probe('fy_old', kind, null); rn := cmp_fy.probe('fy_new', kind, null);
    if ro is distinct from rn then insert into cmp_fy.res values (kind || '-differs', p_label || '|old=' || ro || '|new=' || rn); end if;
    insert into cmp_fy.res values (kind, p_label || '|' || ro);
  end loop;
  foreach kind in array array['insert-own','insert-other','move-other'] loop
    org := case kind when 'insert-own' then p_own else p_other end;
    continue when org is null;
    ro := cmp_fy.probe('fy_old', split_part(kind, '-', 1), org); rn := cmp_fy.probe('fy_new', split_part(kind, '-', 1), org);
    if ro is distinct from rn then insert into cmp_fy.res values (kind || '-differs', p_label || '|old=' || ro || '|new=' || rn); end if;
    insert into cmp_fy.res values (kind, p_label || '|' || ro);
  end loop;
end $f$;
grant execute on function cmp_fy.compare(text, uuid, uuid) to authenticated;

create function cmp_fy.plans(p_label text) returns void language plpgsql as $f$
declare l text; n int := 0;
begin
  for l in execute 'explain (analyze, costs off, timing off, summary off) select count(*) from public.fiscal_years' loop
    n := n + 1;
    insert into cmp_fy.res values ('plan', p_label || '~' || lpad(n::text, 3, '0') || '~' || l);
  end loop;
end $f$;
grant execute on function cmp_fy.plans(text) to authenticated;

do $d$
declare r record; other uuid;
begin
  for r in select * from pr loop
    select id into other from cmp_fy.orgs where id is distinct from r.own limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp_fy.compare(r.label, r.own, other);
    reset role;
  end loop;
  for r in (select * from pr where label = (select min(label) from pr where label like 'staff:%') or label in ('platform_admin','stranger')) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp_fy.plans(r.label);
    reset role;
  end loop;
end $d$;

insert into cmp_fy.res select 'totals', n::text from cmp_fy.totals;
insert into cmp_fy.res
  select 'admin-subselect', p.polname || '~' || k.part || '~' || m[1]
    from pg_policy p
    cross join lateral (values ('using', pg_get_expr(p.polqual, p.polrelid)), ('check', pg_get_expr(p.polwithcheck, p.polrelid))) k(part, e)
    cross join lateral regexp_matches(coalesce(k.e, ''), '[(] SELECT (.{0,6}auth[.]uid[(][)] IS NOT NULL.{0,24}is_platform_admin[(]auth[.]uid[(][)][)])', 'g') m
   where p.polrelid = 'public.fiscal_years'::regclass;
insert into cmp_fy.res
  select 'policy', p.polname || '~cmd=' || p.polcmd::text || '~permissive=' || p.polpermissive::text
    || '~roles=' || (select string_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end, ',') from unnest(p.polroles) r)
    || '~per_row_helper=' || ((coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ '(has_permission|has_any_permission)[(]')::text
    || '~has_check=' || (p.polwithcheck is not null)::text
  from pg_policy p where p.polrelid = 'public.fiscal_years'::regclass;
insert into cmp_fy.res select 'acl', coalesce(relacl::text, '') from pg_class where oid = 'public.fiscal_years'::regclass;

select label || '|' || detail from cmp_fy.res order by label, detail;
rollback;
`;

const out = () =>
  execFileSync("docker", ["exec", "-i", isolatedDbContainer(), "psql", "-U", "postgres", "-d", process.env.RLS_TEST_DB ?? "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: SCRIPT, encoding: "utf8", timeout: 540_000, stdio: ["pipe", "pipe", "pipe"],
  });

describe("RLS: fiscal_years evaluates permissions once per statement, with the same rows, updates, deletes and inserts as before (migration 20261017101200)", () => {
  const lines = out().split("\n").filter((l) => l.includes("|")).map((l) => { const i = l.indexOf("|"); return [l.slice(0, i), l.slice(i + 1)] as const; });
  const of = (label: string) => lines.filter(([l]) => l === label).map(([, d]) => d);

  it("no principal reads, updates, deletes, inserts or moves anything different through the installed policies (WITH CHECK included)", () => {
    for (const bad of ["read-differs", "update-differs", "delete-differs", "insert-own-differs", "insert-other-differs", "move-other-differs"]) expect(of(bad), bad).toEqual([]);
  });

  it("is not vacuous: every role class, invited and suspended members, owners, a stranger, the platform admin; the operations really allow and really deny", () => {
    const seen = of("seen").map((d) => d.split("|"));
    const who = new Set(seen.map((s) => s[0]));
    expect(who.size).toBeGreaterThanOrEqual(10);
    expect(who.has("platform_admin") && who.has("stranger") && who.has("owner")).toBe(true);
    expect(who.has("nonactive:invited") && who.has("nonactive:suspended"), "invited and suspended principals are covered").toBe(true);
    expect([...who].some((w) => w.startsWith("staff:")) && [...who].some((w) => w.startsWith("staff-without-keys:"))).toBe(true);
    expect(seen.some((s) => s[0].startsWith("staff:") && Number(s[1]) > 0), "a staff principal reads rows").toBe(true);
    expect(seen.filter((s) => s[0] === "stranger").every((s) => Number(s[1]) === 0)).toBe(true);
    expect(seen.find((s) => s[0] === "platform_admin")![1], "the platform admin reads every row of the sample").toBe(of("totals")[0]);
    const num = (kind: string) => of(kind).map((d) => d.split("|")).map(([w, r]) => [w, r === "denied" ? -1 : Number(r.split("=")[1])] as const);
    expect(num("update").some(([w, n]) => w.startsWith("staff:") && n > 0), "some staff can update rows").toBe(true);
    expect(num("delete").some(([w, n]) => w.startsWith("staff:") && n > 0), "some staff can delete rows (undone)").toBe(true);
    expect(num("update").filter(([w]) => w === "stranger").every(([, n]) => n === 0)).toBe(true);
    expect(num("delete").filter(([w]) => w === "stranger").every(([, n]) => n === 0)).toBe(true);
    expect(num("insert-own").some(([w, n]) => w.startsWith("staff:") && n === 1), "some staff can insert for their own organization").toBe(true);
    expect(num("insert-other").filter(([w]) => w !== "platform_admin").every(([, n]) => n === -1), "nobody but the platform admin inserts for another organization").toBe(true);
    expect(num("move-other").filter(([w]) => w !== "platform_admin").every(([, n]) => n <= 0), "WITH CHECK refuses moving a row to another organization (denied) for everyone but the platform admin").toBe(true);
    expect(num("move-other").some(([w, n]) => w.startsWith("staff:") && n === -1), "WITH CHECK really fires for some staff").toBe(true);
  });

  it("catalog: exactly one SELECT policy and one ALL policy, PUBLIC, permissive, no per-row permission helper, an uncorrelated admin sub-select in each USING (and in the WITH CHECK), table ACL unchanged", () => {
    const pol = of("policy").map((d) => d.split("~"));
    expect(pol.map((p) => p[0]).sort()).toEqual(["fiscal_years_manage", "fiscal_years_select_permission"]);
    for (const p of pol) expect(p.slice(1, 5), p[0]).toEqual([p[0] === "fiscal_years_manage" ? "cmd=*" : "cmd=r", "permissive=true", "roles=PUBLIC", "per_row_helper=false"]);
    expect(pol.find((p) => p[0] === "fiscal_years_manage")![5], "the ALL policy keeps its WITH CHECK").toBe("has_check=true");
    expect(pol.find((p) => p[0] === "fiscal_years_select_permission")![5]).toBe("has_check=false");
    const subs = of("admin-subselect").map((d) => d.split("~"));
    const per = new Map<string, number>();
    for (const [name, part, text] of subs) {
      expect(text, `${name} ${part}: the sub-select must not reference the row`).not.toMatch(/organization_id|\bid\b/);
      per.set(`${name}/${part}`, (per.get(`${name}/${part}`) ?? 0) + 1);
    }
    for (const key of ["fiscal_years_select_permission/using", "fiscal_years_manage/using", "fiscal_years_manage/check"]) expect(per.get(key), key).toBe(1);
    expect(of("acl")[0], "the table ACL is unchanged").toBe(ACL_BEFORE);
  });

  it("plans: an InitPlan executed at most once and no per-row is_platform_admin in any Filter, for a regular user, the platform admin and a stranger", () => {
    const plans = of("plan").map((d) => d.split("~"));
    const who = new Set(plans.map((p) => p[0]));
    expect([...who].some((w) => w.startsWith("staff:")) && who.has("platform_admin") && who.has("stranger")).toBe(true);
    for (const w of who) {
      const ls = plans.filter((p) => p[0] === w).sort((a, b) => a[1].localeCompare(b[1])).map((p) => p.slice(2).join("~"));
      expect(ls.join(String.fromCharCode(10)), `${w}: InitPlan present`).toMatch(/InitPlan \d+/);
      const results = ls.map((l, k) => (/^\s*InitPlan \d+/.test(l) ? ls[k + 1] : null)).filter((l): l is string => l !== null);
      for (const r of results) expect(r, `${w}: an InitPlan must run at most once`).toMatch(/Result \((actual rows=1 loops=1|never executed)\)/);
      expect(results.some((r) => /actual rows=1 loops=1/.test(r)), `${w}: at least one InitPlan ran, once`).toBe(true);
      expect(ls.filter((l) => /Filter:/.test(l)).join(" "), `${w}: no per-row is_platform_admin`).not.toMatch(/is_platform_admin/);
    }
  });
});
