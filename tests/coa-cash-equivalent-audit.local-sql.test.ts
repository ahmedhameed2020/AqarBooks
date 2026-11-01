// SQL-level test of the audit of chart_of_accounts.is_cash_equivalent (migration 20261018100000, trigger trg_coa_cash_equivalent_audit).
// Runs on a THROWAWAY local PostgreSQL with ALL repository migrations replayed (scripts/local-db/run-sql-tests.mjs); no Docker, no Supabase stack.
// Skipped unless LOCAL_PG_PORT is set:
//   PG_BIN=<postgres bin dir> node scripts/local-db/run-sql-tests.mjs tests/coa-cash-equivalent-audit.local-sql.test.ts
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = process.env.LOCAL_PG_PORT;
const PSQL = process.env.PG_BIN ? join(process.env.PG_BIN, "psql") : "psql";
const enabled = Boolean(PORT);
type Who = { role?: "authenticated" | "anon" | "service_role"; uid?: string };
const DB = `aqar_coa_audit_${Date.now()}`;

function run(sql: string, who: Who = {}, db = DB): string {
  const claims = who.role ? `set role ${who.role};\nset request.jwt.claims to '${JSON.stringify({ sub: who.uid ?? null, role: who.role })}';\n` : "";
  return execFileSync(PSQL, ["-h", "127.0.0.1", "-p", PORT!, "-U", "postgres", "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: claims + sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
const failure = (sql: string, who: Who = {}): string => {
  try { run(sql, who); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
  throw new Error("expected the statement to fail");
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1), OWNER = id(11), COLLECTOR = id(12), PROP = id(31);
const A_PLAIN = id(41), A_LINKED = id(42);
const audits = (account: string) => Number(run(`select count(*) from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${account}'`));

describe.skipIf(!enabled)("audit of is_cash_equivalent changes (scratch PostgreSQL)", () => {
  beforeAll(() => {
    run(`create database ${DB} template aqar_local`, {}, "postgres");
    run(`
      insert into auth.users(id,email) values ('${OWNER}','owner@audit.test'),('${COLLECTOR}','collector@audit.test');
      insert into public.organizations(id,name,slug,default_currency,status) values ('${ORG}','Audit','audit','EGP','ACTIVE');
      select public.clone_tenant_role_templates('${ORG}');
      insert into public.organization_memberships(organization_id,user_id,status) values ('${ORG}','${OWNER}','active'),('${ORG}','${COLLECTOR}','active');
      insert into public.user_role_assignments(organization_id,user_id,role_id) select '${ORG}','${OWNER}',id from public.roles where organization_id='${ORG}' and key='TENANT_OWNER';
      insert into public.user_role_assignments(organization_id,user_id,role_id) select '${ORG}','${COLLECTOR}',id from public.roles where organization_id='${ORG}' and key='COLLECTOR';
      insert into public.properties(id,organization_id,name,code,timezone,property_type) values ('${PROP}','${ORG}','P','P-1','Africa/Cairo','resort');
      insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_cash_equivalent) values
        ('${A_PLAIN}','${ORG}','1140','a','Plain asset','ASSET','DEBIT',false),
        ('${A_LINKED}','${ORG}','1110','c','Cash','ASSET','DEBIT',true);
      insert into public.cashboxes(organization_id,property_id,name,gl_account_id) values ('${ORG}','${PROP}','till','${A_LINKED}');
    `);
  });
  afterAll(() => { try { run(`drop database if exists ${DB} with (force)`, {}, "postgres"); } catch { /* ignore */ } });

  it("an accounts manager's flip writes exactly one row (actor, code, from, to, linked); a no-op and another column write none of this kind", () => {
    const b0 = audits(A_PLAIN);
    expect(run(`update public.chart_of_accounts set is_cash_equivalent=true where id='${A_PLAIN}' returning 1`, { role: "authenticated", uid: OWNER })).toMatch(/^1/);
    expect(audits(A_PLAIN)).toBe(b0 + 1);
    expect(run(`select actor_id::text||'|'||(safe_change_summary->>'code')||'|'||(safe_change_summary->>'from')||'|'||(safe_change_summary->>'to')||'|'||(safe_change_summary->>'linked_to_active_cashbox_or_bank') from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${A_PLAIN}'`))
      .toBe(`${OWNER}|1140|false|true|false`);
    run(`update public.chart_of_accounts set is_cash_equivalent=true where id='${A_PLAIN}'`, { role: "authenticated", uid: OWNER });
    run(`update public.chart_of_accounts set name_en='Renamed' where id='${A_PLAIN}'`, { role: "authenticated", uid: OWNER });
    expect(audits(A_PLAIN), "no-op and other-column updates").toBe(b0 + 1);
    run(`update public.chart_of_accounts set is_cash_equivalent=false where id='${A_PLAIN}'`, { role: "authenticated", uid: OWNER });
    expect(audits(A_PLAIN)).toBe(b0 + 2);
  });
  it("a privileged (no-JWT) change is recorded too, and a linked account reports linked = true", () => {
    const b0 = audits(A_LINKED);
    run(`update public.chart_of_accounts set is_cash_equivalent=false where id='${A_LINKED}'; update public.chart_of_accounts set is_cash_equivalent=true where id='${A_LINKED}'`);
    expect(audits(A_LINKED)).toBe(b0 + 2);
    expect(run(`select safe_change_summary->>'linked_to_active_cashbox_or_bank' from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${A_LINKED}' order by created_at desc, id desc limit 1`)).toBe("true");
  });
  it("write permission is not widened: a collector changes nothing and leaves no row; users cannot execute the trigger functions or write audit rows", () => {
    const b0 = audits(A_PLAIN);
    const out = run(`update public.chart_of_accounts set is_cash_equivalent=true where id='${A_PLAIN}' returning 1`, { role: "authenticated", uid: COLLECTOR });
    expect(out, "rows a collector could change").toBe("");
    expect(audits(A_PLAIN)).toBe(b0);
    expect(run(`select is_cash_equivalent from public.chart_of_accounts where id='${A_PLAIN}'`)).toBe("f");
    for (const fn of ["public.log_coa_cash_equivalent_change()", "public.validate_treasury_gl_account()"]) {
      expect(run(`select has_function_privilege('authenticated','${fn}','execute')::text||'/'||has_function_privilege('anon','${fn}','execute')::text`)).toBe("false/false");
    }
    expect(failure(`insert into public.platform_audit_logs(organization_id, action, entity_type, entity_id) values ('${ORG}','coa.cash_equivalent_changed','chart_of_account','${A_PLAIN}')`, { role: "authenticated", uid: OWNER })).toMatch(/permission denied|row-level security/i);
  });
});
