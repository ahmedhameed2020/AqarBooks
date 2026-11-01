import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isolatedDbContainer } from "./helpers/isolated-target";
import { LEGACY_MEMBERS_VIEW, LEGACY_UNITS_VIEW } from "./helpers/legacy-financial-views";

/**
 * Migration 20261017100800 rewrote units_with_financials / members_with_financials (LATERAL totals instead of unfiltered CTEs). It must not
 * change a single number, column, type, or the rows any principal sees. Here the pre-migration definitions are created in a throw-away schema
 * inside a transaction that is always rolled back, and compared in BOTH directions (EXCEPT ALL) with the current views:
 *   1. as the table owner (every row of the database: the fixtures include reversed allocations, advances and legacy receipts);
 *   2. as `authenticated` with the JWT claims of staff and owner principals (what each sees through RLS);
 *   3. after voiding a due that carries an allocation (total_paid must still count it while total_due does not, as before).
 * ISOLATED STACK ONLY (the sql helper refuses anything else). Nothing is written permanently.
 */
const SCRIPT = `
begin;
create schema cmp;
grant usage on schema cmp to authenticated;
create view cmp.units_old with (security_invoker = true) as ${LEGACY_UNITS_VIEW};
create view cmp.members_old with (security_invoker = true) as ${LEGACY_MEMBERS_VIEW};
grant select on cmp.units_old, cmp.members_old to authenticated;
create table cmp.res(label text, detail text);
grant all on cmp.res to authenticated;

create function cmp.compare(p_label text) returns void language plpgsql as $f$
declare a bigint; b bigint; n_u bigint; n_m bigint;
begin
  with o as materialized (select * from cmp.units_old), n as materialized (select * from public.units_with_financials)
  select (select count(*) from (select * from n except all select * from o) x), (select count(*) from (select * from o except all select * from n) x), (select count(*) from o) into a, b, n_u;
  if a <> 0 or b <> 0 then insert into cmp.res values (p_label, 'units differ: new-old=' || a || ' old-new=' || b); end if;
  with o as materialized (select * from cmp.members_old), n as materialized (select * from public.members_with_financials)
  select (select count(*) from (select * from n except all select * from o) x), (select count(*) from (select * from o except all select * from n) x), (select count(*) from o) into a, b, n_m;
  if a <> 0 or b <> 0 then insert into cmp.res values (p_label, 'members differ: new-old=' || a || ' old-new=' || b); end if;
  insert into cmp.res values ('rows', p_label || ' units=' || n_u || ' members=' || n_m);
end $f$;
grant execute on function cmp.compare(text) to authenticated;

insert into cmp.res select 'columns', t.v || ' differs' from (values ('units'), ('members')) t(v)
 where (select string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' order by attnum) from pg_attribute where attrelid = ('public.' || t.v || '_with_financials')::regclass and attnum > 0 and not attisdropped)
    is distinct from (select string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' order by attnum) from pg_attribute where attrelid = ('cmp.' || t.v || '_old')::regclass and attnum > 0 and not attisdropped);

select cmp.compare('owner:all rows');

do $d$
declare r record;
begin
  for r in (
    (select 'staff' k, om.user_id u from public.organization_memberships om join (select organization_id from public.dues group by 1 order by count(*) desc limit 4) t on t.organization_id = om.organization_id where om.status = 'active' limit 4)
    union all
    (select 'owner', m.user_id from public.members m join (select organization_id from public.payments group by 1 order by count(*) desc limit 4) t on t.organization_id = m.organization_id where m.user_id is not null limit 4)
  ) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform cmp.compare(r.k || ' ' || r.u);
    if r.k = 'staff' then
      -- isolation: nothing outside the organizations this user is an active member of
      insert into cmp.res select 'isolation-breach', r.u || ' sees ' || count(*) || ' foreign unit rows' from public.units_with_financials v
       where v.organization_id not in (select organization_id from public.organization_memberships where user_id = r.u and status = 'active') having count(*) > 0;
      insert into cmp.res select 'isolation-breach', r.u || ' sees ' || count(*) || ' foreign member rows' from public.members_with_financials v
       where v.organization_id not in (select organization_id from public.organization_memberships where user_id = r.u and status = 'active') having count(*) > 0;
      insert into cmp.res values ('isolation-checked', r.u);
    end if;
    reset role;
  end loop;
end $d$;

set local session_replication_role = replica;
create temp table pick as select d.id due_id, d.unit_id from public.effective_payment_allocations pa join public.dues d on d.id = pa.due_id where d.status <> 'VOID' limit 1;
update public.dues set status = 'VOID' where id in (select due_id from pick);
select cmp.compare('owner:after voiding a due that has an allocation');
insert into cmp.res select 'void-case', 'total_due=' || u.total_due || ' total_paid=' || u.total_paid from public.units_with_financials u join pick on pick.unit_id = u.id;
insert into cmp.res select 'fixtures', 'reversed_allocations=' || (select count(*) from public.payment_allocations where reversed_at is not null) || ' advance_payments=' || (select count(*) from public.payments where advance_amount > 0);
select label || '|' || detail from cmp.res order by label, detail;
rollback;
`;

// the pre-migration views take seconds per evaluation by design (that is the problem being fixed), so the helper's 30 s limit is too short
const sql = (script: string) =>
  execFileSync("docker", ["exec", "-i", isolatedDbContainer(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"], { input: script, encoding: "utf8", timeout: 540_000, stdio: ["pipe", "pipe", "pipe"] });

describe("financial views: the LATERAL rewrite is equivalent to the CTE definitions (migration 20261017100800)", () => {
  const lines = sql(SCRIPT).split("\n").filter((l) => l.includes("|")).map((l) => l.split("|"));

  it("no difference in columns, types, rows or numbers, for the table owner and for each staff / owner principal", () => {
    const bad = lines.filter(([label, detail]) => label === "columns" || /differ/.test(detail));
    expect(bad, bad.map((b) => b.join(": ")).join("\n")).toEqual([]);
  });

  it("isolation: a staff principal never sees a row of another organization", () => {
    expect(lines.filter(([label]) => label === "isolation-breach")).toEqual([]);
    expect(lines.filter(([label]) => label === "isolation-checked").length).toBeGreaterThanOrEqual(3);
  });

  it("is not vacuous: many rows, several principals, reversed allocations and advances present", () => {
    const rows = lines.filter(([label]) => label === "rows");
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const all = rows.find(([, d]) => d.startsWith("owner:all rows"))![1];
    expect(Number(/units=(\d+)/.exec(all)![1])).toBeGreaterThan(100);
    const fx = lines.find(([label]) => label === "fixtures")![1];
    expect(Number(/reversed_allocations=(\d+)/.exec(fx)![1])).toBeGreaterThan(0);
    expect(Number(/advance_payments=(\d+)/.exec(fx)![1])).toBeGreaterThan(0);
  });

  it("a voided due that carries an allocation still counts in total_paid but not in total_due (as before)", () => {
    const v = lines.find(([label]) => label === "void-case");
    expect(v, "the stack must hold an allocated due to void").toBeTruthy();
    expect(Number(/total_paid=([\d.]+)/.exec(v![1])![1])).toBeGreaterThan(0);
  });
});
