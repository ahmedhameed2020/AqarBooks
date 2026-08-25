/**
 * `lib/supabase/types.ts` must describe the database that actually exists.
 *
 * WHY THIS EXISTS
 * Two failures, both already paid for:
 *
 *   1. Phantom columns. The demo seed was written against `members.code`,
 *      `members.full_name_en` and `members.primary_phone`. None of them exist.
 *      The generated types caught it at compile time -- but only because the
 *      types were accurate. A `.select()` naming a column that is not there is
 *      a PostgREST 400 and a dead screen, which this repository has shipped
 *      before.
 *
 *   2. Hand-edits. `organizations.is_demo` was added to types.ts by hand,
 *      because no `supabase gen types` was available: the CLI is installed but
 *      holds no access token and the database password is not on this machine.
 *      A hand-edit is a claim about the database that nothing verified.
 *
 * So this compares the two directly. PostgREST publishes the live column set
 * for every exposed relation in its OpenAPI document; the generated types
 * declare what the application believes. Where they disagree, the application
 * is wrong.
 *
 * READ-ONLY. It fetches one document and reads one file.
 *
 * WHY ONLY SOME TABLES
 * The full comparison would flag dozens of pre-existing differences that have
 * nothing to do with the demo and would drown the signal on day one. The list
 * below is every table the demo actually reads or writes, plus the two that
 * were hand-edited. Widening it is a good idea and a separate piece of work.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = Boolean(url && serviceKey);

/** Tables the demo depends on. A mismatch here breaks the demo, not something else. */
const CHECKED = [
  "organizations",
  "properties",
  "zones",
  "buildings",
  "units",
  "members",
  "unit_ownerships",
  "unit_leases",
  "due_types",
  "chart_of_accounts",
  "fiscal_periods",
  "banks",
  "bank_accounts",
  "dues",
  "payments",
  "journal_entries",
] as const;

let live: Map<string, Set<string>> | null = null;

