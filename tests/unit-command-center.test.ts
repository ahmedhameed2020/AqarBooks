import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const loader = readFileSync(join("lib", "portal", "unit-command-center.ts"), "utf8");
const dashboardPage = readFileSync(
  join("app", "[locale]", "portal", "(member)", "page.tsx"),
  "utf8",
);
const commandCenter = readFileSync(
  join("app", "[locale]", "portal", "(member)", "portal-command-center.tsx"),
  "utf8",
);

describe("owner portal unit command center", () => {
  it("keeps operational aggregation server-only and entitlement-aware", () => {
    expect(loader).toContain('import "server-only"');
    expect(loader).toContain('supabase.rpc("maintenance_module_enabled"');
    expect(loader).toContain('supabase.rpc("visitor_management_enabled"');
    expect(loader).toContain('supabase.rpc("unit_experience_enabled"');
    expect(loader).toContain("access.maintenance");
    expect(loader).toContain("access.visitors");
    expect(loader).toContain("access.unitExperience");
  });

  it("adds defense-in-depth tenant/member filters above existing RLS", () => {
    expect(loader.match(/\.eq\("organization_id", organizationId\)/g)).toHaveLength(5);
    expect(loader).toContain('.eq("requester_member_id", memberId)');
    expect(loader).toContain('.eq("invited_by_member_id", memberId)');
    expect(loader).toContain('.eq("member_id", memberId)');
  });

  it("returns bounded, presentation-safe data rather than raw domain rows", () => {
    expect(loader).toContain(".limit(3)");
    expect(loader).toContain(".limit(4)");
    expect(loader).not.toMatch(/guest_phone|guest_note|token_hash|raw_secret/);
    expect(loader).not.toContain('select("*")');
    expect(loader).not.toContain("service_role");
  });

  it("wires the command center into the existing financial dashboard", () => {
    expect(dashboardPage).toContain("loadPortalCommandCenter(supabase");
    expect(dashboardPage).toContain("commandCenter={commandCenter}");
    expect(commandCenter).toContain("Your unit command center");
    expect(commandCenter).toContain("مركز إدارة وحداتك");
  });

  it("exposes only the established portal actions", () => {
    expect(commandCenter).toContain('href="/portal/maintenance/new"');
    expect(commandCenter).toContain('href="/portal/visitors/new"');
    expect(commandCenter).toContain('href="/portal/vehicles/new"');
    expect(commandCenter).toContain('href="/portal/notifications"');
    expect(commandCenter).not.toMatch(/operations\/gate|access-events|scanner/i);
  });
});
