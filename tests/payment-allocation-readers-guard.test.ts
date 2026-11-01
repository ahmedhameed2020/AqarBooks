import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard for the customer-advances rollout: balance-bearing readers must read effective_payment_allocations (or
 * payment_allocations_as_of), never the raw table. A direct `.from("payment_allocations")` counts reversed credit applications
 * and the allocations of voided receipts, so a new reader that does it would disagree with every migrated screen.
 * The whitelist is deliberately tiny and each entry says why; an entry whose pattern vanished must be removed.
 */
const ROOT = process.cwd();
const SCAN = ["app", "lib", "components"];
const RAW = /\.from\(\s*["'`]payment_allocations["'`]\s*\)/;
const VIEW = "effective_payment_allocations";

const WHITELIST: Record<string, string> = {
  "app/[locale]/(app)/property/payments-table.tsx":
    "history listing of a unit's receipts: shows REVERSED receipts (with their status) on purpose, so it must see the allocations of voided receipts; it computes no balance",
};
const MIGRATED = [
  "lib/actions/member-portal-receipts.ts",
  "app/[locale]/(app)/dashboard/tenant-dashboard.tsx",
  "app/[locale]/(app)/finance/cashier/page.tsx",
  "app/[locale]/(app)/finance/dues/page.tsx",
  "app/[locale]/(app)/finance/payments/page.tsx",
  "app/[locale]/(app)/finance/reports/aging/page.tsx",
  "app/[locale]/(app)/finance/reports/cash-flow-forecast/page.tsx",
  "app/[locale]/(app)/finance/reports/owner-statement/page.tsx",
  "app/[locale]/(app)/property/page.tsx",
  "app/[locale]/(app)/property/[unitId]/page.tsx",
  "app/[locale]/portal/(member)/dues/page.tsx",
  "app/[locale]/portal/(member)/page.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}
const rel = (f: string) => relative(ROOT, f).replaceAll("\\", "/");
const files = SCAN.flatMap((d) => walk(join(ROOT, d)));

describe("payment_allocations readers", () => {
  it("no code outside the whitelist reads the raw table", () => {
    const offenders = files.filter((f) => RAW.test(readFileSync(f, "utf8"))).map(rel).filter((f) => !(f in WHITELIST));
    expect(offenders, "read effective_payment_allocations (or payment_allocations_as_of) instead; see lib/finance/payment-allocations.ts").toEqual([]);
  });

  it("every whitelist entry is still needed (still contains the raw read) and carries its reason", () => {
    for (const [f, why] of Object.entries(WHITELIST)) {
      expect(why.length, f).toBeGreaterThan(40);
      expect(RAW.test(readFileSync(join(ROOT, f), "utf8")), `${f} no longer reads the raw table: remove it from the whitelist`).toBe(true);
    }
  });

  it("the migrated screens read the effective view and none still reads the raw table", () => {
    for (const f of MIGRATED) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src.includes(VIEW), `${f} should read ${VIEW}`).toBe(true);
      expect(RAW.test(src), `${f} must not read payment_allocations directly`).toBe(false);
    }
  });

  it("the shared helper exists and exposes the effective and as-of readers", () => {
    const src = readFileSync(join(ROOT, "lib/finance/payment-allocations.ts"), "utf8");
    for (const sym of ["fetchEffectiveAllocations", "fetchAllocationsAsOf", "payment_allocations_as_of", VIEW]) expect(src).toContain(sym);
  });

  it("negative control: the detector flags a raw read (quotes, spacing and template literals)", () => {
    for (const bad of ['supabase.from("payment_allocations")', "supabase.from( 'payment_allocations' )", "sb.from(`payment_allocations`)"]) expect(RAW.test(bad)).toBe(true);
    expect(RAW.test('supabase.from("effective_payment_allocations")')).toBe(false);
    expect(RAW.test('supabase.from("supplier_payment_allocations")')).toBe(false);
  });
});
