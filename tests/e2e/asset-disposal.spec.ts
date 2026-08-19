/**
 * الحسابات المعيَّنة واستبعاد الأصول — عرض حي.
 *
 * الحساب مُختبَر تكامليًا. ما يُختبر هنا **الرحلة الكاملة كما يعيشها المشغّل**:
 * يحاول الاستبعاد فيُرفض بسبب مفهوم، فيذهب إلى الشاشة التي تُعيّن الحسابات،
 * فيعود فينجح. الرفض الذي لا يقول أين يُعالَج ليس حماية بل حائط.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; userIds: string[]; assetCode: string };

async function setUp(admin: SupabaseClient): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Disp UI ${stamp}`, slug: `e2e-disp-ui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const f: Fixture = { orgId: org!.id as string, email: "", userIds: [], assetCode: `FA-${String(stamp).slice(-8)}` };

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });

  const acc = async (code: string, nameEn: string, cat: string, bal: string) => {
    const { data, error: e } = await admin.from("chart_of_accounts").insert({
      organization_id: f.orgId, code, name_ar: nameEn, name_en: nameEn,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  const assetAcc = await acc("1210", "Buildings", "ASSET", "DEBIT");
  const accumAcc = await acc("1220", "Accumulated Depreciation", "ASSET", "DEBIT");
  const expenseAcc = await acc("5500", "Depreciation Expense", "EXPENSE", "DEBIT");
  await acc("1010", "Cash", "ASSET", "DEBIT");
  await acc("5910", "Loss on Disposal", "EXPENSE", "DEBIT");
  await acc("4910", "Gain on Disposal", "REVENUE", "CREDIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: f.orgId, name: "P", code: `DU-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: f.orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: f.orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  });

  await admin.from("fixed_assets").insert({
    organization_id: f.orgId, property_id: property!.id, code: f.assetCode,
    name_ar: "مبنى", name_en: "Building",
    asset_account_id: assetAcc,
    accumulated_depreciation_account_id: accumAcc,
    depreciation_expense_account_id: expenseAcc,
    acquisition_date: "2026-01-01",
    acquisition_cost: 10000, salvage_value: 0, useful_life_months: 10,
  });

  const email = `e2e-disp-owner-${stamp}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: STAFF_PASSWORD, email_confirm: true,
  });
  f.userIds.push(created!.user!.id);
  await admin.from("organization_memberships")
    .insert({ organization_id: f.orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", f.orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: f.orgId });
  f.email = email;
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
  await admin.from("properties").delete().eq("organization_id", id);
  await admin.from("organizations").update({
    asset_disposal_gain_account_id: null, asset_disposal_loss_account_id: null,
  }).eq("id", id);
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

test("disposal is refused until the accounts are designated, then succeeds and closes the asset", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);

    // 1. Try to dispose with nothing designated.
    await page.goto("/en/finance/assets");
    await expect(page.locator(`[data-asset="${f.assetCode}"]`)).toBeVisible();

    await page.locator("#dispose-proceeds").fill("7000");
    await page.locator("#dispose-account").selectOption({ label: "1010 — Cash" });
    await page.locator("#dispose-date").fill("2026-06-01");
    await page.getByRole("button", { name: /^Dispose$/i }).click();

    // The refusal must say where to fix it, not merely that it failed.
    const refusal = page.locator("form").getByRole("alert");
    await expect(refusal).toContainText(/Designate the disposal gain and loss accounts first/i, {
      timeout: 40_000,
    });
    await expect(refusal).toContainText(/Designated Accounts/i);

    // 2. Go and designate them.
    await page.goto("/en/admin/finance/accounting-accounts");
    const disposal = page.locator('[data-designation="disposal"]');
    await expect(disposal).toHaveAttribute("data-ready", "no");

    await disposal.locator("#disposal-gain").selectOption({ label: "4910 — Gain on Disposal" });
    await disposal.locator("#disposal-loss").selectOption({ label: "5910 — Loss on Disposal" });
    await disposal.getByRole("button", { name: /^Save$/i }).click();

    await expect(page.locator('[data-designation="disposal"]')).toHaveAttribute(
      "data-ready", "yes", { timeout: 40_000 },
    );

    // 3. Now the disposal goes through.
    await page.goto("/en/finance/assets");
    await page.locator("#dispose-proceeds").fill("7000");
    await page.locator("#dispose-account").selectOption({ label: "1010 — Cash" });
    await page.locator("#dispose-date").fill("2026-06-01");
    await page.locator("#dispose-reason").fill("sold");
    await page.getByRole("button", { name: /^Dispose$/i }).click();

    await expect(page.locator(`[data-asset="${f.assetCode}"]`)).toHaveAttribute(
      "data-status", "DISPOSED", { timeout: 40_000 },
    );

    // 4. The ledger agrees: cost out in full, loss = book value - proceeds.
    // No depreciation was posted, so book value is the full 10,000 and selling
    // for 7,000 is a 3,000 loss.
    const { data: entry } = await admin
      .from("journal_entries").select("id")
      .eq("organization_id", f.orgId).eq("source_type", "JOURNAL_VOUCHER").single();
    const { data: lines } = await admin
      .from("journal_entry_lines").select("account_id, debit, credit")
      .eq("journal_entry_id", entry!.id);

    const debit = lines!.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines!.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit, "the disposal entry balances").toBe(credit);
    expect(credit, "the asset leaves at its full original cost").toBe(10000);

    const { data: lossAcc } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "5910").single();
    const lossLine = lines!.find((l) => l.account_id === lossAcc!.id);
    expect(Number(lossLine!.debit), "loss = 10,000 book value - 7,000 proceeds").toBe(3000);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
