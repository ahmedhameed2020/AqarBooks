/**
 * Every writing SECURITY DEFINER function reachable by `authenticated` must
 * authorize its caller.
 *
 * WHY THIS EXISTS
 * `generate_lease_rent_dues` was SECURITY DEFINER, granted to `authenticated`,
 * and performed no permission check at all. Any signed-in user who could see a
 * lease could call it through PostgREST and create a rent receivable -- and a
 * posted journal entry with it, because the dues trigger posts to the ledger
 * once an OPEN period covers the issue date. That included the public demo's
 * read-only account.
 *
 * It was found by reading the function, not by any test. Nothing in the
 * repository asserted the property it violated, so nothing would have noticed
 * the next one. This does.
 *
 * WHAT IT CHECKS
 * A function is flagged when all of these hold:
 *   - SECURITY DEFINER (so it runs with the definer's rights)
 *   - granted EXECUTE to `authenticated` and not revoked by the postamble
 *   - contains a write (insert / update / delete)
 *   - contains no authorization construct
 *
 * WHAT IT READS
 * The baseline schema AND every migration applied after it, in version order.
 * The baseline alone stopped being the schema the moment the first migration
 * landed: a function redefined later must be judged on its LATER definition,
 * and a revoke issued later must count. Reading only the baseline would have
 * reported both security migrations as never having happened.
 *
 * No database connection.
 *
 * THE CRITERION, CORRECTED
 * The first version of this triage asked "does it move money?" and exempted
 * nine of fourteen. That was the wrong question. The demo's promise is
 * narrower and stricter -- a public visitor cannot mutate the database -- so
 * the test is:
 *
 *     can an authenticated caller change tenant state through a
 *     SECURITY DEFINER function with no authorization contract?
 *
 * Under that rule a sequence counter and a role clone are mutations, and
 * severity is not the test. Four functions previously exempted as low-impact
 * became must-revoke.
 *
 * WHY AN ALLOWLIST AND NOT A CLEAN ZERO
 * A few functions genuinely need no check, and pretending otherwise would mean
 * weakening the rule until it caught nothing. Each exemption is named with the
 * reason it is safe, so adding one is a visible decision rather than a silent
 * edit to a regex.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "supabase/baseline/baseline_schema.sql";
const POSTAMBLE = "supabase/baseline/baseline_03_security_postamble.sql";
const MIGRATIONS = "supabase/migrations";
/** The baseline itself lives in the migrations directory; it is read separately. */
const BASELINE_MIGRATION = "20260821105505_baseline.sql";

/**
 * Functions that write, are reachable by `authenticated`, and have no
 * authorization check -- each one deliberate.
 */
const SANCTIONED: Record<string, string> = {
  // Trigger functions. Postgres refuses a direct call ("can only be called as
  // a trigger"), so the grant is not a reachable surface.
  // check_installment_plan_completion and handle_new_user are NOT listed:
  // neither is granted to `authenticated`, so neither is reachable and neither
  // needs an exemption. An allowlist that names things it does not have to
  // overstates the problem it describes.
  log_coa_change: "trigger function",
  sync_member_primary_phone: "trigger function",
  trg_members_tax_identity_changed: "trigger function",
  trg_organizations_tax_identity_changed: "trigger function",

  // Self-service by design: it creates the caller's OWN organization and makes
  // them its owner. There is no prior organization to hold a permission in.
  create_organization_onboarding:
    "self-service onboarding; the caller has no organization yet",

  // Authorized transitively. Both branches delegate to post_supplier_invoice,
  // which checks finance.entries.create -- the base-currency branch returns it
  // directly and the FX branch calls it before its own UPDATE.
  post_supplier_invoice_in_currency:
    "delegates to post_supplier_invoice, which checks finance.entries.create",

};

/**
 * Known-unfixed gaps, awaiting a decision or a migration.
 *
 * EMPTY, and that is the point of it being here.
 *
 * It held six entries. All six are closed by two migrations applied on
 * 2026-08-25:
 *
 *   20260825124312_generate_lease_rent_dues_authz
 *     generate_lease_rent_dues now checks finance.schedules.generate. It stays
 *     executable by `authenticated` -- it is a legitimate business RPC that
 *     staff run, not an internal helper.
 *
 *   20260825124342_internal_helper_acls
 *     record_tax_decision_for_due_internal, post_due_to_ledger,
 *     allocate_document_number, next_sequence_value and
 *     clone_tenant_role_templates are revoked from public, anon and
 *     authenticated. service_role keeps EXECUTE.
 *
 * The suite failed when they were fixed and still listed here, which is how
 * this list is kept from quietly overstating the risk. Add an entry only for a
 * gap that genuinely remains open.
 */
const KNOWN_GAPS: Record<string, string> = {};

type Fn = { name: string; body: string; returns: string };

function parseFunctions(schema: string): Fn[] {
  const out: Fn[] = [];
  const re = /CREATE OR REPLACE FUNCTION "public"\."([a-z_0-9]+)"\((.*?)\)\s+RETURNS ("?[a-z ]+"?)/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    const start = m.index;
    const end = schema.indexOf("\n$$;", start);
    out.push({
      name: m[1]!,
      returns: m[3]!.replace(/"/g, "").trim(),
      body: schema.slice(start, end === -1 ? start + 6000 : end + 4),
    });
  }
  return out;
}

