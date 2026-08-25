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
 * It reads the baseline schema only. No database connection.
 *
 * WHY AN ALLOWLIST AND NOT A CLEAN ZERO
 * Some functions legitimately have no check, and pretending otherwise would
 * mean weakening the rule until it caught nothing. Each exemption below is
 * named with the reason it is safe, so adding one is a visible decision rather
 * than a silent edit to a regex.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SCHEMA = "supabase/baseline/baseline_schema.sql";
const POSTAMBLE = "supabase/baseline/baseline_03_security_postamble.sql";

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

  // Cannot create value and cannot double-post: it returns the existing entry
  // when journal_entry_id is already set, refuses DRAFT and VOID, and requires
  // an OPEN period covering the issue date. It performs exactly what the dues
  // trigger performs automatically. Worth a check on principle; not a hole.
  post_due_to_ledger:
    "idempotent, OPEN-period-gated, mirrors the dues trigger; cannot create value",

  // Bounded by unique constraints on (organization_id, key): it can only ever
  // populate an organization that has no roles, which in practice means one
  // mid-onboarding.
  clone_tenant_role_templates: "bounded by the roles unique constraint",

  // Sequence helpers. They allocate a number; they move no money and expose no
  // tenant data beyond the counter itself.
  allocate_document_number: "sequence helper",
  next_sequence_value: "sequence helper",
};

/**
 * Known-unfixed. Distinct from SANCTIONED: these are real gaps with a decision
 * pending, listed so the suite stays green on the state of the world while
 * still naming them. Removing an entry is how the fix gets proven.
 */
const KNOWN_GAPS: Record<string, string> = {
  generate_lease_rent_dues:
    "AUTHORIZATION HOLE. Fix prepared in scripts/demo/pending-migration-rent-authz.sql, not yet applied.",
  record_tax_decision_for_due_internal:
    "Named _internal but never revoked from authenticated, unlike create_journal_entry_internal, " +
      "post_journal_entry_internal and post_payment_internal which the Phase 1 postamble did revoke. " +
      "Inconsistent with the stated posture; awaiting a decision.",
};

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

  const functions = parseFunctions(schema);
  const grantedToAuthenticated = new Set(
    [...schema.matchAll(/GRANT ALL ON FUNCTION "public"\."([a-z_0-9]+)"[^;]*TO "authenticated"/g)].map(
      (m) => m[1]!,
    ),
  );
  const revoked = new Set(
    [...postamble.matchAll(/REVOKE EXECUTE ON FUNCTION public\.([a-z_0-9]+)\(/g)].map((m) => m[1]!),
  );

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

  it("parses the schema (guards against a vacuous pass)", () => {
    // If the parse silently returned nothing, every assertion below would pass
    // while checking nothing at all.
    expect(functions.length).toBeGreaterThan(150);
    expect(grantedToAuthenticated.size).toBeGreaterThan(100);
    expect(revoked.size).toBeGreaterThan(5);
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
