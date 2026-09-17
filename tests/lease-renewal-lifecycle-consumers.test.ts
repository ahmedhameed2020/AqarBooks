import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(...path.split("/")), "utf8").toLowerCase();
const migration = read("supabase/migrations/20260918010000_lease_renewal_successor_activation.sql");

describe("lease lifecycle consumers", () => {
  it("reserves active and scheduled lease ranges", () => {
    expect(migration).toContain("status in ('active', 'scheduled')");
    expect(migration).toContain("unit_leases_no_overlapping_active_or_scheduled");
  });

  it("selects the current lease by status and effective dates in the unit and rent-roll views", () => {
    for (const source of [
      read("app/[locale]/(app)/property/[unitId]/tab-lease.tsx"),
      read("app/[locale]/(app)/finance/reports/rent-roll/page.tsx"),
    ]) {
      expect(source).toContain('l.status === "active"');
      expect(source).toContain("l.starts_on <= today");
      expect(source).toContain("l.ends_on > today");
    }
  });

  it("shows scheduled leases without offering manual activation", () => {
    const source = read("app/[locale]/(app)/property/[unitId]/tab-lease.tsx");
    expect(source).toContain('scheduled: { ar: "مجدول", en: "scheduled"');
    expect(source).toContain('l.status === "draft" && <activateleasebutton');
  });

  it("filters operational alerts to currently effective leases", () => {
    const source = read("lib/alerts/operational-alerts.ts");
    expect(source).toContain('.eq("status", "active")');
    expect(source).toContain('.lte("starts_on", today)');
    expect(source).toContain("ends_on.gt.${today}");
  });

  it("enforces current effective tenancy for opening balances", () => {
    expect(migration).toContain("dues_opening_balance_current_unit_link");
    expect(migration).toContain("ul.status = 'active'");
    expect(migration).toContain("ul.starts_on <= current_date");
    expect(migration).toContain("ul.ends_on > current_date");
  });
});