describe("SECURITY DEFINER authorization", () => {
  const schema = readFileSync(SCHEMA, "utf8");
  const postamble = readFileSync(POSTAMBLE, "utf8");

  // Applied after the baseline, in version order. Sorting by filename is
  // sorting by timestamp, because that is what the version prefix is.
  const laterMigrations = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f !== BASELINE_MIGRATION)
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }));

  const laterSql = laterMigrations.map((m) => m.sql).join("\n");

  // A later CREATE OR REPLACE wins. Parsed baseline-first then migrations in
  // order, so the last definition of a name is the one that is judged.
  const byName = new Map<string, Fn>();
  for (const fn of parseFunctions(schema)) byName.set(fn.name, fn);
  for (const migration of laterMigrations) {
    for (const fn of parseFunctions(migration.sql)) byName.set(fn.name, fn);
  }
  const functions = [...byName.values()];
  const grantedToAuthenticated = new Set(
    [...schema.matchAll(/GRANT ALL ON FUNCTION "public"\."([a-z_0-9]+)"[^;]*TO "authenticated"/g)].map(
      (m) => m[1]!,
    ),
  );
  // Revoked by the Phase 1 postamble OR by any later migration. Both forms are
  // matched: the postamble writes `REVOKE EXECUTE ON FUNCTION public.x(`, a
  // migration may also write `revoke execute on function public.x(`.
  const revoked = new Set([
    ...[...postamble.matchAll(/REVOKE EXECUTE ON FUNCTION public\.([a-z_0-9]+)\(/gi)].map(
      (m) => m[1]!,
    ),
    ...[...laterSql.matchAll(/revoke\s+execute\s+on\s+function\s+public\.([a-z_0-9]+)\s*\(/gi)].map(
      (m) => m[1]!,
    ),
  ]);

  const WRITES = /\b(insert\s+into|update\s+public\.|delete\s+from)\b/i;
  const AUTHORIZES =
    /has_permission|has_financial_permission|is_platform_admin|current_member_id|auth\.uid\(\)\s*(is\s+null|=)/i;

  const flagged = functions
    .filter((f) => /SECURITY DEFINER/i.test(f.body))
    .filter((f) => grantedToAuthenticated.has(f.name))
    .filter((f) => !revoked.has(f.name))
    .filter((f) => WRITES.test(f.body))
    .filter((f) => !AUTHORIZES.test(f.body))
    .map((f) => f.name);

  const unique = [...new Set(flagged)];

  it("parses the schema and the later migrations (guards against a vacuous pass)", () => {
    // If any parse silently returned nothing, every assertion below would pass
    // while checking nothing at all.
    expect(functions.length).toBeGreaterThan(150);
    expect(grantedToAuthenticated.size).toBeGreaterThan(100);
    expect(revoked.size).toBeGreaterThan(5);
    expect(laterMigrations.length, "no post-baseline migrations were read").toBeGreaterThan(0);
  });

  it("judges a redefined function on its latest definition", () => {
    // generate_lease_rent_dues is defined in the baseline WITHOUT an
    // authorization check and redefined by 20260825124312 WITH one. Reading
    // only the baseline would report a fixed function as still broken.
    const fn = byName.get("generate_lease_rent_dues");
    expect(fn, "generate_lease_rent_dues not parsed").toBeTruthy();
    expect(
      /finance\.schedules\.generate/.test(fn!.body),
      "the latest definition does not carry the authorization check",
    ).toBe(true);
  });

  it("flags no unaccounted writing function", () => {
    const unaccounted = unique.filter((n) => !(n in SANCTIONED) && !(n in KNOWN_GAPS));
    expect(
      unaccounted,
      "these SECURITY DEFINER functions write, are callable by any authenticated user, " +
        "and authorize nobody. Either add the check or account for them explicitly.",
    ).toEqual([]);
  });

  it("keeps the sanctioned list honest", () => {
    // An entry that no longer appears is either fixed -- in which case remove
    // it -- or renamed, in which case the rename escaped its exemption.
    const stale = Object.keys(SANCTIONED).filter((n) => !unique.includes(n));
    expect(stale, "sanctioned entries that no longer match anything").toEqual([]);
  });

  it("still reports the known gaps as gaps", () => {
    // Fails when a gap is fixed, which is the prompt to delete the entry
    // rather than let the list quietly overstate the risk.
    const fixed = Object.keys(KNOWN_GAPS).filter((n) => !unique.includes(n));
    expect(
      fixed,
      "these are recorded as unfixed but now authorize; remove them from KNOWN_GAPS",
    ).toEqual([]);
  });

  it("every *_internal function is either revoked or accounted for", () => {
    // The Phase 1 postamble revoked three of them by name. A fourth was left
    // behind, and the naming convention is the only thing that says it should
    // not have been.
    const internals = [...new Set(functions.map((f) => f.name))].filter((n) =>
      n.endsWith("_internal"),
    );
    expect(internals.length).toBeGreaterThan(0);

    const reachable = internals.filter((n) => grantedToAuthenticated.has(n) && !revoked.has(n));
    const unaccounted = reachable.filter((n) => !(n in KNOWN_GAPS) && !(n in SANCTIONED));
    expect(
      unaccounted,
      "functions named _internal that any authenticated user may execute",
    ).toEqual([]);
  });
});
