// Rollout-order test for the replace_role_permissions_atomic signature change (LOCAL scratch PostgreSQL only).
//
// Run with the three Phase 1 / 1.1 / 1.2 migrations AND EVERYTHING AFTER THEM (20261009120000 onward) NOT replayed into the template (Phase 2 onward
// calls has_any_permission(), which Phase 1.2 creates, so skipping only the three makes the replay fail at 20261010120000), so each case can
// apply them itself in a chosen order and call the function the way an OLD and a NEW application build
// would (old = 3 arguments, new = 4 arguments with the acting user):
//
//   SKIP_MIGRATIONS=<EVERY migration from 20261009120000_phase1_financial_report_authz.sql onward, comma separated> \
//   PG_BIN=<postgres bin dir> node scripts/local-db/run-sql-tests.mjs tests/role-permissions-rollout.local-sql.test.ts
//
// Skipped unless LOCAL_PG_PORT is set. Nothing here touches a hosted project.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = process.env.LOCAL_PG_PORT;
const PSQL = process.env.PG_BIN ? join(process.env.PG_BIN, "psql") : "psql";
const enabled = Boolean(PORT);
const MIGRATIONS = [
  "20261009120000_phase1_financial_report_authz.sql",
  "20261009130000_phase1_1_membership_roles_audit.sql",
  "20261009140000_phase1_2_finance_read_permissions.sql",
] as const;
const dir = join(process.cwd(), "supabase", "migrations");

