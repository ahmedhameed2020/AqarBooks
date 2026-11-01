/**
 * Static checks for the FISCAL_YEAR_OPENED audit row: the allow-list migration and the open_fiscal_year write.
 *
 * Reads the filesystem only. It does not connect to a database and does not apply migrations.
 * The rollback proof is kept as todo entries below and must run only against an isolated, disposable container.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");
const AUDIT_MIGRATION = "20261019100500_fiscal_year_opened_audit.sql";
const OPEN_MIGRATION = "20261019100400_fiscal_calendar_draft_and_open_transition.sql";
const GUARD_MIGRATION = "20261019100100_fiscal_year_close_guards.sql";
const CORE_MIGRATION = "20261019100000_fiscal_year_closing_core.sql";
const NEW_ACTION = "FISCAL_YEAR_OPENED";

/** SQL with `--` line comments removed, so assertions only see executable text. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const read = (name: string) => readFileSync(join(migrationsDir, name), "utf8");

/** Quoted values of the check_audit_action allow-list in a migration (comments stripped). */
function whitelistOf(sql: string): string[] {
  const code = stripComments(sql);
  const match = /ADD CONSTRAINT check_audit_action CHECK \(action = ANY \(ARRAY\[([\s\S]*?)\]\)\)/.exec(code);
  expect(match, "check_audit_action ADD CONSTRAINT with ARRAY list").not.toBeNull();
  return [...match![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

/** Executable body of a plpgsql function: text between its `AS $$` and the closing `$$;`. Comments stripped. */
function functionBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const decl = new RegExp(`FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\(`, "i").exec(code);
  if (!decl) return "";
  const start = code.indexOf("AS $$", decl.index);
  if (start < 0) return "";
  const end = code.indexOf("$$;", start + 5);
  return end < 0 ? "" : code.slice(start + 5, end);
}

const previousSql = read(GUARD_MIGRATION);
const previousWhitelist = whitelistOf(previousSql);
const auditSql = read(AUDIT_MIGRATION);
const auditCode = stripComments(auditSql);
const auditWhitelist = whitelistOf(auditSql);
const openBody = functionBody(read(OPEN_MIGRATION), "open_fiscal_year");
const closeBody = functionBody(read(CORE_MIGRATION), "close_fiscal_year");

describe("FISCAL_YEAR_OPENED audit allow-list migration", () => {
  it("exists in supabase/migrations and is the latest 20261019100* migration by name", () => {
    expect(auditSql.length).toBeGreaterThan(0);
    const sqlFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql") && file.startsWith("20261019100"))
      .sort();
    expect(sqlFiles[sqlFiles.length - 1]).toBe(AUDIT_MIGRATION);
  });

  it("(a) keeps every value of the previous latest allow-list and adds FISCAL_YEAR_OPENED", () => {
    expect(previousWhitelist.length).toBeGreaterThan(0);
    for (const value of previousWhitelist) {
      expect(auditWhitelist, `value ${value} must be kept`).toContain(value);
    }
    expect(auditWhitelist).toContain(NEW_ACTION);
  });

  it("(e) the whitelist has no duplicates, and its count is the previous count plus one", () => {
    expect(new Set(auditWhitelist).size).toBe(auditWhitelist.length);
    expect(auditWhitelist.length).toBe(previousWhitelist.length + 1);
  });

  it("(e) the new list equals the previous list plus FISCAL_YEAR_OPENED, and nothing else", () => {
    expect([...auditWhitelist].sort()).toEqual([...previousWhitelist, NEW_ACTION].sort());
  });

  it("drops and re-adds check_audit_action as a plain constraint, with no NOT VALID", () => {
    expect(auditCode).toMatch(/ALTER TABLE public\.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;/);
    expect(auditCode).toMatch(/ALTER TABLE public\.financial_audit_logs\s+ADD CONSTRAINT check_audit_action CHECK/);
    expect(auditCode).not.toMatch(/NOT VALID/i);
    expect(auditCode).not.toMatch(/VALIDATE CONSTRAINT/i);
  });

  it("changes no other table, grant, or function", () => {
    expect(auditCode).not.toMatch(/\bGRANT\b/i);
    expect(auditCode).not.toMatch(/\bREVOKE\b/i);
    expect(auditCode).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION/i);
    const tables = [...auditCode.matchAll(/\bON\s+TABLE\s+([\w.]+)|\bALTER TABLE\s+([\w.]+)/gi)].map((m) => m[1] ?? m[2]);
    expect([...new Set(tables)]).toEqual(["public.financial_audit_logs"]);
  });
});

describe("open_fiscal_year writes the FISCAL_YEAR_OPENED audit row", () => {
  it("(b) calls append_financial_audit_event with FISCAL_YEAR_OPENED", () => {
    expect(openBody.length).toBeGreaterThan(0);
    expect(openBody).toContain("append_financial_audit_event(");
    expect(openBody).toContain(`p_action => '${NEW_ACTION}'`);
  });

  it("(b) writes the audit row after the year status update and before RETURN", () => {
    const update = openBody.indexOf("SET status = 'OPEN'");
    const audit = openBody.indexOf(`p_action => '${NEW_ACTION}'`);
    const ret = openBody.lastIndexOf("RETURN jsonb_build_object(");
    expect(update).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(update);
    expect(ret).toBeGreaterThan(audit);
  });

  it("(b) runs the period status updates before the audit row", () => {
    const periods = openBody.indexOf("PERFORM public.set_fiscal_period_status(");
    const audit = openBody.indexOf(`p_action => '${NEW_ACTION}'`);
    expect(periods).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(periods);
  });

  it("(b) passes arguments in append_financial_audit_event order and records the previous and new status", () => {
    const call = openBody.slice(openBody.indexOf("append_financial_audit_event("));
    const order = [
      "p_organization_id =>",
      "p_action =>",
      "p_entity_type =>",
      "p_resort_id =>",
      "p_entity_id =>",
      "p_request_id =>",
      "p_ip_address =>",
      "p_user_agent =>",
      "p_metadata =>",
    ];
    const positions = order.map((key) => call.indexOf(key));
    positions.forEach((p) => expect(p).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(call).toContain("'fiscal_year_id', p_fiscal_year_id");
    expect(call).toContain("'previous_status', 'PLANNED'");
    expect(call).toContain("'new_status', 'OPEN'");
    expect(call).toContain("'reason', v_reason");
  });

  it("(c) has no EXCEPTION block and no WHEN OTHERS, so an audit failure rolls the whole call back", () => {
    // "RAISE EXCEPTION '...'" is allowed; an exception handler is "EXCEPTION WHEN ..." (a BEGIN/EXCEPTION block).
    expect(openBody).not.toMatch(/\bEXCEPTION\s+WHEN\b/i);
    expect(openBody).not.toMatch(/\bWHEN\s+OTHERS\b/i);
  });

  it("open_fiscal_year still never references CLOSED", () => {
    expect(openBody).not.toMatch(/CLOSED/);
  });
});

describe("close_fiscal_year keeps its audit row", () => {
  it("(d) still calls append_financial_audit_event with FISCAL_YEAR_CLOSED", () => {
    expect(closeBody.length).toBeGreaterThan(0);
    expect(closeBody).toContain("append_financial_audit_event(");
    expect(closeBody).toContain("p_action => 'FISCAL_YEAR_CLOSED'");
  });
});

describe("FISCAL_YEAR_OPENED database proof (isolated container only)", () => {
  it.todo("DB: open_fiscal_year on a PLANNED year writes one financial_audit_logs row with action FISCAL_YEAR_OPENED");
  it.todo("DB: if the audit insert fails, open_fiscal_year raises, and the period and year status updates are rolled back");
  it.todo("DB: after 20261019100500 is applied, financial_audit_logs accepts FISCAL_YEAR_OPENED and still accepts every previous value");
});
