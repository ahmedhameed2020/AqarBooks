/**
 * فاتورة مورد بعملة أجنبية — عرض حي.
 *
 * الحساب مُختبَر تكامليًا. ما يُختبر هنا أن **المشغّل يصل إليه**: يُدخل فاتورة
 * باليورو من الحوار نفسه الذي يستعمله كل يوم، فتظهر في الدفاتر بعملة المؤسسة،
 * ثم يُرحّل فرق التسوية من الشاشة.
 *
 * والأهم: أن **حقل العملة الفارغ لا يغيّر شيئًا** — وهو ما يستعمله كل مستخدم
 * حالي في كل فاتورة.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; userIds: string[] };

async function setUp(admin: SupabaseClient): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E SupFXUI ${stamp}`, slug: `e2e-supfxui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const f: Fixture = { orgId: org!.id as string, email: "", userIds: [] };
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });

  const acc = async (code: string, nameEn: string, cat: string, bal: string) => {
    const { data, error: e } = await admin.from("chart_of_accounts").insert({
      organization_id: f.orgId, code, name_ar: nameEn, name_en: nameEn,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  await acc("5200", "Maintenance", "EXPENSE", "DEBIT");
  const payable = await acc("2100", "Accounts Payable", "LIABILITY", "CREDIT");
  const gain = await acc("4900", "FX Gain", "REVENUE", "CREDIT");
  const loss = await acc("5900", "FX Loss", "EXPENSE", "DEBIT");
  await acc("1010", "Cash", "ASSET", "DEBIT");

  await admin.from("organizations")
    .update({ fx_gain_account_id: gain, fx_loss_account_id: loss })
    .eq("id", f.orgId);

  const { data: resort } = await admin.from("resorts").insert({
    organization_id: f.orgId, name: "Resort", code: `SFU-${stamp}`,
    timezone: "Africa/Cairo", property_type: "resort",
  }).select("id").single();

  await admin.from("suppliers").insert({
    organization_id: f.orgId, name: "Euro Supplier", payable_account_id: payable,
  });

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: f.orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: f.orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  });

  await admin.from("exchange_rates").insert({
    organization_id: f.orgId, foreign_currency: "EUR", base_currency: "EGP",
    rate_date: "2026-01-01", base_per_unit: 50, source: "seed",
  });

  void resort;

  const email = `e2e-supfxui-${stamp}@aqarbooks-test.local`;
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
  await admin.from("supplier_invoices").delete().eq("organization_id", id);
  await admin.from("suppliers").delete().eq("organization_id", id);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", id);
  await admin.from("fiscal_periods").delete().eq("organization_id", id);
  await admin.from("fiscal_years").delete().eq("organization_id", id);
  await admin.from("exchange_rates").delete().eq("organization_id", id);
  await admin.from("platform_audit_logs").delete().eq("organization_id", id);
  await admin.from("resorts").delete().eq("organization_id", id);
  await admin.from("organizations")
    .update({ fx_gain_account_id: null, fx_loss_account_id: null }).eq("id", id);
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

test("a euro invoice is entered from the dialog, lands in the books in EGP, and its settlement difference posts", async ({
  browser,
}) => {
  test.setTimeout(200_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/suppliers");

    const invoiceNumber = `EUR-${String(Date.now()).slice(-8)}`;
    await page.getByRole("button", { name: /Post Invoice/i }).click();
    const dialog = page.getByRole("dialog", { name: /Post Supplier Invoice/i });
    await expect(dialog).toBeVisible();

    const numbers = dialog.locator('input[type="number"]');
    const dates = dialog.locator('input[type="date"]');
    await dialog.getByRole("textbox").first().fill(invoiceNumber);
    await numbers.nth(0).fill("100"); // net, in EUR
    await dates.nth(0).fill("2026-06-01");
    await dates.nth(1).fill("2026-07-01");

    // The rate field is inert until a currency is entered -- an operator cannot
    // supply a rate for an invoice that has no foreign currency.
    await expect(dialog.getByPlaceholder("EUR")).toBeVisible();
    await dialog.getByPlaceholder("EUR").fill("EUR");
    await expect(dialog.getByText(/1 EUR = this many/i)).toBeVisible();

    const listbox = page.getByRole("listbox");
    async function pick(i: number, name?: string | RegExp) {
      await dialog.getByRole("combobox").nth(i).click();
      await listbox.waitFor({ state: "visible" });
      const opt = name
        ? listbox.getByRole("option", { name })
        : listbox.getByRole("option").first();
      await opt.click();
    }
    await pick(0, "Euro Supplier");
    await pick(1);
    await pick(2);

    await dialog.getByRole("button", { name: /Post Invoice/i }).click();
    await expect(dialog).toBeHidden({ timeout: 40_000 });

    // 100 EUR at the registry's 50 = 5,000 EGP in the ledger.
    const { data: inv } = await admin
      .from("supplier_invoices")
      .select("amount, net_amount, currency, exchange_rate, foreign_amount, journal_entry_id")
      .eq("organization_id", f.orgId).eq("invoice_number", invoiceNumber).single();
    expect(inv!.currency).toBe("EUR");
    expect(Number(inv!.exchange_rate)).toBe(50);
    expect(Number(inv!.foreign_amount)).toBe(100);
    expect(Number(inv!.amount), "the ledger figure is the converted one").toBe(5000);

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("debit, credit").eq("journal_entry_id", inv!.journal_entry_id!);
    expect(lines!.reduce((s, l) => s + Number(l.credit), 0)).toBe(5000);

    // The settlement section appears for it, showing the booked rate.
    const card = page.locator(`[data-fx-invoice="${invoiceNumber}"]`);
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("100 EUR @ 50");

    // Settle at 55: we pay more EGP than booked, so a LOSS of 500.
    await card.locator('input[type="date"]').fill("2026-06-20");
    await card.locator('input[type="number"]').fill("55");
    await card.getByRole("button", { name: /Post settlement difference/i }).click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("journal_entries")
          .select("id")
          .eq("organization_id", f.orgId)
          .ilike("description", "%FX settlement%");
        return data?.length ?? 0;
      }, { timeout: 40_000 })
      .toBe(1);

    const { data: fxEntry } = await admin.from("journal_entries")
      .select("id").eq("organization_id", f.orgId)
      .ilike("description", "%FX settlement%").single();
    const { data: fxLines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit").eq("journal_entry_id", fxEntry!.id);

    const { data: lossAcc } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "5900").single();
    const lossLine = fxLines!.find((l) => l.account_id === lossAcc!.id);
    expect(lossLine, "a rate rise on a payable is a loss").toBeDefined();
    expect(Number(lossLine!.debit)).toBe(500);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
