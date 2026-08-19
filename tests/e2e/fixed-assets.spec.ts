/**
 * شاشة الأصول الثابتة — عرض حي.
 *
 * الحساب نفسه مُختبَر في `tests/fixed-assets.integration.test.ts`. ما يُختبر هنا
 * شيء آخر تمامًا: أن **المشغّل يستطيع فعل ذلك من المتصفح** — يسجّل أصلًا، يشغّل
 * فترة، فتنخفض القيمة الدفترية على الشاشة. مكوّن خادم يستورد من ملف "use client"
 * يفشل بطريقة يقبلها `tsc` والبناء معًا، وهذا المستودع لُدغ بها قبلًا.
 *
 * ويُثبت أيضًا ما لا يظهر إلا في الواجهة: أن إعادة تشغيل الفترة نفسها **تقول
 * صراحة إنها لم تُرحّل شيئًا** بدل أن تبدو فشلًا أو نجاحًا مضاعفًا.
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
  admin: SupabaseClient,
  f: Fixture,
  roleKey: string,
  tag: string,
): Promise<string> {
  const email = `e2e-fa-${tag}-${Date.now()}@aqarbooks-test.local`;
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
  const { data: org, error: orgErr } = await admin.from("organizations").insert({
    name: `E2E FA UI ${stamp}`, slug: `e2e-fa-ui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const f: Fixture = { orgId: org!.id as string, email: "", userIds: [] };

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });

  const acc = async (code: string, nameEn: string, cat: string) => {
    const { data, error } = await admin.from("chart_of_accounts").insert({
      organization_id: f.orgId, code, name_ar: nameEn, name_en: nameEn,
      category: cat, normal_balance: "DEBIT", is_group: false, is_active: true,
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  };
  await acc("1210", "Buildings", "ASSET");
  await acc("1220", "Accumulated Depreciation", "ASSET");
  await acc("5500", "Depreciation Expense", "EXPENSE");

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: f.orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: f.orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-01-31", status: "OPEN",
  });

  f.email = await makeUser(admin, f, "TENANT_OWNER", "owner");
  return f;
}

async function cleanUp(admin: SupabaseClient, f: Fixture) {
  const id = f.orgId;
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", id);
  await admin.from("fixed_asset_depreciation").delete().eq("organization_id", id);
  await admin.from("fixed_assets").delete().eq("organization_id", id);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", id);
  await admin.from("fiscal_periods").delete().eq("organization_id", id);
  await admin.from("fiscal_years").delete().eq("organization_id", id);
  await admin.from("platform_audit_logs").delete().eq("organization_id", id);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", id);
  await admin.from("chart_of_accounts").delete().eq("organization_id", id);
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

test("an asset is registered, a period is posted, and the book value drops on screen", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/assets");

    await expect(page.getByRole("heading", { name: /Fixed Assets/i })).toBeVisible();

    // 12,000 over 12 months with no salvage: a deliberately clean 1,000/month,
    // because the rounding edge is the integration test's job, not this one's.
    const code = `FA-${String(Date.now()).slice(-8)}`;
    await page.locator("#asset-code").fill(code);
    await page.locator("#asset-ar").fill("مبنى الاختبار");
    await page.locator("#asset-en").fill("Test Building");
    await page.locator("#asset-cost").fill("12000");
    await page.locator("#asset-salvage").fill("0");
    await page.locator("#asset-life").fill("12");
    await page.locator("#asset-date").fill("2026-01-01");
    await page.locator("#asset-account").selectOption({ label: "1210 — Buildings" });
    await page.locator("#asset-accum").selectOption({ label: "1220 — Accumulated Depreciation" });
    await page.locator("#asset-expense").selectOption({ label: "5500 — Depreciation Expense" });
    await page.getByRole("button", { name: /Register asset/i }).click();

    const row = page.locator(`[data-asset="${code}"]`);
    await expect(row).toBeVisible({ timeout: 40_000 });
    await expect(row, "a new asset carries its full cost").toHaveAttribute("data-nbv", "12000");
    await expect(row).toHaveAttribute("data-status", "ACTIVE");

    // Post one period. The book value must fall by exactly one instalment.
    await page.getByRole("button", { name: /Run depreciation/i }).click();
    await expect(page.locator("[data-run-result]")).toHaveAttribute("data-run-result", "1", {
      timeout: 40_000,
    });
    await expect(page.locator(`[data-asset="${code}"]`)).toHaveAttribute("data-nbv", "11000", {
      timeout: 40_000,
    });

    // Re-running the SAME period must say plainly that it posted nothing --
    // closing a month twice is normal, and an operator needs to see that the
    // second pass was a no-op rather than guess.
    await page.getByRole("button", { name: /Run depreciation/i }).click();
    await expect(page.locator("[data-run-result]")).toHaveAttribute("data-run-result", "0", {
      timeout: 40_000,
    });
    await expect(page.getByText(/already done/i)).toBeVisible();
    await expect(page.locator(`[data-asset="${code}"]`)).toHaveAttribute("data-nbv", "11000");

    // And the ledger agrees with the screen: exactly one balanced entry.
    const { data: deps } = await admin
      .from("fixed_asset_depreciation")
      .select("amount, journal_entry_id")
      .eq("organization_id", f.orgId);
    expect(deps, "exactly one instalment, not two").toHaveLength(1);
    expect(Number(deps![0].amount)).toBe(1000);

    const { data: lines } = await admin
      .from("journal_entry_lines")
      .select("debit, credit")
      .eq("journal_entry_id", deps![0].journal_entry_id!);
    const debit = lines!.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines!.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(1000);
    expect(credit).toBe(1000);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a reader sees the register without the controls, and someone with neither permission is told so", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    // AUDITOR reads assets but cannot manage them: the register is visible,
    // the controls are not. Offering a button the RPC would refuse is worse
    // than not offering it.
    const auditor = await makeUser(admin, f, "AUDITOR", "auditor");
    const readCtx = await browser.newContext();
    const readPage = await readCtx.newPage();
    await signIn(readPage, auditor);
    await readPage.goto("/en/finance/assets");

    await expect(readPage.getByRole("heading", { name: /Fixed Assets/i })).toBeVisible();
    await expect(readPage.getByRole("button", { name: /Register asset/i })).toHaveCount(0);
    await expect(readPage.getByRole("button", { name: /Run depreciation/i })).toHaveCount(0);
    await readCtx.close();

    // STOREKEEPER holds neither permission: the refusal is stated.
    const storekeeper = await makeUser(admin, f, "STOREKEEPER", "store");
    const denyCtx = await browser.newContext();
    const denyPage = await denyCtx.newPage();
    await signIn(denyPage, storekeeper);
    await denyPage.goto("/en/finance/assets");

    await expect(
      denyPage.getByText(/don't have permission to view the fixed asset register/i),
    ).toBeVisible();
    await expect(denyPage.locator("[data-asset]")).toHaveCount(0);
    await denyCtx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
