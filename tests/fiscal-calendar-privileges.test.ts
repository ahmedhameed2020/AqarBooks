/**
 * Static checks for the fiscal calendar TRUNCATE revoke migration.
 *
 * Reads the filesystem only. It does not connect to a database and does not apply migrations.
 * The live privilege check is kept as a todo below and must run only against an isolated container.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");
const MIGRATION_NAME = "20261019100300_fiscal_calendar_truncate_revoke.sql";
const migrationPath = join(migrationsDir, MIGRATION_NAME);
const TABLES = ["public.fiscal_years", "public.fiscal_periods"];
const ROLES = ["anon", "authenticated", "service_role"];

/** SQL with `--` line comments removed, so assertions only see executable text. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const migration = readFileSync(migrationPath, "utf8");
const code = stripComments(migration);
const statements = code
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter((statement) => statement.length > 0);

describe("fiscal calendar TRUNCATE revoke migration", () => {
  it("exists in supabase/migrations under the expected name", () => {
    expect(migration.length).toBeGreaterThan(0);
  });

  it("is present in the directory and every later migration belongs to the same fiscal-calendar series", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    expect(sqlFiles).toContain(MIGRATION_NAME);
    const later = sqlFiles.slice(sqlFiles.indexOf(MIGRATION_NAME) + 1);
    for (const file of later) {
      expect(file.startsWith("20261019100")).toBe(true);
    }
  });

  it("contains exactly one REVOKE TRUNCATE statement per fiscal table", () => {
    const revokes = statements.filter((statement) => /^REVOKE\b/i.test(statement));
    expect(revokes).toHaveLength(TABLES.length);
    for (const table of TABLES) {
      const matching = revokes.filter((statement) => statement.startsWith(`REVOKE TRUNCATE ON TABLE ${table} FROM `));
      expect(matching, `REVOKE TRUNCATE for ${table}`).toHaveLength(1);
    }
  });

  it("revokes TRUNCATE from exactly anon, authenticated and service_role on both tables", () => {
    const revokes = statements.filter((statement) => /^REVOKE\b/i.test(statement));
    for (const revoke of revokes) {
      const match = /^REVOKE TRUNCATE ON TABLE (\S+) FROM (.+)$/i.exec(revoke);
      expect(match, `unexpected REVOKE shape: ${revoke}`).not.toBeNull();
      const roles = match![2]
        .split(",")
        .map((role) => role.trim())
        .sort();
      expect(roles).toEqual([...ROLES].sort());
    }
  });

  it("does not revoke from postgres (the owner) or PUBLIC", () => {
    const revokes = statements.filter((statement) => /^REVOKE\b/i.test(statement));
    for (const revoke of revokes) {
      expect(revoke).not.toMatch(/\bpostgres\b/i);
      expect(revoke).not.toMatch(/\bPUBLIC\b/);
    }
  });

  it("names no table other than the two fiscal tables", () => {
    const namedTables = [...code.matchAll(/\bON\s+TABLE\s+([\w.]+)/gi)].map((m) => m[1]);
    expect(namedTables.sort()).toEqual([...TABLES].sort());
    expect(code).not.toMatch(/\bfiscal_year_closings\b/);
  });

  it("never grants TRUNCATE or ALL on any object", () => {
    expect(code).not.toMatch(/\bGRANT\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b[^;]*\bTO\b/i);
  });

  it("adds no policy and no default-privilege change", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
    expect(code).not.toMatch(/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i);
  });

  it("only contains the two REVOKE statements (no other DDL or DML)", () => {
    expect(statements).toHaveLength(TABLES.length);
  });

  // Requires an isolated, disposable Postgres container with the migrations applied in order.
  // Must not run against the production or shared database.
  it.todo(
    "has_table_privilege(role, 'public.fiscal_years' | 'public.fiscal_periods', 'TRUNCATE') is false for anon, authenticated and service_role",
  );
});
