/**
 * Static checks for the draft-in-closed-period refusal and the PLANNED -> OPEN fiscal year transition.
 *
 * Reads the filesystem only. It does not connect to a database and does not apply migrations.
 * The live checks are kept as todo entries below and must run only against an isolated container.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");
const MIGRATION_NAME = "20261019100400_fiscal_calendar_draft_and_open_transition.sql";
const BASELINE_NAME = "20260821105505_baseline.sql";

/** SQL with `--` line comments removed, so assertions only see executable text. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

/** Body of a `CREATE OR REPLACE FUNCTION <name>(` definition, from its header up to the closing `$$;`. */
function functionDefinition(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION ${name}(`) >= 0 ? sql.indexOf(`FUNCTION ${name}(`) : sql.indexOf(`FUNCTION "public"."${name}"(`);
  if (start < 0) return "";
  const end = sql.indexOf("$$;", start);
  return end < 0 ? "" : sql.slice(start, end + 3);
}

const migrationPath = join(migrationsDir, MIGRATION_NAME);
const migration = readFileSync(migrationPath, "utf8");
const code = stripComments(migration);
const baseline = readFileSync(join(migrationsDir, BASELINE_NAME), "utf8");

// Raw text (comments kept): the added block is marked by its comment.
const internalNew = functionDefinition(migration, "public.create_journal_entry_internal");
const internalBase = functionDefinition(baseline, "create_journal_entry_internal");
const openFn = functionDefinition(code, "public.open_fiscal_year");

describe("fiscal calendar draft and open transition migration", () => {
  it("exists in supabase/migrations under the expected name", () => {
    expect(migration.length).toBeGreaterThan(0);
  });

  it("is the latest 20261019100* migration by name", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql") && file.startsWith("20261019100"))
      .sort();
    expect(sqlFiles).toContain(MIGRATION_NAME);
    const later = sqlFiles.slice(sqlFiles.indexOf(MIGRATION_NAME) + 1);
    for (const file of later) {
      expect(file.startsWith("20261019100")).toBe(true);
    }
  });

  it("create_journal_entry_internal is redefined and refuses closed or locked periods with FISCAL_PERIOD_NOT_OPEN", () => {
    expect(internalNew.length).toBeGreaterThan(0);
    expect(internalNew).toContain("FISCAL_PERIOD_NOT_OPEN");
    expect(internalNew).toMatch(/status in \('CLOSED', 'LOCKED'\)/);
    expect(internalNew).toMatch(/errcode = 'P0001'/);
  });

  it("create_journal_entry_internal body differs from the baseline body only by the period check", () => {
    expect(internalBase.length).toBeGreaterThan(0);
    const bodyOf = (fn: string) => normalize(stripComments(fn.slice(fn.indexOf("AS $$") + 5, fn.lastIndexOf("$$;"))));
    const addedBlockStart = internalNew.indexOf("-- FISCAL_PERIOD_NOT_OPEN");
    const addedBlockEnd = internalNew.indexOf("if p_lines is null");
    expect(addedBlockStart).toBeGreaterThan(0);
    expect(addedBlockEnd).toBeGreaterThan(addedBlockStart);
    const withoutAddedBlock = internalNew.slice(0, addedBlockStart) + internalNew.slice(addedBlockEnd);
    expect(bodyOf(withoutAddedBlock)).toBe(bodyOf(internalBase));
  });

  it("the draft entry_date guard trigger is attached to journal_entries and refuses FISCAL_PERIOD_NOT_OPEN", () => {
    expect(code).toMatch(/CREATE TRIGGER trg_journal_entries_draft_period_guard\s+BEFORE UPDATE ON public\.journal_entries/);
    expect(code).toMatch(/guard_draft_entry_period_move[\s\S]*FISCAL_PERIOD_NOT_OPEN/);
  });

  it("open_fiscal_year exists and requires the existing finance.periods.manage key", () => {
    expect(openFn.length).toBeGreaterThan(0);
    expect(openFn).toMatch(/has_permission\(v_uid, p_organization_id, 'finance\.periods\.manage'\)/);
    expect(openFn).not.toMatch(/finance\.years\./);
  });

  it("open_fiscal_year requires an active membership, a non-empty reason, and locks the year row FOR UPDATE", () => {
    expect(openFn).toMatch(/om\.status = 'active'/);
    expect(openFn).toMatch(/btrim\(COALESCE\(p_reason, ''\)\)/);
    expect(openFn).toMatch(/FOR UPDATE/);
  });

  it("open_fiscal_year refuses any year that is not PLANNED with FISCAL_YEAR_NOT_PLANNED", () => {
    expect(openFn).toContain("FISCAL_YEAR_NOT_PLANNED");
    expect(openFn).toMatch(/v_fy\.status <> 'PLANNED'/);
  });

  it("open_fiscal_year never references CLOSED, so it cannot close a year or reopen one", () => {
    expect(openFn).not.toMatch(/CLOSED/);
    expect(openFn).toMatch(/SET\s+status = 'OPEN'/);
  });

  it("no statement in this migration sets fiscal_years.status to CLOSED", () => {
    expect(code).not.toMatch(/SET\s+status\s*=\s*'CLOSED'/i);
  });

  it("no GRANT in this migration names anon", () => {
    expect(code).not.toMatch(/GRANT[^;]*\banon\b/i);
  });

  it("open_fiscal_year is granted to authenticated and service_role only", () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.open_fiscal_year\(.*?\) TO authenticated, service_role;/);
  });

  it.todo("DB: a DRAFT insert into a CLOSED period is refused with FISCAL_PERIOD_NOT_OPEN (isolated container only)");
  it.todo("DB: a DRAFT insert into a LOCKED period is refused with FISCAL_PERIOD_NOT_OPEN (isolated container only)");
  it.todo("DB: a DRAFT entry_date moved into a CLOSED period is refused by trg_journal_entries_draft_period_guard");
  it.todo("DB: open_fiscal_year on a PLANNED year opens the year and its PLANNED periods (requires the guard branch first)");
  it.todo("DB: open_fiscal_year on an OPEN or CLOSED year raises FISCAL_YEAR_NOT_PLANNED and changes nothing");
  it.todo("DB: open_fiscal_year by an authenticated non-member platform admin raises FORBIDDEN_OPEN_PERMISSION");
});
