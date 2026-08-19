/**
 * شاشة أسعار الصرف — عرض حي.
 *
 * الحساب مُختبَر في `tests/exchange-rates.integration.test.ts`. ما يُختبر هنا أن
 * المشغّل يستطيع تسجيل سعر من المتصفح، وأن الشاشة **تُسمّي الاتجاه صراحة** —
 * فعكس السعر أشهر أخطاء هذا الباب، ولافتة «السعر» وحدها تدعو إليه.
 *
 * ويُثبت أن السعر الأقدم **يُحفظ ويُعرض** لا يُستبدل: معاملة مؤرّخة في الماضي
 * تُقيَّم بسعر يومها، فالسعر القديم تاريخ حيّ لا فضلة.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; userIds: string[] };

async function makeUser(
  admin: SupabaseClient, f: Fixture, roleKey: string, tag: string,
): Promise<string> {
  const email = `e2e-fxui-${tag}-${Date.now()}@aqarbooks-test.local`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: STAFF_PASSWORD, email_confirm: true,
  });
  expect(error, `user create failed: ${error?.message}`).toBeNull();
  const userId = created!.user!.id;
  f.userIds.push(userId);
  await admin.from("organization_memberships")
    .insert({ organization_id: f.orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", f.orgId).eq("key", roleKey).single();
  expect(role, `role ${roleKey} missing`).not.toBeNull();
  await admin.from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: f.orgId });
  return email;
}

async function setUp(admin: SupabaseClient): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E FX UI ${stamp}`, slug: `e2e-fx-ui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const f: Fixture = { orgId: org!.id as string, email: "", userIds: [] };
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });
  f.email = await makeUser(admin, f, "TENANT_OWNER", "owner");
  return f;
}

async function cleanUp(admin: SupabaseClient, f: Fixture) {
  const id = f.orgId;
  await admin.from("exchange_rates").delete().eq("organization_id", id);
  await admin.from("platform_audit_logs").delete().eq("organization_id", id);
  await admin.from("user_role_assignments").delete().eq("organization_id", id);
  await admin.from("organization_memberships").delete().eq("organization_id", id);
  const { error } = await admin.from("organizations").delete().eq("id", id);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  for (const u of f.userIds) await admin.auth.admin.deleteUser(u);
}

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 40_000 });
}

test("a rate is recorded, the direction is spelled out, and a superseded rate is kept", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/exchange-rates");

    await expect(page.getByRole("heading", { name: /Exchange Rates/i })).toBeVisible();

    // With no rate at all, the screen must say what that MEANS -- that foreign
    // amounts are refused -- rather than showing a neutral empty table.
    await expect(page.getByText(/will be refused until one is/i)).toBeVisible();

    // The direction is stated on the form itself, not left to the operator.
    await expect(page.getByText(/1 foreign unit = this many EGP/i)).toBeVisible();

    await page.locator("#fx-foreign").fill("EUR");
    await page.locator("#fx-rate").fill("50");
    await page.locator("#fx-date").fill("2026-06-01");
    await page.locator("#fx-source").fill("Central bank");
    await page.getByRole("button", { name: /Record rate/i }).click();

    const row = page.locator('[data-rate="EUR/EGP"]');
    await expect(row).toBeVisible({ timeout: 40_000 });
    await expect(row, "the rate reads as a sentence, not a bare number")
      .toContainText("1 EUR = 50 EGP");

    // A newer rate supersedes it in "in force" but the old one is KEPT, because
    // a transaction dated in May must still be valued at May's rate.
    await page.locator("#fx-foreign").fill("EUR");
    await page.locator("#fx-rate").fill("55");
    await page.locator("#fx-date").fill("2026-06-10");
    await page.getByRole("button", { name: /Record rate/i }).click();

    await expect(page.locator('[data-rate="EUR/EGP"]'))
      .toContainText("1 EUR = 55 EGP", { timeout: 40_000 });
    await expect(
      page.locator('[data-rate-history="EUR-2026-06-01"]'),
      "the superseded rate stays visible as history",
    ).toBeVisible();

    // A second rate for the same pair on the same day is refused, with a
    // message that says to correct rather than add.
    await page.locator("#fx-foreign").fill("EUR");
    await page.locator("#fx-rate").fill("60");
    await page.locator("#fx-date").fill("2026-06-10");
    await page.getByRole("button", { name: /Record rate/i }).click();
    // Scoped to the form: the page's standing warning banner is also an alert.
    await expect(
      page.locator("form").getByRole("alert"),
    ).toContainText(/already has a rate on that date/i, { timeout: 40_000 });

    // The database agrees: two rates for the pair, not three.
    const { data: stored } = await admin
      .from("exchange_rates").select("base_per_unit")
      .eq("organization_id", f.orgId).eq("foreign_currency", "EUR");
    expect(stored, "the refused duplicate was not written").toHaveLength(2);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a reader sees the rates without the form, and someone with neither permission is told so", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    await admin.from("exchange_rates").insert({
      organization_id: f.orgId, foreign_currency: "USD", base_currency: "EGP",
      rate_date: "2026-01-01", base_per_unit: 48, source: "seed",
    });

    // A CASHIER reads rates -- they take foreign cash -- but cannot set them.
    const cashier = await makeUser(admin, f, "CASHIER", "cashier");
    const readCtx = await browser.newContext();
    const readPage = await readCtx.newPage();
    await signIn(readPage, cashier);
    await readPage.goto("/en/finance/exchange-rates");

    await expect(readPage.locator('[data-rate="USD/EGP"]')).toBeVisible();
    await expect(readPage.getByRole("button", { name: /Record rate/i })).toHaveCount(0);
    await readCtx.close();

    const storekeeper = await makeUser(admin, f, "STOREKEEPER", "store");
    const denyCtx = await browser.newContext();
    const denyPage = await denyCtx.newPage();
    await signIn(denyPage, storekeeper);
    await denyPage.goto("/en/finance/exchange-rates");

    await expect(
      denyPage.getByText(/don't have permission to view exchange rates/i),
    ).toBeVisible();
    await expect(denyPage.locator("[data-rate]")).toHaveCount(0);
    await denyCtx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
