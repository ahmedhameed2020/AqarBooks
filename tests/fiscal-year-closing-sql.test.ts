/**
 * Static checks for the fiscal-year closing migrations. Reads the SQL as text only; nothing is executed.
 * SQL comments are stripped before matching, so a comment cannot satisfy an assertion.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join("supabase", "migrations");
const CORE_FILE = "20261019100000_fiscal_year_closing_core.sql";
const GUARD_FILE = "20261019100100_fiscal_year_close_guards.sql";
const PERM_FILE = "20261019100200_fiscal_year_close_permission_and_reports.sql";

const readMigration = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");
const raw = {
  core: readMigration(CORE_FILE),
  guards: readMigration(GUARD_FILE),
  perm: readMigration(PERM_FILE),
};

/** Remove `-- ...` line comments, then collapse all whitespace runs to one space. */
function stripSql(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

const code = {
  core: stripSql(raw.core),
  guards: stripSql(raw.guards),
  perm: stripSql(raw.perm),
};

/** Body of a plpgsql function: text between its `AS $$` and the closing `$$;`. Empty string when not defined here. */
function functionBody(sql: string, name: string): string {
  const decl = new RegExp(`FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\(`, "i").exec(sql);
  if (!decl) return "";
  const start = sql.indexOf("AS $$", decl.index);
  if (start < 0) return "";
  const end = sql.indexOf("$$;", start + 5);
  return end < 0 ? "" : sql.slice(start + 5, end);
}

/** Statement text for a CREATE TABLE, from its header to the closing `);`. */
function createTableBody(sql: string, table: string): string {
  const start = sql.indexOf(`CREATE TABLE public.${table}`);
  if (start < 0) return "";
  const end = sql.indexOf(");", start);
  return end < 0 ? "" : sql.slice(start, end + 2);
}

/** Every `EXISTS (...)` subquery in a body, with balanced parentheses. */
function existsClauses(body: string): string[] {
  const out: string[] = [];
  const re = /EXISTS\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") depth--;
    }
    out.push(body.slice(m.index, i));
  }
  return out;
}

const closeBody = functionBody(code.core, "close_fiscal_year");
const designateBody = functionBody(code.core, "designate_retained_earnings_account");
const guardBody = functionBody(code.guards, "guard_fiscal_status_write");
const setPeriodStatusBody = functionBody(code.guards, "set_fiscal_period_status");
const postBody = functionBody(code.guards, "post_journal_entry_internal");
const reverseBody = functionBody(code.guards, "reverse_journal_entry");
const trialBalanceBody = functionBody(code.perm, "get_trial_balance");

