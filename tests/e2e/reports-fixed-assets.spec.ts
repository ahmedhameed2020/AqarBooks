import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; ownerId: string };

async function makeOrg(
  admin: SupabaseClient,
  label: string,
  roleKey: string | null,
): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: `E2E FA ${label} ${stamp}`,
      slug: `e2e-fa-${label}-${stamp}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(error, `org insert: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const email = `e2e-fa-${label}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(userErr, `user create: ${userErr?.message}`).toBeNull();
  const ownerId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: ownerId, status: "active" });
  if (roleKey) {
    const { data: role } = await admin
      .from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
    await admin.from("user_role_assignments").insert({ user_id: ownerId, role_id: role!.id, organization_id: orgId });
  }
  return { orgId, email, ownerId };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test("the fixed-asset schedule reads cost, accumulated depreciation and NBV from the database", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "schedule", "TENANT_OWNER");

  const { data: account } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: fx.orgId,
      code: "1210",
      name_ar: "معدات",
      name_en: "Equipment",
      category: "ASSET",
      normal_balance: "DEBIT",
    })
    .select("id")
    .single();

  const { data: accumulatedAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "1220", name_ar: "مجمع الإهلاك", name_en: "Accumulated Depreciation", category: "ASSET", normal_balance: "CREDIT" })
    .select("id").single();
  const { data: expenseAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "5100", name_ar: "مصروف إهلاك", name_en: "Depreciation Expense", category: "EXPENSE", normal_balance: "DEBIT" })
    .select("id").single();

  const { data: asset, error: assetErr } = await admin
    .from("fixed_assets")
    .insert({
      organization_id: fx.orgId,
      code: "FA-001",
      name_ar: "مولد احتياطي",
      name_en: "Backup Generator",
      asset_account_id: account!.id,
      accumulated_depreciation_account_id: accumulatedAccount!.id,
      depreciation_expense_account_id: expenseAccount!.id,
      acquisition_date: "2026-01-01",
      acquisition_cost: 1000,
      salvage_value: 0,
      useful_life_months: 12,
      method: "STRAIGHT_LINE",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(assetErr, `asset insert: ${assetErr?.message}`).toBeNull();

  // Fiscal structure is guarded against direct writes; create it through the
  // sanctioned RPC as the owner, then pick one period.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await ownerClient.auth.signInWithPassword({ email: fx.email, password: PASSWORD });
  expect(signInErr, `owner sign-in: ${signInErr?.message}`).toBeNull();
  const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
    p_organization_id: fx.orgId, p_name: "2026", p_start_date: "2026-01-01", p_end_date: "2026-12-31",
  });
  expect(yearErr, `create_fiscal_year: ${yearErr?.message}`).toBeNull();
  const { data: period, error: periodErr } = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("fiscal_year_id", yearId as string)
    .limit(1)
    .single();
  expect(periodErr, `period lookup: ${periodErr?.message}`).toBeNull();

  // One depreciation row per asset per period is enforced by a unique index
  // (fad_once_per_period), so a single 500 row carries the accumulated total.
  const { error: depInsertErr } = await admin.from("fixed_asset_depreciation").insert({
    organization_id: fx.orgId,
    fixed_asset_id: asset!.id,
    fiscal_period_id: period!.id,
    entry_date: "2026-06-30",
    amount: 500,
  });
  expect(depInsertErr, `depreciation insert: ${depInsertErr?.message}`).toBeNull();

  // The database is the source: accumulated = 500, NBV = 1000 - 500 = 500.
  const { data: dep } = await admin
    .from("fixed_asset_depreciation").select("amount").eq("organization_id", fx.orgId);
  expect(dep!.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(500);

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/fixed-assets");
  await expect(page.getByRole("heading", { name: /Fixed Assets & Depreciation/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("FA-001")).toBeVisible();
  await expect(page.getByText("Backup Generator")).toBeVisible();
  // NBV label and the 500.00 value are both on screen.
  await expect(page.getByText(/Net Book Value/i).first()).toBeVisible();
  await expect(page.getByText("500 EGP").first()).toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});

test("an organization with no assets sees an explained empty register, never invented rows", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "empty", "TENANT_OWNER");

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/fixed-assets");
  await expect(page.getByRole("heading", { name: /Fixed Assets & Depreciation/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No fixed assets found/i)).toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});

test("a member without report permission is denied", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "noperm", null);

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/fixed-assets");
  await expect(
    page.getByText(/don't have permission to view this report|do not have permission to view this report/i),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("FA-001")).toHaveCount(0);

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});
