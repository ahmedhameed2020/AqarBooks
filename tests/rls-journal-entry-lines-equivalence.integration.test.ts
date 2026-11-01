import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isolatedDbContainer } from "./helpers/isolated-target";

/**
 * Migration 20261017101100: journal_entries AND journal_entry_lines evaluate their permission checks once per statement.
 *
 * Measured before: the lines policy is planned as one hashed sub-plan over journal_entries, whose scan paid three permission checks per entry (two from the
 * journal_entries policy, one from the lines policy); rewriting the lines policy alone gave no gain, rewriting both brought ~3 s to ~13 ms.
 *
 * This test proves the installed expressions return exactly the rows the previous ones did, for BOTH tables (not only the lines), inside a transaction that is
 * always rolled back. Copies carry only the policy under test: OLD = the previous expressions (hard-coded below), NEW = the INSTALLED expressions read from the
 * catalog (the lines expression is re-pointed at the journal_entries copy so that the nested RLS is the new one, as in production). For every principal under
 * `authenticated` the visible ids of journal_entries and of journal_entry_lines are compared in both directions. Principals: staff of every role present (with
 * and without the keys), owners, invited and suspended members, a stranger, and a platform admin created inside the transaction.
 * Also asserted: the catalog (exactly one SELECT policy per table, PUBLIC, permissive, no per-row permission helper, uncorrelated admin sub-select), the plans
 * (InitPlan executed at most once, no per-row is_platform_admin) for a regular user, the platform admin and a stranger, and that WRITES STAY DENIED on the real
 * tables (no INSERT / UPDATE / DELETE policy exists; a principal that can read rows still cannot update or delete any).
 * ISOLATED STACK ONLY; nothing is written permanently.
 */
const K = `ARRAY['finance.reports.read'::text, 'finance.entries.create'::text, 'finance.entries.review'::text, 'finance.accounts.view'::text, 'finance.audit.read'::text]`;
const JE_OLD = `(public.has_permission(auth.uid(), organization_id, 'finance.reports.read'::text) OR public.has_permission(auth.uid(), organization_id, 'finance.entries.create'::text))`;
const LINES_OLD = `EXISTS (SELECT 1 FROM cmp_jel.je_old je WHERE je.id = journal_entry_id AND public.has_any_permission(je.organization_id, ${K}))`;

const HOLDS = `exists (select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id where rp.role_id = r.id and p.key in ('finance.reports.read','finance.entries.create','finance.entries.review','finance.accounts.view','finance.audit.read'))`;
const staffQuery = `select distinct on (r.key) r.key as key, ura.user_id as u, ura.organization_id as org, ${HOLDS} as holds
      from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
      join public.organization_memberships om on om.user_id = ura.user_id and om.organization_id = ura.organization_id and om.status = 'active'
     where ura.organization_id is not null order by r.key, ura.user_id`;