describe("fiscal year closing: core migration (close_fiscal_year and tables)", () => {
  it("close_fiscal_year is SECURITY DEFINER with a search_path that names public", () => {
    expect(code.core).toMatch(/FUNCTION public\.close_fiscal_year\(/);
    expect(code.core).toMatch(/SECURITY DEFINER SET search_path = public, pg_temp AS \$\$/);
    expect(code.core).toMatch(/REVOKE ALL ON FUNCTION public\.close_fiscal_year\(uuid, uuid, uuid, text, text\) FROM PUBLIC, anon;/);
    expect(closeBody.length).toBeGreaterThan(0);
  });

  it("close_fiscal_year takes the advisory lock before reading the year", () => {
    expect(closeBody).toContain("pg_advisory_xact_lock(");
    expect(closeBody.indexOf("pg_advisory_xact_lock(")).toBeLessThan(closeBody.indexOf("FROM public.fiscal_years"));
  });

  it("close_fiscal_year locks the fiscal_years row FOR UPDATE", () => {
    expect(closeBody).toMatch(/FROM public\.fiscal_years WHERE[^;]*?FOR UPDATE/);
  });

  it("close_fiscal_year locks fiscal_periods FOR UPDATE ordered by id", () => {
    expect(closeBody).toMatch(/FROM public\.fiscal_periods WHERE[^;]*?ORDER BY id FOR UPDATE/);
  });

  it("close_fiscal_year runs the idempotency branch before the ALREADY_CLOSED branch", () => {
    const idempotent = closeBody.indexOf("'already_closed', true");
    const alreadyClosed = closeBody.indexOf("'ALREADY_CLOSED'");
    expect(idempotent).toBeGreaterThan(-1);
    expect(alreadyClosed).toBeGreaterThan(-1);
    expect(idempotent).toBeLessThan(alreadyClosed);
  });

  it("close_fiscal_year returns error codes as string literals and never exposes SQLERRM", () => {
    expect(closeBody).toMatch(/'error_code', 'INVALID_INPUT'/);
    expect(closeBody).toMatch(/'error_code', 'ALREADY_CLOSED'/);
    expect(closeBody).not.toContain("SQLERRM");
  });

  it("close_fiscal_year sets aqar.fiscal_write_context to close_fiscal_year before updating status to CLOSED", () => {
    const ctx = closeBody.indexOf("set_config('aqar.fiscal_write_context', 'close_fiscal_year', true)");
    const update = closeBody.indexOf("SET status = 'CLOSED'");
    expect(ctx).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(-1);
    expect(ctx).toBeLessThan(update);
  });

  it("close_fiscal_year writes the FISCAL_YEAR_CLOSED audit row after the status update, with no exception handler", () => {
    expect(closeBody).toContain("append_financial_audit_event(");
    expect(closeBody).toContain("p_action => 'FISCAL_YEAR_CLOSED'");
    const audit = closeBody.indexOf("p_action => 'FISCAL_YEAR_CLOSED'");
    expect(audit).toBeGreaterThan(closeBody.indexOf("SET status = 'CLOSED'"));
    expect(audit).toBeLessThan(closeBody.lastIndexOf("RETURN jsonb_build_object("));
    expect(closeBody).not.toMatch(/\bEXCEPTION\s+WHEN\b/i);
    expect(closeBody).not.toMatch(/\bWHEN\s+OTHERS\b/i);
  });

  it("fiscal_year_closings has UNIQUE on fiscal_year_id and UNIQUE on (organization_id, operation_key)", () => {
    const table = createTableBody(code.core, "fiscal_year_closings");
    expect(table).toMatch(/UNIQUE \(fiscal_year_id\)/);
    expect(table).toMatch(/UNIQUE \(organization_id, operation_key\)/);
  });

  it("fiscal_year_closings has row level security enabled", () => {
    expect(code.core).toMatch(/ALTER TABLE public\.fiscal_year_closings ENABLE ROW LEVEL SECURITY;/);
  });

  it("fiscal_year_closings revokes INSERT, UPDATE and DELETE from client roles", () => {
    expect(code.core).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.fiscal_year_closings FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });

  it("fiscal_year_closings has no INSERT, UPDATE or DELETE policy", () => {
    expect(code.core).not.toMatch(/CREATE POLICY \S+ ON public\.fiscal_year_closings\s+FOR (INSERT|UPDATE|DELETE)/i);
  });

  it("journal_entries.source_type check keeps the three existing values and adds YEAR_END_CLOSING", () => {
    const start = code.core.indexOf("ADD CONSTRAINT journal_entries_source_type_check");
    expect(start).toBeGreaterThan(-1);
    const constraint = code.core.slice(start, start + 400);
    expect(constraint).toContain("'JOURNAL_VOUCHER'");
    expect(constraint).toContain("'RECEIPT_VOUCHER'");
    expect(constraint).toContain("'PAYMENT_VOUCHER'");
    expect(constraint).toContain("'YEAR_END_CLOSING'");
  });

  it("designate_retained_earnings_account requires the finance.years.close permission", () => {
    expect(designateBody).toMatch(/has_permission\(v_uid, p_organization_id, 'finance\.years\.close'\)/);
  });

  it("designate_retained_earnings_account clears the flag on other accounts before setting it", () => {
    const clear = designateBody.indexOf("SET is_retained_earnings = false");
    const set = designateBody.indexOf("SET is_retained_earnings = true");
    expect(clear).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(set);
    expect(designateBody).toMatch(/AND id <> p_account_id/);
  });
});

describe("fiscal year closing: guard migration (direct-write blocking and state checks)", () => {
  it("the guard trigger function references aqar.fiscal_write_context and FISCAL_STATUS_DIRECT_WRITE_BLOCKED", () => {
    expect(guardBody.length).toBeGreaterThan(0);
    expect(guardBody).toContain("aqar.fiscal_write_context");
    expect(guardBody).toContain("FISCAL_STATUS_DIRECT_WRITE_BLOCKED");
  });

  it("the guard trigger is attached to fiscal_periods", () => {
    expect(code.guards).toMatch(
      /CREATE TRIGGER trg_fiscal_periods_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public\.fiscal_periods FOR EACH ROW EXECUTE FUNCTION public\.guard_fiscal_status_write/,
    );
  });

  it("the guard trigger is attached to fiscal_years", () => {
    expect(code.guards).toMatch(
      /CREATE TRIGGER trg_fiscal_years_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public\.fiscal_years FOR EACH ROW EXECUTE FUNCTION public\.guard_fiscal_status_write/,
    );
  });

  it("set_fiscal_period_status locks the period row FOR UPDATE and checks organization_is_active", () => {
    expect(setPeriodStatusBody).toMatch(/where id = p_fiscal_period_id for update/i);
    expect(setPeriodStatusBody).toContain("public.organization_is_active(");
  });

  it("post_journal_entry_internal reads the period FOR SHARE", () => {
    expect(postBody).toMatch(/from public\.fiscal_periods where id = v_entry\.fiscal_period_id for share/i);
  });

  it("reverse_journal_entry refuses closed-period entries and closing entries", () => {
    expect(reverseBody).toContain("ENTRY_IN_CLOSED_PERIOD");
    expect(reverseBody).toContain("CLOSING_ENTRY_NOT_REVERSIBLE");
  });

  it("the audit allow-list adds FISCAL_YEAR_CLOSED and FISCAL_PERIOD_STATUS_CHANGED", () => {
    const start = code.guards.indexOf("ADD CONSTRAINT check_audit_action");
    expect(start).toBeGreaterThan(-1);
    const constraint = code.guards.slice(start, code.guards.indexOf("NOT VALID", start));
    expect(constraint).toContain("'FISCAL_YEAR_CLOSED'");
    expect(constraint).toContain("'FISCAL_PERIOD_STATUS_CHANGED'");
  });

  it("the guard DELETE branch raises FISCAL_CLOSED_RECORD_DELETE_BLOCKED and is gated on pg_trigger_depth()", () => {
    expect(guardBody).toContain("FISCAL_CLOSED_RECORD_DELETE_BLOCKED");
    expect(guardBody).toContain("pg_trigger_depth() > 0");
  });
});

describe("fiscal year closing: permission and trial balance migration", () => {
  it("registers finance.years.close in permissions with ON CONFLICT", () => {
    expect(code.perm).toMatch(
      /insert into public\.permissions \(key, description\) values \('finance\.years\.close', [^)]*\) on conflict \(key\) do nothing/i,
    );
  });

  it("finance.years.close is granted to the TENANT_OWNER template only, never to FINANCE_MANAGER or live roles", () => {
    const grantStatements = code.perm.match(/insert into public\.role(_template)?_permissions[^;]*;/gi) ?? [];
    const closeGrants = grantStatements.filter((s) => s.includes("finance.years.close"));
    expect(closeGrants).toHaveLength(1);
    expect(closeGrants[0]).toContain("insert into public.role_template_permissions");
    expect(closeGrants[0]).toContain("select 'TENANT_OWNER', 'finance.years.close'");
    expect(code.perm).not.toMatch(/FINANCE_MANAGER/);
    expect(code.perm).not.toMatch(/insert into public\.role_permissions[^;]*finance\.years\.close/i);
  });

  it("get_trial_balance is redefined with a YEAR_END_CLOSING filter inside an EXISTS on REVENUE or EXPENSE", () => {
    expect(code.perm).toMatch(/FUNCTION public\.get_trial_balance\(/);
    const matching = existsClauses(trialBalanceBody).filter(
      (clause) => clause.includes("YEAR_END_CLOSING") && /REVENUE|EXPENSE/.test(clause),
    );
    expect(matching.length).toBeGreaterThan(0);
  });

  it("get_trial_balance_with_opening is not redefined in this file", () => {
    expect(code.perm).not.toMatch(/FUNCTION\s+(?:"?public"?\.)?"?get_trial_balance_with_opening"?\s*\(/i);
  });
});

describe("fiscal year closing: cross-file consistency", () => {
  it("every migration referenced by its 14-digit timestamp exists in supabase/migrations", () => {
    const present = readdirSync(MIGRATIONS);
    const referenced = new Set<string>();
    for (const sql of [raw.core, raw.guards, raw.perm]) {
      for (const m of sql.matchAll(/\b(20\d{12})\b/g)) referenced.add(m[1]);
    }
    expect(referenced.size).toBeGreaterThan(0);
    const missing = [...referenced].filter((ts) => !present.some((f) => f.startsWith(ts)));
    expect(missing).toEqual([]);
  });

  it("the TypeScript calculator referenced by the core migration exists", () => {
    expect(raw.core).toContain("lib/accounting/fiscal-year-closing.ts");
    expect(existsSync(join("lib", "accounting", "fiscal-year-closing.ts"))).toBe(true);
  });

  it("the close function name is defined in core and used as the write context in guards", () => {
    expect(code.core).toMatch(/FUNCTION public\.close_fiscal_year\(/);
    expect(code.guards).toContain("'close_fiscal_year'");
    expect(guardBody).toContain("'close_fiscal_year'");
  });

  it("the context value close_fiscal_year appears in both the core and the guard files", () => {
    expect(code.core).toContain("'close_fiscal_year'");
    expect(code.guards).toContain("'close_fiscal_year'");
  });

  it("set_fiscal_period_status sets its own write context in the guard file; the guard accepts it", () => {
    expect(setPeriodStatusBody).toContain("set_config('aqar.fiscal_write_context', 'set_fiscal_period_status', true)");
    expect(guardBody).toContain("v_context = 'set_fiscal_period_status'");
  });

  it("close_fiscal_year sets the close_fiscal_year write context in the core file; the guard accepts it", () => {
    expect(closeBody).toContain("set_config('aqar.fiscal_write_context', 'close_fiscal_year', true)");
    expect(guardBody).toContain("v_context = 'close_fiscal_year'");
  });
});

describe("fiscal year closing: known gaps (documented, not yet tested)", () => {
  it.todo("integration: two concurrent close_fiscal_year calls for the same year serialize and yield one closing row");
  it.todo("integration: direct UPDATE of fiscal_years.status through PostgREST is blocked by the guard trigger");
  it.todo("audit: the FISCAL_YEAR_CLOSED row is actually written to financial_audit_logs by close_fiscal_year (static call exists; the row is not verified)");
});
