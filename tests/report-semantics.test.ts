/**
 * Static checks for report semantics. Reads files as text only; no database is contacted and no SQL is executed.
 * SQL comments are stripped before matching, so a comment cannot satisfy an assertion.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOC = join("docs", "progress", "report-semantics.md");
const MIGRATIONS = join("supabase", "migrations");

/** Remove `-- ...` line comments, then collapse all whitespace runs to one space. */
function stripSql(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Body of the latest migration (by file name; names start with a timestamp) that defines the function.
 * The body runs from the CREATE marker to the closing dollar quote.
 */
function latestDefinition(createMarker: string): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = stripSql(readFileSync(join(MIGRATIONS, file), "utf8"));
    const start = sql.indexOf(createMarker);
    if (start === -1) continue;
    const end = sql.indexOf("$$;", start);
    found = { file, body: sql.slice(start, end === -1 ? undefined : end) };
  }
  if (!found) throw new Error(`no migration defines: ${createMarker}`);
  return found;
}

describe("report-semantics document", () => {
  it("exists and states both formulas", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc.length).toBeGreaterThan(0);
    expect(doc).toMatch(/HIST_IS\(FY, a\)\s*=/);
    expect(doc).toMatch(/BOOK_TEMP\(FY, a\)\s*=/);
  });

  it("names both report functions and the closing source type", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("get_trial_balance(");
    expect(doc).toContain("get_trial_balance_with_opening");
    expect(doc).toContain("YEAR_END_CLOSING");
  });
});

describe("get_trial_balance (latest definition)", () => {
  const def = latestDefinition("CREATE OR REPLACE FUNCTION public.get_trial_balance(");

  it("is defined in a timestamped migration", () => {
    expect(def.file).toMatch(/^\d{14}_.*\.sql$/);
  });

  it("excludes YEAR_END_CLOSING only for REVENUE and EXPENSE accounts", () => {
    expect(def.body).toMatch(
      /\(a\.category NOT IN \('REVENUE', 'EXPENSE'\) OR je\.source_type IS DISTINCT FROM 'YEAR_END_CLOSING'\)/,
    );
  });

  it("references YEAR_END_CLOSING exactly once and source_type exactly once", () => {
    expect(def.body.split("YEAR_END_CLOSING").length - 1).toBe(1);
    expect(def.body.split("source_type").length - 1).toBe(1);
  });
});

describe("get_trial_balance_with_opening (latest definition)", () => {
  const def = latestDefinition("CREATE OR REPLACE FUNCTION public.get_trial_balance_with_opening(");

  it("has no YEAR_END_CLOSING exclusion", () => {
    expect(def.body).not.toContain("YEAR_END_CLOSING");
    expect(def.body).not.toContain("source_type");
  });
});
