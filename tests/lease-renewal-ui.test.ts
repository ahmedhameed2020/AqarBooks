import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPortalPrimaryLeaseStatus } from "../lib/lease-renewal-ui";

const read = (path: string) => readFileSync(join(...path.split("/")), "utf8");

describe("lease renewal product integration", () => {
  it("uses the existing renewal RPCs through server actions", () => {
    const actions = read("lib/actions/lease-renewals.ts");
    expect(actions).toContain('supabase.rpc("request_lease_renewal"');
    expect(actions).toContain('supabase.rpc("decide_lease_renewal"');
    expect(actions).not.toMatch(/service.role|createAdminClient|SUPABASE_SERVICE_ROLE/i);
    expect(actions).not.toMatch(/\.from\("(?:dues|unit_leases|lease_renewal_requests)"\)\.(?:insert|update|delete)/);
  });

  it("keeps the owner route on the narrow status projection", () => {
    const detail = read("app/[locale]/portal/(member)/leases/[leaseId]/renewal/page.tsx");
    expect(detail).toContain('supabase.rpc("get_owned_unit_lease_renewal_status"');
    expect(detail).not.toContain("decision_reason");
    expect(detail).not.toContain("request_note");
    expect(detail).not.toContain("rent_amount");
    expect(detail).not.toMatch(/select\("[^"]*tenant_member_id/);
  });

  it("offers portal renewal submission only to the tenant on an active lease", () => {
    const detail = read("app/[locale]/portal/(member)/leases/[leaseId]/renewal/page.tsx");
    expect(detail).toContain('relationship === "TENANT" && lease.status === "ACTIVE"');
    expect(detail).toContain("<RenewalRequestForm");
    expect(detail).toContain("No manual actions are available for a scheduled lease before it starts.");
  });

  it("gates staff controls with property-scoped database helpers", () => {
    const leaseTab = read("app/[locale]/(app)/property/[unitId]/tab-lease.tsx");
    const panel = read("app/[locale]/(app)/property/[unitId]/lease-renewal-panel.tsx");
    expect(leaseTab).toContain('supabase.rpc("lease_renewal_staff_can_read"');
    expect(leaseTab).toContain('supabase.rpc("lease_renewal_staff_can_manage"');
    expect(panel).toContain('request.status === "REQUESTED" && canManage');
    expect(panel).toContain("disabled={pending}");
    expect(panel).toContain("Confirm approval");
    expect(panel).toContain("Rejection reason");
  });

  it("keeps scheduled lease mutations hidden in the existing lease surface", () => {
    const leaseTab = read("app/[locale]/(app)/property/[unitId]/tab-lease.tsx").toLowerCase();
    expect(leaseTab).toContain('l.status === "draft" && <activateleasebutton');
    expect(leaseTab).toContain('l.status === "draft" && <cancelleasebutton');
  });

  it("exposes only ACTIVE and ENDED as independent portal leases", () => {
    expect(isPortalPrimaryLeaseStatus("ACTIVE")).toBe(true);
    expect(isPortalPrimaryLeaseStatus("ENDED")).toBe(true);
    expect(isPortalPrimaryLeaseStatus("SCHEDULED")).toBe(false);
    expect(isPortalPrimaryLeaseStatus("DRAFT")).toBe(false);
    expect(isPortalPrimaryLeaseStatus("CANCELLED")).toBe(false);

    const list = read("app/[locale]/portal/(member)/leases/page.tsx");
    const detail = read("app/[locale]/portal/(member)/leases/[leaseId]/renewal/page.tsx");
    expect(list).toContain("if (!isPortalPrimaryLeaseStatus(lease.status)) continue;");
    expect(detail).toContain('.in("status", [...PORTAL_PRIMARY_LEASE_STATUSES])');
  });

  it("adds localized navigation and explicit loading/error states", () => {
    const nav = read("app/[locale]/portal/(member)/portal-nav.tsx");
    expect(nav).toContain('href: "/portal/leases"');
    expect(nav).toContain('labelAr: "العقود والتجديد"');
    expect(nav).toContain('labelEn: "Leases & Renewals"');
    expect(read("app/[locale]/portal/(member)/leases/loading.tsx")).toContain('aria-busy="true"');
    expect(read("app/[locale]/portal/(member)/leases/error.tsx")).toContain('role="alert"');
  });
});
