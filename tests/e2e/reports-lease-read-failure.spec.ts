/**
 * Lease expirations: when the data read fails, the page must say so, and must not show partial or empty rows as if
 * the schedule were complete. The failure is injected on r6 only, by revoking SELECT on members from the app role for
 * the duration of this one test, and restored in finally. Nothing in r6 data is changed.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const R6_DB = "g0r6-db";

/** Runs one fixed statement on the r6 database container. Only the two statements below are ever passed in. */
function r6Sql(statement: string) {
  if (!/^(REVOKE SELECT ON public\.members FROM authenticated|GRANT SELECT ON public\.members TO authenticated);$/.test(statement)) {
    throw new Error(`refused: statement is not an allowed r6 grant change: ${statement}`);
  }
  execFileSync("docker", ["exec", R6_DB, "sh", "-c",
    `psql -h /run/postgresql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c "${statement}"`], { stdio: "pipe" });
}

function membersSelectGranted(): boolean {
  const out = execFileSync("docker", ["exec", R6_DB, "sh", "-c",
    "psql -h /run/postgresql -U postgres -d postgres -X -At -c \"select has_table_privilege('authenticated','public.members','SELECT');\""],
    { encoding: "utf8" });
  return out.trim() === "t";
}

async function signInUi(page: Page, email: string) {
  await page.goto(`${baseURL}/ar/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
}

test("lease expirations shows the read error instead of partial or empty rows when the data read fails", async ({ page }) => {
  test.setTimeout(240_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin.from("organizations").insert({
    name: `Lease failure ${stamp}`, slug: `lease-failure-${stamp}`, default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const email = `lease-failure-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(userErr, `user create failed: ${userErr?.message}`).toBeNull();
  const userId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments").insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  const { data: receivable } = await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "1200", name_ar: "1200", name_en: "1200", category: "ASSET", normal_balance: "DEBIT", is_group: false, is_active: true,
  }).select("id").single();
  const { data: revenue } = await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "4100", name_ar: "4100", name_en: "4100", category: "REVENUE", normal_balance: "CREDIT", is_group: false, is_active: true,
  }).select("id").single();
  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id, name_ar: "إيجار", name_en: "Rent", is_active: true,
  }).select("id").single();
  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "Failure Resort", code: `RF-${stamp}`, timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: property!.id, code: `FAIL-${stamp}`, unit_type: "APARTMENT",
  }).select("id").single();
  const tenantName = `Tenant Behind Failure ${stamp}`;
  const { data: member } = await admin.from("members").insert({ organization_id: orgId, full_name: tenantName }).select("id").single();
  const day = 24 * 60 * 60 * 1000;
  const { error: leaseErr } = await admin.from("unit_leases").insert({
    organization_id: orgId, property_id: property!.id, unit_id: unit!.id, tenant_member_id: member!.id,
    starts_on: new Date(Date.now() - 30 * day).toISOString().slice(0, 10),
    ends_on: new Date(Date.now() + 60 * day).toISOString().slice(0, 10),
    rent_amount: 1000, rent_frequency: "MONTHLY", billing_recipient: "TENANT",
    due_type_id: dueType!.id, receivable_account_id: receivable!.id, status: "ACTIVE",
  });
  expect(leaseErr, `lease failed: ${leaseErr?.message}`).toBeNull();

  try {
    // Inject the failure: the embedded members read is refused for the app role.
    expect(membersSelectGranted(), "precondition: the app role can read members before the injection").toBe(true);
    r6Sql("REVOKE SELECT ON public.members FROM authenticated;");
    expect(membersSelectGranted(), "the injection must be in effect").toBe(false);

    await signInUi(page, email);
    await page.goto(`${baseURL}/ar/finance/reports/lease-expirations`);
    await page.waitForLoadState("domcontentloaded");

    // The page states the failure, and shows no tenant row (neither the real one nor an empty table).
    await expect(page.getByText("تعذر تحميل بيانات انتهاء العقود.")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(tenantName), "a failed read must not show a tenant row").toHaveCount(0);
  } finally {
    r6Sql("GRANT SELECT ON public.members TO authenticated;");
    expect(membersSelectGranted(), "the grant must be restored after the test").toBe(true);
    await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
  }
});
