import { describe, expect, it } from "vitest";
import { adminClient, loadLatestJourneyFixture } from "./e2e/helpers/accounting-fixture";

describe("Tenant permission proof query regression", () => {
  it("resolves finance.years.close by key before checking the owner role grant", async () => {
    const fx = await loadLatestJourneyFixture("pv-yearclose-");
    const admin = adminClient();
    const membership = await admin.from("organization_memberships").select("status").eq("organization_id", fx.orgId).eq("user_id", fx.owner.id).maybeSingle();
    expect(membership, "active membership").toMatchObject({ data: { status: "active" }, error: null });
    const assignments = await admin.from("user_role_assignments").select("role_id").eq("organization_id", fx.orgId).eq("user_id", fx.owner.id);
    expect(assignments.error).toBeNull();
    expect(assignments.data).toHaveLength(1);
    const roles = await admin.from("roles").select("id, organization_id, is_system, key").in("id", assignments.data!.map((row) => row.role_id));
    expect(roles.error).toBeNull();
    expect(roles.data).toHaveLength(1);
    expect(roles.data![0].key).toBe("TENANT_OWNER");
    const permission = await admin.from("permissions").select("id").eq("key", "finance.years.close").maybeSingle();
    expect(permission, "close permission key lookup").toMatchObject({ error: null });
    expect(permission.data?.id).toBeTruthy();
    const grant = await admin.from("role_permissions").select("role_id").eq("permission_id", permission.data!.id).in("role_id", roles.data!.map((row) => row.id)).maybeSingle();
    expect(grant, "matching tenant role grant").toMatchObject({ error: null });
    expect(grant.data?.role_id).toBe(roles.data![0].id);
  }, 60_000);
});
