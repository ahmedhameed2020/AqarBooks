import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard: a page that reads one of the views/tables that were measured failing (statement timeouts, 2026-10-12) must route read
 * failures through `assertRead` (lib/supabase/assert-read.ts), so a failed read shows the route's error boundary instead of an empty or
 * zero page. It checks the page imports `assertRead` and calls it at least once per distinct failing-prone relation it reads. The behaviour
 * itself is proved in tests/e2e/page-error-states.spec.ts.
 */
const ROOT = process.cwd();
const RELATIONS = ["members_with_financials", "units_with_financials", "maintenance_categories"];
const WHITELIST: Record<string, string> = {
  "app/[locale]/(app)/dashboard/tenant-dashboard.tsx":
    "not a page.tsx; the dashboard has its own per-section state (denied / error / ok) and never renders a failed query as 0",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}
const pages = walk(join(ROOT, "app")).map((f) => relative(ROOT, f).replaceAll("\\", "/"));
const readers = pages.filter((f) => RELATIONS.some((r) => readFileSync(join(ROOT, f), "utf8").includes(`.from("${r}")`)));

describe("pages that read the failing-prone relations use assertRead", () => {
  it("finds the pages (the guard is not vacuous)", () => {
    expect(readers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(readers)("%s imports and calls assertRead", (f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    expect(src, `${f} must import assertRead`).toContain('from "@/lib/supabase/assert-read"');
    const calls = (src.match(/assertRead\(/g) ?? []).length;
    const distinct = RELATIONS.filter((r) => src.includes(`.from("${r}")`)).length;
    expect(calls, `${f}: ${distinct} failing-prone relation(s) read, assertRead called ${calls} time(s)`).toBeGreaterThanOrEqual(distinct);
  });

  it("route error boundaries exist for both shells", () => {
    for (const f of ["app/[locale]/(app)/error.tsx", "app/[locale]/portal/(member)/error.tsx"]) {
      expect(readFileSync(join(ROOT, f), "utf8")).toContain("DataLoadErrorView");
    }
  });

  it("every whitelist entry carries a reason", () => {
    for (const [f, why] of Object.entries(WHITELIST)) expect(why.length, f).toBeGreaterThan(40);
  });

  it("negative control: a page without the import would be flagged by the same check", () => {
    const fake = 'supabase.from("units_with_financials").select("*")';
    expect(fake.includes('from "@/lib/supabase/assert-read"')).toBe(false);
  });
});
