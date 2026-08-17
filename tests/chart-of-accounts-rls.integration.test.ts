/**
 * chart_of_accounts RLS -- deliberately UNCHANGED by the /finance/accounts
 * permission-gate fix (that fix is UI-only, see
 * tests/e2e/chart-of-accounts-permission-gate.spec.ts). This re-verifies,
 * live, that the existing RLS policies still do their job:
 *
 *   - chart_of_accounts_manage (finance.accounts.manage) is the only path
 *     to insert/update/delete -- a role with finance.accounts.view but
 *     NOT finance.accounts.manage (ACCOUNTANT) is rejected.
 *   - chart_of_accounts_select_member (is_org_member) correctly scopes
 *     reads to the caller's own organization only -- a TENANT_OWNER in
 *     org A can neither read nor modify org B's accounts.
 *
 * The structural policy definitions were already read directly from
 * pg_policy during the review that preceded this fix; this test proves
 * the behavior live and end to end, not just the policy text.
 *
 * Fixture conventions match tests/payments/resolve-credentials.test.ts:
 * real Supabase, no mocks, genuinely authenticated staff sessions
 * (service-role has no auth.uid() and cannot pass RLS at all).
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

async function makeOrgWithStaff(admin: SupabaseClient, label: string, roleKey: string) {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: `COA RLS Test ${label}`, slug: `coa-rls-${label.toLowerCase()}-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgErr, orgErr?.message).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr, cloneErr?.message).toBeNull();

  const staffEmail = `coa-rls-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr, staffCreateErr?.message).toBeNull();

  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr, membershipErr?.message).toBeNull();

  const { data: role, error: roleErr } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", roleKey)
    .single();
  expect(roleErr, `role lookup failed for ${roleKey}: ${roleErr?.message}`).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: role!.id, organization_id: org!.id });
  expect(assignErr, assignErr?.message).toBeNull();

  const staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: TEST_PASSWORD });
  expect(signInErr, signInErr?.message).toBeNull();

  return { orgId: org!.id as string, staffClient };
}

describe("chart_of_accounts RLS (real Supabase, no mocks)", () => {
  it("ACCOUNTANT (finance.accounts.view but not finance.accounts.manage) is rejected by RLS when creating an account", async () => {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { orgId, staffClient } = await makeOrgWithStaff(admin, "AccountantWrite", "ACCOUNTANT");

    const { error } = await staffClient.from("chart_of_accounts").insert({
      organization_id: orgId,
      code: "9999",
      name_ar: "حساب اختبار",
      name_en: "Test Account",
      category: "ASSET",
      normal_balance: "DEBIT",
      is_group: false,
    });
    expect(error, "expected RLS to reject an insert from a role without finance.accounts.manage").not.toBeNull();
    expect(error!.message).toMatch(/row-level security|policy/i);

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  }, 30000);

  it("cross-organization isolation: an org's TENANT_OWNER can neither read nor modify a different organization's chart of accounts", async () => {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const orgA = await makeOrgWithStaff(admin, "IsoA", "TENANT_OWNER");
    const orgB = await makeOrgWithStaff(admin, "IsoB", "TENANT_OWNER");

    const { data: orgBAccount, error: seedErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgB.orgId,
        code: "9998",
        name_ar: "حساب المنظمة ب",
        name_en: "Org B Account",
        category: "ASSET",
        normal_balance: "DEBIT",
        is_group: false,
      })
      .select("id")
      .single();
    expect(seedErr, seedErr?.message).toBeNull();

    const { data: readAttempt, error: readErr } = await orgA.staffClient
      .from("chart_of_accounts")
      .select("id")
      .eq("id", orgBAccount!.id)
      .maybeSingle();
    expect(readErr).toBeNull();
    expect(readAttempt, "org A must not be able to read org B's account row").toBeNull();

    const { error: updateErr, count } = await orgA.staffClient
      .from("chart_of_accounts")
      .update({ name_en: "Hijacked" }, { count: "exact" })
      .eq("id", orgBAccount!.id);
    // RLS silently matches zero rows for an UPDATE outside the USING
    // clause's visibility rather than erroring -- assert zero rows
    // affected, and that the account's real value is untouched.
    expect(updateErr).toBeNull();
    expect(count ?? 0).toBe(0);

    const { data: unchanged } = await admin.from("chart_of_accounts").select("name_en").eq("id", orgBAccount!.id).single();
    expect(unchanged?.name_en).toBe("Org B Account");

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgA.orgId);
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgB.orgId);
  }, 30000);
});
