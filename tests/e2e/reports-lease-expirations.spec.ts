/**
 * Lease expirations report: the page must load real lease data through the schema's actual relation
 * (units.property_id -> properties), show only the signed-in organization's leases, and never another's.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Tenant = { orgId: string; ownerEmail: string; userId: string; leaseNames: string[] };

async function seedOrg(admin: SupabaseClient, label: string, tenantName: string, unitCode: string): Promise<Tenant> {
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin.from("organizations").insert({
    name: `Lease ${label} ${stamp}`, slug: `lease-${label}-${stamp}`, default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const ownerEmail = `lease-${label}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: ownerEmail, password: PASSWORD, email_confirm: true,
  });
  expect(userErr, `user create failed: ${userErr?.message}`).toBeNull();
  const userId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles").select("id")
    .eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments").insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data, error } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code, category: cat, normal_balance: bal,
      is_group: false, is_active: true,
    }).select("id").single();
    expect(error, `account ${code} failed: ${error?.message}`).toBeNull();
    return data!.id as string;
  };
  const receivable = await acc("1200", "ASSET", "DEBIT");
  const revenue = await acc("4100", "REVENUE", "CREDIT");

  const { data: dueType, error: dueErr } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue, name_ar: "إيجار", name_en: "Rent", is_active: true,
  }).select("id").single();
  expect(dueErr, `due type failed: ${dueErr?.message}`).toBeNull();

  const { data: property, error: propErr } = await admin.from("properties").insert({
    organization_id: orgId, name: `Resort ${label}`, code: `RS-${label}-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  expect(propErr, `property failed: ${propErr?.message}`).toBeNull();

  const { data: unit, error: unitErr } = await admin.from("units").insert({
    organization_id: orgId, property_id: property!.id, code: unitCode, unit_type: "APARTMENT",
  }).select("id").single();
  expect(unitErr, `unit failed: ${unitErr?.message}`).toBeNull();

  const { data: member, error: memErr } = await admin.from("members").insert({
    organization_id: orgId, full_name: tenantName,
  }).select("id").single();
  expect(memErr, `member failed: ${memErr?.message}`).toBeNull();

  const day = 24 * 60 * 60 * 1000;
  const { error: leaseErr } = await admin.from("unit_leases").insert({
    organization_id: orgId, property_id: property!.id, unit_id: unit!.id, tenant_member_id: member!.id,
    starts_on: new Date(Date.now() - 30 * day).toISOString().slice(0, 10),
    ends_on: new Date(Date.now() + 60 * day).toISOString().slice(0, 10),
    rent_amount: 1000, rent_frequency: "MONTHLY", billing_recipient: "TENANT",
    due_type_id: dueType!.id, receivable_account_id: receivable, status: "ACTIVE",
  });
  expect(leaseErr, `lease failed: ${leaseErr?.message}`).toBeNull();

  return { orgId, ownerEmail, userId, leaseNames: [tenantName] };
}

async function signInUi(page: Page, email: string) {
  await page.goto(`${baseURL}/ar/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
}

test("lease expirations loads real leases, shows only this organization's, and never another's", async ({ page }) => {
  test.setTimeout(240_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const stamp = Date.now();
  const alpha = await seedOrg(admin, `a${stamp}`, `Tenant Alpha ${stamp}`, `ALPHA-${stamp}`);
  const beta = await seedOrg(admin, `b${stamp}`, `Foreign Tenant ${stamp}`, `FOREIGN-${stamp}`);
  try {
    await signInUi(page, alpha.ownerEmail);
    await page.goto(`${baseURL}/ar/finance/reports/lease-expirations`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير جداول انتهاء العقود ومعدل دوران الإشغال");
    await expect(page.getByText(alpha.leaseNames[0]).first()).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(`ALPHA-${stamp}`).first()).toBeVisible();
    await expect(page.getByText(`Foreign Tenant ${stamp}`), "another organization's tenant must not appear").toHaveCount(0);
    await expect(page.getByText(`FOREIGN-${stamp}`), "another organization's unit must not appear").toHaveCount(0);
  } finally {
    await admin.from("organizations").delete().eq("id", alpha.orgId);
    await admin.from("organizations").delete().eq("id", beta.orgId);
    await admin.auth.admin.deleteUser(alpha.userId);
    await admin.auth.admin.deleteUser(beta.userId);
  }
});
