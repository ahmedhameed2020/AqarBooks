// @ts-nocheck
/**
 * Payment-creation permission key guard.
 *
 * WHY THIS EXISTS
 * Two permission keys exist for the same capability:
 *
 *   receivables.payments.create   <- what record_payment actually enforces
 *   finance.payments.create       <- a legacy alias nothing enforces
 *
 * Both are seeded, and both are granted to exactly the same six role templates
 * (TENANT_OWNER, GENERAL_MANAGER, FINANCE_MANAGER, ACCOUNTANT, CASHIER,
 * COLLECTOR). That identical grant set is precisely what makes this dangerous:
 * gating a control on the alias behaves correctly today, so the mistake is
 * invisible in review and in manual testing. It only surfaces the day someone
 * grants one key without the other -- at which point the UI and the database
 * disagree about who may take a payment, and the user gets a raw 42501 from a
 * button the app told them they could press.
 *
 * The alias is deliberately NOT removed in this release: no grants are revoked
 * and no tenant is migrated. It is frozen as legacy, and this guard stops new
 * code from reaching for it.
 *
 * WHAT IS ASSERTED
 * No source file under app/, lib/ or components/ may contain the alias as a
 * string literal. Comments are stripped first, so the explanatory comment in
 * finance/payments/page.tsx -- which names the alias in order to explain why it
 * is not used -- does not trip the guard.
 *
 * ANTI-VACUITY
 * A scanner that silently matched nothing would pass this file forever. The
 * final test therefore proves the scanner can find a permission key at all, by
 * requiring the canonical key to be present as a literal in the same corpus.
 * If the payments screen stops gating on it, this suite fails rather than
 * quietly guarding an empty set.
 *
 * This suite reads the filesystem only. It opens no database connection.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "lib", "components"];
const SOURCE_EXT = /\.(ts|tsx)$/;

const LEGACY_ALIAS = "finance.payments.create";
const CANONICAL = "receivables.payments.create";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      return walk(full);
    }
    return SOURCE_EXT.test(entry.name) ? [full] : [];
  });
}

/**
 * Remove block and line comments. Deliberately simple: it can also blank the
 * inside of a string containing "//", which would only ever make this guard
 * MORE permissive about comments and never less strict about real code, and no
 * permission key contains a slash.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(): string[] {
  return ROOTS.filter((r) => {
    try {
      return statSync(r).isDirectory();
    } catch {
      return false;
    }
  }).flatMap(walk);
}

function filesContaining(needle: string): string[] {
  const quoted = [`"${needle}"`, `'${needle}'`, `\`${needle}\``];
  return sourceFiles().filter((file) => {
    const code = stripComments(readFileSync(file, "utf8"));
    return quoted.some((q) => code.includes(q));
  });
}

describe("payment creation gates on the key the database enforces", () => {
  it("scans a non-trivial corpus", () => {
    // Guards the guard: a broken walk() would make every assertion below vacuous.
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it(`no source file gates on the legacy alias ${LEGACY_ALIAS}`, () => {
    const offenders = filesContaining(LEGACY_ALIAS);
    expect(
      offenders,
      `${LEGACY_ALIAS} is a legacy alias that no RPC enforces. record_payment ` +
        `checks ${CANONICAL}. Gate on that instead -- the two currently carry ` +
        `identical grants, so using the alias will appear to work right up ` +
        `until those grants diverge.`,
    ).toEqual([]);
  });

  it(`the canonical key ${CANONICAL} is actually used`, () => {
    expect(
      filesContaining(CANONICAL).length,
      `Expected at least one file to gate on ${CANONICAL}. If payment gating ` +
        `moved or was removed, update this suite deliberately -- do not let it ` +
        `keep passing while guarding nothing.`,
    ).toBeGreaterThan(0);
  });
});