beforeAll(async () => {
  if (!CONFIGURED) return;
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const spec = (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
  const definitions = spec.definitions ?? {};
  live = new Map(
    Object.entries(definitions).map(([table, def]) => [
      table,
      new Set(Object.keys(def.properties ?? {})),
    ]),
  );
});

/**
 * The column names a table's `Row` declares in the generated types.
 *
 * Parsed rather than imported: the file is a type declaration, so the names
 * exist only at compile time and cannot be enumerated at runtime.
 */
function declaredRowColumns(source: string, table: string): Set<string> | null {
  const start = source.indexOf(`      ${table}: {`);
  if (start === -1) return null;
  const rowStart = source.indexOf("Row: {", start);
  if (rowStart === -1) return null;

  // Brace-matched, not indentation-matched. The first version assumed every
  // Row spans multiple lines at a fixed indent; `zones` declares its Row on
  // ONE line, so the parser found no columns there and ran on into the next
  // table -- reporting buildings' columns as phantom columns of zones. The
  // failure looked exactly like real drift, which is precisely why a schema
  // checker must match structure rather than layout.
  const open = source.indexOf("{", rowStart);
  let depth = 0;
  let close = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const block = source.slice(open + 1, close);

  // Top-level keys only: a nested object type would otherwise contribute its
  // own keys as though they were columns.
  const columns = new Set<string>();
  let nesting = 0;
  for (const segment of block.split(/[;\n]/)) {
    const opens = (segment.match(/\{/g) ?? []).length;
    const closes = (segment.match(/\}/g) ?? []).length;
    if (nesting === 0) {
      const m = /^\s*([a-z_0-9]+)\s*\??\s*:/.exec(segment);
      if (m) columns.add(m[1]!);
    }
    nesting += opens - closes;
  }
  return columns;
}


describe.skipIf(!CONFIGURED)("generated types match the live schema", () => {
  const source = readFileSync("lib/supabase/types.ts", "utf8");

  it("read the live schema (guards against a vacuous pass)", () => {
    expect(live, "no OpenAPI document").not.toBeNull();
    expect(live!.size, "PostgREST returned no definitions").toBeGreaterThan(50);
  });

  it("declares no column the database does not have", () => {
    // The phantom-column failure, inverted into a check. A column named here
    // and absent there is a 400 waiting for the first query that selects it.
    const phantom: string[] = [];
    for (const table of CHECKED) {
      const declared = declaredRowColumns(source, table);
      const actual = live!.get(table);
      if (!declared || !actual) continue;
      for (const column of declared) {
        if (!actual.has(column)) phantom.push(`${table}.${column}`);
      }
    }
    expect(phantom, "columns declared in types.ts that do not exist in the database").toEqual([]);
  });

  it("gains no NEW undeclared column", () => {
    // The reverse direction. Less dangerous -- code cannot use a column it
    // cannot name -- but it is how a hand-edited file falls behind, and it is
    // how `is_demo` would have been missed had it not been added by hand.
    //
    // A clean zero is the wrong target here. lib/supabase/types.ts is a
    // CURATED subset, not `supabase gen types` output: it has always omitted
    // audit metadata (created_at, created_by, updated_at) on tables where the
    // application never reads it. Demanding those be declared would be
    // demanding the file become something it is not.
    //
    // So the current gap is frozen instead. Everything below is a pre-existing
    // omission, verified as metadata-only. Anything NEW fails -- which is the
    // property that actually protects against a column being added to the
    // database and not to the types.
    const KNOWN_OMISSIONS = new Set([
      "zones.created_at",
      "buildings.created_at",
      "units.created_by",
      "units.handed_over_at",
      "unit_ownerships.created_at",
      "unit_ownerships.created_by",
      "due_types.created_at",
      "chart_of_accounts.created_at",
      "chart_of_accounts.updated_at",
      "fiscal_periods.created_at",
      "banks.created_at",
      "bank_accounts.created_at",
      "dues.created_by",
    ]);

    const missing: string[] = [];
    for (const table of CHECKED) {
      const declared = declaredRowColumns(source, table);
      const actual = live!.get(table);
      if (!declared || !actual) continue;
      for (const column of actual) {
        if (!declared.has(column)) missing.push(`${table}.${column}`);
      }
    }

    const unexpected = missing.filter((c) => !KNOWN_OMISSIONS.has(c));
    expect(
      unexpected,
      "columns the database has that types.ts does not declare, and that are not " +
        "a recorded pre-existing omission. Add them to the types, or record them here " +
        "with a reason.",
    ).toEqual([]);

    // And the frozen list must not rot: an entry that no longer applies means
    // the column was declared or dropped, and the list should shrink with it.
    const stale = [...KNOWN_OMISSIONS].filter((c) => !missing.includes(c));
    expect(stale, "recorded omissions that no longer apply").toEqual([]);
  });

  it("omits only audit metadata, never a business column", () => {
    // The reason the frozen list above is acceptable. If an omission were ever
    // a business field, freezing it would be hiding a real gap rather than
    // recording a stylistic one.
    const BUSINESS_SAFE = /_(at|by)$/;
    const missing: string[] = [];
    for (const table of CHECKED) {
      const declared = declaredRowColumns(source, table);
      const actual = live!.get(table);
      if (!declared || !actual) continue;
      for (const column of actual) {
        if (!declared.has(column)) missing.push(`${table}.${column}`);
      }
    }
    const business = missing.filter((c) => !BUSINESS_SAFE.test(c.split(".")[1]!));
    expect(business, "undeclared columns that are not audit metadata").toEqual([]);
  });

  it("declares every table the demo depends on", () => {
    const absent = CHECKED.filter((t) => declaredRowColumns(source, t) === null);
    expect(absent, "tables the demo uses that types.ts does not declare").toEqual([]);
  });

  it("verifies the is_demo hand-edit against the database", () => {
    // The specific claim a hand-edit makes, checked rather than trusted.
    const declared = declaredRowColumns(source, "organizations");
    expect(declared?.has("is_demo"), "types.ts does not declare organizations.is_demo").toBe(true);
    expect(
      live!.get("organizations")?.has("is_demo"),
      "the database has no organizations.is_demo",
    ).toBe(true);
  });
});