const SCRIPT = `
begin;
set local statement_timeout = '480s';
set local lock_timeout = '20s';
set local search_path = public, extensions;
create schema cmp_jel;
grant usage on schema cmp_jel to authenticated;
create table cmp_jel.res(label text, detail text);
grant all on cmp_jel.res to authenticated;

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

create table cmp_jel.sample_orgs as
  select own as id from pr where own is not null
  union select id from (select id from public.organizations order by id limit 40) b
  union select id from (select id from public.organizations where status <> 'ACTIVE' order by id limit 10) c;

create table cmp_jel.je_old as select * from public.journal_entries where organization_id in (select id from cmp_jel.sample_orgs);
create table cmp_jel.je_new as select * from cmp_jel.je_old;
create table cmp_jel.l_old  as select * from public.journal_entry_lines where journal_entry_id in (select id from cmp_jel.je_old);
create table cmp_jel.l_new  as select * from cmp_jel.l_old;
alter table cmp_jel.je_old enable row level security; alter table cmp_jel.je_new enable row level security;
alter table cmp_jel.l_old enable row level security;  alter table cmp_jel.l_new enable row level security;
grant select on cmp_jel.je_old, cmp_jel.je_new, cmp_jel.l_old, cmp_jel.l_new to authenticated;
create table cmp_jel.totals as select (select count(*) from cmp_jel.je_old) je, (select count(*) from cmp_jel.l_old) lines;

create policy p on cmp_jel.je_old for select using (${JE_OLD});
create policy p on cmp_jel.l_old  for select using (${LINES_OLD});

-- the NEW expressions are the INSTALLED ones (fully qualified rendering), the lines one re-pointed at the journal_entries copy
do $d$
declare q text;
begin
  set local search_path = pg_catalog;
  select pg_get_expr(polqual, polrelid) into q from pg_policy where polname = 'journal_entries_select_permission';
  execute format('create policy p on cmp_jel.je_new for select using (%s)', q);
  select replace(replace(pg_get_expr(polqual, polrelid), 'public.journal_entries', 'cmp_jel.je_new'), 'journal_entry_lines.journal_entry_id', 'journal_entry_id') into q from pg_policy where polname = 'journal_entry_lines_select_permission';
  execute format('create policy p on cmp_jel.l_new for select using (%s)', q);
end $d$;

create function cmp_jel.compare(p_label text) returns void language plpgsql as $f$
declare jo uuid[]; jn uuid[]; lo uuid[]; ln uuid[]; a bigint; b bigint;
begin
  select coalesce(array_agg(id), '{}') into jo from cmp_jel.je_old;
  select coalesce(array_agg(id), '{}') into jn from cmp_jel.je_new;
  select coalesce(array_agg(id), '{}') into lo from cmp_jel.l_old;
  select coalesce(array_agg(id), '{}') into ln from cmp_jel.l_new;
  select count(*) into a from (select unnest(jn) except all select unnest(jo)) x; select count(*) into b from (select unnest(jo) except all select unnest(jn)) x;
  if a <> 0 or b <> 0 then insert into cmp_jel.res values ('je-differs', p_label || '|only_new=' || a::text || '|only_old=' || b::text); end if;
  select count(*) into a from (select unnest(ln) except all select unnest(lo)) x; select count(*) into b from (select unnest(lo) except all select unnest(ln)) x;
  if a <> 0 or b <> 0 then insert into cmp_jel.res values ('lines-differs', p_label || '|only_new=' || a::text || '|only_old=' || b::text); end if;
  insert into cmp_jel.res values ('seen', p_label || '|' || coalesce(array_length(jo, 1), 0)::text || '|' || coalesce(array_length(lo, 1), 0)::text);
end $f$;
grant execute on function cmp_jel.compare(text) to authenticated;

-- plans of the REAL tables (read only) and the write-denial probes on the REAL tables (rolled back with the transaction)
create function cmp_jel.plans_and_writes(p_label text) returns void language plpgsql as $f$
declare t text; l text; n int; seen bigint; d bigint; u bigint;
begin
  foreach t in array array['journal_entries','journal_entry_lines'] loop
    n := 0;
    for l in execute 'explain (analyze, costs off, timing off, summary off) select count(*) from public.' || t loop
      n := n + 1;
      insert into cmp_jel.res values ('plan', p_label || '~' || t || '~' || lpad(n::text, 3, '0') || '~' || l);
    end loop;
    execute 'select count(*) from public.' || t into seen;
    execute 'with x as (delete from public.' || t || ' returning 1) select count(*) from x' into d;
    execute 'with x as (update public.' || t || ' set id = id returning 1) select count(*) from x' into u;
    insert into cmp_jel.res values ('write-probe', p_label || '~' || t || '~visible=' || seen::text || '~deleted=' || d::text || '~updated=' || u::text);
  end loop;
end $f$;
grant execute on function cmp_jel.plans_and_writes(text) to authenticated;

do $d$
declare r record;
begin
  for r in select * from pr loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp_jel.compare(r.label);
    reset role;
  end loop;
  for r in (select * from pr where label = (select min(label) from pr where label like 'staff:%') or label in ('platform_admin','stranger')) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp_jel.plans_and_writes(r.label);
    reset role;
  end loop;
end $d$;

insert into cmp_jel.res select 'totals', je::text || '|' || lines::text from cmp_jel.totals;
insert into cmp_jel.res
  select 'admin-subselect', p.polname || '~' || m[1]
    from pg_policy p cross join lateral regexp_matches(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '[(] SELECT (.{0,6}auth[.]uid[(][)] IS NOT NULL.{0,24}is_platform_admin[(]auth[.]uid[(][)][)])', 'g') m
   where p.polname in ('journal_entries_select_permission','journal_entry_lines_select_permission');
insert into cmp_jel.res
  select 'policy', c.relname || '~' || p.polname || '~cmd=' || p.polcmd::text || '~permissive=' || p.polpermissive::text
    || '~roles=' || (select string_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end, ',') from unnest(p.polroles) r)
    || '~per_row_helper=' || ((coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ '(has_permission|has_any_permission)[(]')::text
    || '~has_check=' || (p.polwithcheck is not null)::text
  from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname in ('journal_entries','journal_entry_lines') and c.relnamespace = 'public'::regnamespace;

select label || '|' || detail from cmp_jel.res order by label, detail;
rollback;
`;

const out = () =>
  execFileSync("docker", ["exec", "-i", isolatedDbContainer(), "psql", "-U", "postgres", "-d", process.env.RLS_TEST_DB ?? "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], {
    input: SCRIPT, encoding: "utf8", timeout: 540_000, stdio: ["pipe", "pipe", "pipe"],
  });