type Who = { role?: "authenticated" | "anon" | "service_role"; uid?: string };
function run(sql: string, db: string, who: Who = {}): string {
  const claims = who.role ? `set role ${who.role};\nset request.jwt.claims to '${JSON.stringify({ sub: who.uid ?? null, role: who.role })}';\n` : "";
  return execFileSync(PSQL, ["-h", "127.0.0.1", "-p", PORT!, "-U", "postgres", "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: claims + sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function fails(sql: string, db: string, who: Who = {}): string {
  try { run(sql, db, who); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
  throw new Error("expected the statement to fail");
}
function applyMigration(name: string, db: string) {
  const sqlText = readFileSync(join(dir, name), "utf8");
  run(sqlText, db);
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1), OWNER = id(11), OUTSIDER = id(12), ROLE = id(21);
let reportsPerm = "", duesPerm = "";

const grants = (db: string) => run(`select coalesce(string_agg(permission_id::text, ',' order by permission_id::text), '') from public.role_permissions where role_id='${ROLE}'`, db);
const oldApp = (db: string, perms: string[]) =>
  `select public.replace_role_permissions_atomic('${ORG}'::uuid, '${ROLE}'::uuid, array[${perms.map((p) => `'${p}'::uuid`).join(",")}]::uuid[])`;
const newApp = (db: string, actor: string, perms: string[]) =>
  `select public.replace_role_permissions_atomic('${ORG}'::uuid, '${ROLE}'::uuid, array[${perms.map((p) => `'${p}'::uuid`).join(",")}]::uuid[], '${actor}'::uuid)`;
const threeArgBody = (db: string) => run(`select coalesce((select prosrc from pg_proc where proname='replace_role_permissions_atomic' and pronargs=3), '<none>')`, db);

const DBS: string[] = [];
function clone(label: string): string {
  const db = `aqar_rollout_${label}_${Date.now()}`;
  run(`create database ${db} template aqar_local`, "postgres");
  DBS.push(db);
  run(`
    insert into auth.users(id,email) values ('${OWNER}','owner@rollout.test'),('${OUTSIDER}','outsider@rollout.test');
    insert into public.organizations(id,name,slug,default_currency,status) values ('${ORG}','Rollout','rollout','EGP','ACTIVE');
    select public.clone_tenant_role_templates('${ORG}');
    insert into public.organization_memberships(organization_id,user_id,status) values ('${ORG}','${OWNER}','active');
    insert into public.user_role_assignments(organization_id,user_id,role_id) select '${ORG}','${OWNER}',id from public.roles where organization_id='${ORG}' and key='TENANT_OWNER';
    insert into public.roles(id,organization_id,key,name_ar,name_en) values ('${ROLE}','${ORG}','ROLLOUT_ROLE','r','r');
  `, db);
  return db;
}

describe.skipIf(!enabled)("replace_role_permissions_atomic rollout order (scratch PostgreSQL)", () => {
  beforeAll(() => {
    reportsPerm = run(`select id from public.permissions where key='finance.reports.read'`, "aqar_local");
    duesPerm = run(`select id from public.permissions where key='finance.dues.read'`, "aqar_local");
    // The template must be the pre-migration state or the ordering below proves nothing.
    expect(run(`select count(*) from pg_proc where proname='replace_role_permissions_atomic' and pronargs=4`, "aqar_local")).toBe("0");
    expect(run(`select count(*) from pg_proc where proname='replace_role_permissions_atomic' and pronargs=3`, "aqar_local")).toBe("1");
  });
  afterAll(() => { for (const db of DBS) { try { run(`drop database if exists ${db} with (force)`, "postgres"); } catch { /* ignore */ } } });

  it("intended order (120000 → 130000 → 140000): old and new builds are each handled safely at every step", () => {
    const db = clone("ordered");
    // 0. old app, old database: the original 3-argument call works
    run(oldApp(db, [reportsPerm]), db, { role: "service_role" });
    expect(grants(db)).toBe(reportsPerm);

    // 1. after 120000 the 3-argument form still exists (service_role only) and still behaves as before
    applyMigration(MIGRATIONS[0], db);
    run(oldApp(db, [duesPerm]), db, { role: "service_role" });
    expect(grants(db)).toBe(duesPerm);
    expect(fails(oldApp(db, [reportsPerm]), db, { role: "authenticated", uid: OWNER })).toMatch(/permission denied/);

    // 2. after 130000 the 3-argument form is gone: an OLD build fails closed ("does not exist"), data untouched;
    //    a NEW build works, and still checks the acting user
    applyMigration(MIGRATIONS[1], db);
    expect(fails(oldApp(db, [reportsPerm]), db, { role: "service_role" })).toMatch(/does not exist/);
    expect(grants(db)).toBe(duesPerm);
    run(newApp(db, OWNER, [reportsPerm]), db, { role: "service_role" });
    expect(grants(db)).toBe(reportsPerm);
    expect(fails(newApp(db, OUTSIDER, [duesPerm]), db, { role: "service_role" })).toMatch(/UNAUTHORIZED/);
    expect(grants(db)).toBe(reportsPerm);

    // 3. after 140000 an OLD build gets a clear, non-privileged refusal instead of "not found"
    applyMigration(MIGRATIONS[2], db);
    const refusal = fails(oldApp(db, [duesPerm]), db, { role: "service_role" });
    expect(refusal).toMatch(/SIGNATURE_RETIRED/);
    expect(grants(db)).toBe(reportsPerm);
    // ...the shim carries no logic that could be abused, and no client can call either signature
    expect(threeArgBody(db)).toMatch(/RAISE EXCEPTION/);
    expect(threeArgBody(db)).not.toMatch(/delete from|insert into/i);
    for (const call of [oldApp(db, [duesPerm]), newApp(db, OWNER, [duesPerm])]) {
      for (const role of ["authenticated", "anon"] as const) expect(fails(call, db, { role, uid: OWNER })).toMatch(/permission denied/);
    }
    // the NEW build keeps working
    run(newApp(db, OWNER, [duesPerm, reportsPerm]), db, { role: "service_role" });
    expect(grants(db).split(",").sort()).toEqual([duesPerm, reportsPerm].sort());
  });

  it("new build against the OLD database (application deployed before the migration) fails closed and never reaches the old signature", () => {
    const db = clone("newfirst");
    // 4-argument function absent: the call is an error, and nothing changes
    run(oldApp(db, [reportsPerm]), db, { role: "service_role" });
    expect(fails(newApp(db, OWNER, [duesPerm]), db, { role: "service_role" })).toMatch(/does not exist/);
    expect(grants(db)).toBe(reportsPerm);
  });

  it("contract step: dropping the shim later leaves only the guarded function", () => {
    const db = clone("contract");
    for (const m of MIGRATIONS) applyMigration(m, db);
    run(`drop function public.replace_role_permissions_atomic(uuid, uuid, uuid[])`, db);
    expect(threeArgBody(db)).toBe("<none>");
    expect(fails(oldApp(db, [duesPerm]), db, { role: "service_role" })).toMatch(/does not exist/);
    run(newApp(db, OWNER, [duesPerm]), db, { role: "service_role" });
    expect(grants(db)).toBe(duesPerm);
    expect(fails(newApp(db, OUTSIDER, [reportsPerm]), db, { role: "service_role" })).toMatch(/UNAUTHORIZED/);
  });

  it("applying 140000 before 130000 (out of order) still never leaves an unguarded 3-argument function", () => {
    const db = clone("outoforder");
    applyMigration(MIGRATIONS[0], db);
    applyMigration(MIGRATIONS[2], db); // shim replaces the old body first
    expect(fails(oldApp(db, [duesPerm]), db, { role: "service_role" })).toMatch(/SIGNATURE_RETIRED/);
    applyMigration(MIGRATIONS[1], db); // 130000 then drops the 3-argument form entirely
    expect(["<none>"].includes(threeArgBody(db)) || /RAISE EXCEPTION/.test(threeArgBody(db))).toBe(true);
    expect(grants(db)).toBe("");
    run(newApp(db, OWNER, [reportsPerm]), db, { role: "service_role" });
    expect(grants(db)).toBe(reportsPerm);
  });
});
