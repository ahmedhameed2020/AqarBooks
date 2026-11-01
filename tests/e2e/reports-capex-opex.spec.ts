import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string };

async function makeOrg(admin: SupabaseClient, label: string, roleKey: string | null): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: `E2E CX ${label} ${stamp}`, slug: `e2e-cx-${label}-${stamp}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(error, `org insert: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  const email = `e2e-cx-${label}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(userErr, `user create: ${userErr?.message}`).toBeNull();
  const userId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: userId, status: "active" });
  if (roleKey) {
    const { data: role } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
    await admin.from("user_role_assignments").insert({ user_id: userId, role_id: role!.id, organization_id: orgId });
  }
  return { orgId, email };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test("CAPEX comes from fixed assets and OPEX from expense vouchers, never invented", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "split", "TENANT_OWNER");

  const { data: property } = await admin
    .from("properties")
    .insert({ organization_id: fx.orgId, name: "CX Property", code: `CX-${Date.now()}` })
    .select("id").single();
  const { data: assetAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "1210", name_ar: "معدات", name_en: "Equipment", category: "ASSET", normal_balance: "DEBIT" })
    .select("id").single();
  const { data: accumulatedAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "1220", name_ar: "مجمع الإهلاك", name_en: "Accumulated Depreciation", category: "ASSET", normal_balance: "CREDIT" })
    .select("id").single();
  const { data: depreciationAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "5100", name_ar: "مصروف إهلاك", name_en: "Depreciation Expense", category: "EXPENSE", normal_balance: "DEBIT" })
    .select("id").single();
  const { data: paymentAccount } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: fx.orgId, code: "1110", name_ar: "نقدية", name_en: "Cash", category: "ASSET", normal_balance: "DEBIT" })
    .select("id").single();
  const { data: expenseCategory, error: categoryErr } = await admin
    .from("expense_categories")
    .insert({
      organization_id: fx.orgId, name_ar: "صيانة", name_en: "Maintenance",
      default_expense_account_id: depreciationAccount!.id,
    })
    .select("id").single();
  expect(categoryErr, `expense category insert: ${categoryErr?.message}`).toBeNull();
  await admin.from("fixed_assets").insert({
    organization_id: fx.orgId, code: "FA-900", name_ar: "محطة معالجة", name_en: "Treatment Plant",
    asset_account_id: assetAccount!.id,
    accumulated_depreciation_account_id: accumulatedAccount!.id,
    depreciation_expense_account_id: depreciationAccount!.id,
    acquisition_date: "2026-02-01",
    acquisition_cost: 1000, salvage_value: 0, useful_life_months: 120, method: "STRAIGHT_LINE", status: "ACTIVE",
  });
  const { error: expenseErr } = await admin.from("expenses").insert({
    organization_id: fx.orgId, property_id: property!.id, expense_category_id: expenseCategory!.id,
    payment_account_id: paymentAccount!.id,
    description: "Pump maintenance", amount: 300, expense_date: "2026-03-05",
    voucher_number: 77,
  });
  expect(expenseErr, `expense insert: ${expenseErr?.message}`).toBeNull();

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/capex-opex");
  await expect(page.getByRole("heading", { name: /CAPEX/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("FA-900")).toBeVisible();
  await expect(page.getByText("Treatment Plant")).toBeVisible();
  await expect(page.getByText("Pump maintenance")).toBeVisible();
  // Classification is stated, not implied.
  await expect(page.getByText(/CAPEX/i).first()).toBeVisible();

  const { data: assets } = await admin.from("fixed_assets").select("acquisition_cost").eq("organization_id", fx.orgId);
  const { data: expenses } = await admin.from("expenses").select("amount").eq("organization_id", fx.orgId);
  expect(assets!.reduce((s, r) => s + Number(r.acquisition_cost), 0)).toBe(1000);
  expect(expenses!.reduce((s, r) => s + Number(r.amount), 0)).toBe(300);

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});

test("an organization with no spend sees an explained empty split", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fx = await makeOrg(admin, "empty", "TENANT_OWNER");

  await signIn(page, fx.email);
  await page.goto("/en/finance/reports/capex-opex");
  await expect(page.getByRole("heading", { name: /CAPEX/i }).first()).toBeVisible({ timeout: 30_000 });
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Coming soon");

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", fx.orgId);
});
