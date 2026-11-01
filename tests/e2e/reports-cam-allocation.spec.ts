import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

async function makeOrg(admin: SupabaseClient, label: string) {
  const stamp = Date.now();
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: `E2E CAM ${label} ${stamp}`, slug: `e2e-cam-${label}-${stamp}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id").single();
  expect(error, `org insert: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  const email = `e2e-cam-${label}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(userErr, `user create: ${userErr?.message}`).toBeNull();
  const userId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments").insert({ user_id: userId, role_id: role!.id, organization_id: orgId });
  return { orgId, email };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test("CAM shares are computed from the levy allocations and tie to the total", async ({ page }) => {
  test.setTimeout(150_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "shares");

  const { data: property } = await admin
    .from("properties")
    .insert({ organization_id: fx.orgId, name: "CAM Property", code: `CAM-${Date.now()}` })
    .select("id").single();
  const { data: receivable } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "1100", name_ar: "ذمم", name_en: "Receivables", category: "ASSET", normal_balance: "DEBIT" })
    .select("id").single();
  const { data: revenue } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "4100", name_ar: "إيراد", name_en: "Revenue", category: "REVENUE", normal_balance: "CREDIT" })
    .select("id").single();
  const { data: dueType } = await admin
    .from("due_types")
    .insert({ organization_id: fx.orgId, name_ar: "رسوم خدمات", name_en: "Service charges", default_revenue_account_id: revenue!.id })
    .select("id").single();

  const units: string[] = [];
  const members: string[] = [];
  for (const n of [1, 2]) {
    const { data: unit } = await admin
      .from("units")
      .insert({ organization_id: fx.orgId, property_id: property!.id, code: `CAM-U${n}`, area: 100 })
      .select("id").single();
    units.push(unit!.id);
    const { data: member } = await admin
      .from("members")
      .insert({ organization_id: fx.orgId, full_name: `CAM Owner ${n}` })
      .select("id").single();
    members.push(member!.id);
    await admin.from("unit_ownerships").insert({
      organization_id: fx.orgId, unit_id: unit!.id, member_id: member!.id, is_primary_contact: true,
    });
  }

  const { data: levy, error: levyErr } = await admin
    .from("service_charge_levies")
    .insert({
      organization_id: fx.orgId, property_id: property!.id, name: "CAM Q1 2026",
      period_start: "2026-01-01", period_end: "2026-03-31",
      total_amount: 1000, allocation_basis: "EQUAL",
      due_type_id: dueType!.id, receivable_account_id: receivable!.id,
      issue_date: "2026-04-01", due_date: "2026-04-30",
    })
    .select("id").single();
  expect(levyErr, `levy insert: ${levyErr?.message}`).toBeNull();

  for (const [index, unitId] of units.entries()) {
    const { error } = await admin.from("service_charge_allocations").insert({
      organization_id: fx.orgId, levy_id: levy!.id, unit_id: unitId, basis_value: 1,
      share_amount: index === 0 ? 600 : 400,
    });
    expect(error, `allocation insert: ${error?.message}`).toBeNull();
  }

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/cam-allocation");
  await expect(page.getByText("CAM-U1")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("CAM-U2")).toBeVisible();
  await expect(page.getByText("CAM Owner 1")).toBeVisible();
  // 600/1000 = 60.00%, 400/1000 = 40.00% — stated as percentages on the ledger rows.
  await expect(page.getByText("60.00%").first()).toBeVisible();
  await expect(page.getByText("40.00%").first()).toBeVisible();
  // The shares sum to the levy total.
  await expect(page.getByText(/1,?000(\.00)?/).first()).toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});

test("an organization without a levy sees an explained empty CAM register", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "empty");

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/cam-allocation");
  await expect(page.getByText(/No unit CAM records found/i)).toBeVisible({ timeout: 30_000 });

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});
