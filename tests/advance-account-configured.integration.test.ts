import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";

/** customer_advance_account_configured: one boolean for people who can already record/read receipts; nothing else leaks. */
let fx: JourneyFixture, other: JourneyFixture;
type Client = Awaited<ReturnType<typeof signedInClient>>;
let cashier: Client, owner: Client, outsider: Client;

async function userWithRole(f: JourneyFixture, roleKey: string | null, label: string) {
  const admin = adminClient();
  const email = `${label}-${f.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (roleKey) {
    const roleId = (await admin.from("roles").select("id").eq("organization_id", f.orgId).eq("key", roleKey).single()).data!.id as string;
    await admin.from("organization_memberships").insert({ organization_id: f.orgId, user_id: created.data.user!.id, status: "active" });
    await admin.from("user_role_assignments").insert({ user_id: created.data.user!.id, role_id: roleId, organization_id: f.orgId });
  }
  return signedInClient(email);
}
const configured = async (c: Client, f: JourneyFixture) => (await c.rpc("customer_advance_account_configured", { p_organization_id: f.orgId, p_property_id: f.propertyId })).data;

beforeAll(async () => {
  fx = await createJourneyFixture("adv-cfg");
  other = await createJourneyFixture("adv-cfg-other");
  owner = await signedInClient(fx.owner.email);
  cashier = await userWithRole(fx, "CASHIER", "cashier");
  outsider = await userWithRole(fx, null, "outsider");
}, 300_000);

describe("customer_advance_account_configured", () => {
  it("false before approval for everyone entitled; the cashier cannot read the setting table itself", async () => {
    expect(await configured(owner, fx)).toBe(false);
    expect(await configured(cashier, fx)).toBe(false);
    expect((await cashier.from("organization_finance_settings").select("customer_advance_account_id")).data ?? []).toHaveLength(0);
  });

  it("true after approval for the cashier too (the bug: the screen reported 'not configured' to anyone without finance.accounts.manage)", async () => {
    const r = await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] });
    expect(r.error, r.error?.message).toBeNull();
    expect(await configured(owner, fx)).toBe(true);
    expect(await configured(cashier, fx)).toBe(true);
    // still no read of the setting for the cashier
    expect((await cashier.from("organization_finance_settings").select("customer_advance_account_id")).data ?? []).toHaveLength(0);
  });

  it("false for someone with no role, for another organization's owner, and for another organization's id; anon is refused", async () => {
    expect(await configured(outsider, fx)).toBe(false);
    const otherOwner = await signedInClient(other.owner.email);
    expect(await configured(otherOwner, fx)).toBe(false);
    expect(await configured(owner, other)).toBe(false);
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/customer_advance_account_configured`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
      body: JSON.stringify({ p_organization_id: fx.orgId, p_property_id: fx.propertyId }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