describe("RLS: journal_entries and journal_entry_lines evaluate permissions once per statement, with the same rows as before (migration 20261017101100)", () => {
  const lines = out().split("\n").filter((l) => l.includes("|")).map((l) => { const i = l.indexOf("|"); return [l.slice(0, i), l.slice(i + 1)] as const; });
  const of = (label: string) => lines.filter(([l]) => l === label).map(([, d]) => d);

  it("no principal sees a different set of journal entries OR of journal entry lines through the installed policies", () => {
    for (const bad of ["je-differs", "lines-differs"]) expect(of(bad), bad).toEqual([]);
  });

  it("is not vacuous: every role class, invited and suspended members, owners, a stranger and the platform admin; staff really see entries and lines; the stranger sees none; the admin sees all", () => {
    const seen = of("seen").map((d) => d.split("|"));
    const who = new Set(seen.map((s) => s[0]));
    expect(who.size).toBeGreaterThanOrEqual(10);
    expect(who.has("platform_admin") && who.has("stranger") && who.has("owner")).toBe(true);
    expect(who.has("nonactive:invited") && who.has("nonactive:suspended"), "invited and suspended principals are covered").toBe(true);
    expect([...who].some((w) => w.startsWith("staff:")) && [...who].some((w) => w.startsWith("staff-without-keys:"))).toBe(true);
    expect(seen.some((s) => s[0].startsWith("staff:") && Number(s[1]) > 0 && Number(s[2]) > 0), "a staff principal sees entries and lines").toBe(true);
    expect(seen.filter((s) => s[0] === "stranger").every((s) => Number(s[1]) === 0 && Number(s[2]) === 0)).toBe(true);
    const [je, ln] = of("totals")[0].split("|");
    const admin = seen.find((s) => s[0] === "platform_admin")!;
    expect([admin[1], admin[2]], "the platform admin sees every entry and line of the sample").toEqual([je, ln]);
  });

  it("catalog: exactly one policy per table, a PUBLIC permissive SELECT policy, no per-row permission helper, an uncorrelated platform-admin sub-select; no write policy exists", () => {
    const pol = of("policy").map((d) => d.split("~"));
    expect(pol.map((p) => `${p[0]}/${p[1]}`).sort()).toEqual(["journal_entries/journal_entries_select_permission", "journal_entry_lines/journal_entry_lines_select_permission"]);
    for (const p of pol) {
      expect(p.slice(2), p[1]).toEqual(["cmd=r", "permissive=true", "roles=PUBLIC", "per_row_helper=false", "has_check=false"]);
    }
    const subs = of("admin-subselect").map((d) => d.split("~"));
    expect(new Set(subs.map((s) => s[0])), "both policies carry the admin sub-select").toEqual(new Set(["journal_entries_select_permission", "journal_entry_lines_select_permission"]));
    for (const [name, text] of subs) expect(text, `${name}: the sub-select must not reference the row`).not.toMatch(/organization_id|\bid\b|journal_entry_id|je\./);
    expect(subs.filter((x) => x[0] === "journal_entries_select_permission").length, "journal_entries: one admin sub-select").toBe(1);
    expect(subs.filter((x) => x[0] === "journal_entry_lines_select_permission").length, "journal_entry_lines: one admin sub-select").toBe(1);
  });

  it("plans: an InitPlan executed at most once, no per-row is_platform_admin in any Filter, for a regular user, the platform admin and a stranger", () => {
    const plans = of("plan").map((d) => d.split("~"));
    const who = new Set(plans.map((p) => p[0]));
    expect([...who].some((w) => w.startsWith("staff:")) && who.has("platform_admin") && who.has("stranger")).toBe(true);
    for (const w of who) for (const t of ["journal_entries", "journal_entry_lines"]) {
      const ls = plans.filter((p) => p[0] === w && p[1] === t).sort((a, b) => a[2].localeCompare(b[2])).map((p) => p.slice(3).join("~"));
      expect(ls.join(String.fromCharCode(10)), `${w} ${t}: InitPlan present`).toMatch(/InitPlan \d+/);
      const results = ls.map((l, k) => (/^\s*InitPlan \d+/.test(l) ? ls[k + 1] : null)).filter((l): l is string => l !== null);
      for (const r of results) expect(r, `${w} ${t}: an InitPlan must run at most once`).toMatch(/Result \((actual rows=1 loops=1|never executed)\)/);
      expect(results.some((r) => /actual rows=1 loops=1/.test(r)), `${w} ${t}: at least one InitPlan ran, once`).toBe(true);
      expect(ls.filter((l) => /Filter:/.test(l)).join(" "), `${w} ${t}: no per-row is_platform_admin`).not.toMatch(/is_platform_admin/);
    }
  });

  it("writes stay denied on the real tables: a principal that can read entries still updates and deletes none, and so do the platform admin and a stranger", () => {
    const probes = of("write-probe").map((d) => d.split("~"));
    expect(probes.length).toBeGreaterThanOrEqual(6); // 3 principals x 2 tables
    for (const [who, t, visible, deleted, updated] of probes) {
      expect(deleted, `${who} ${t}`).toBe("deleted=0");
      expect(updated, `${who} ${t}`).toBe("updated=0");
      if (who.startsWith("staff:") || who === "platform_admin") expect(Number(visible.split("=")[1]), `${who} ${t}: the denial is meaningful only if rows are readable`).toBeGreaterThan(0);
    }
  });
});
