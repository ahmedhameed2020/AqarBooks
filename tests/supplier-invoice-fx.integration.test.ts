/**
 * فاتورة مورد بعملة أجنبية، وفرق تسويتها.
 *
 * الادّعاء الأول والأهم: **المسار القديم لم يتغيّر.** فاتورة بعملة المؤسسة تمرّ
 * عبر الغلاف إلى الدالة القائمة كما كانت تمامًا، ولا تُكتب لها بيانات عملة. لو
 * انكسر هذا لانكسرت كل فاتورة مورد في النظام، فهو أول ما يُختبر.
 *
 * والثاني: **الدفاتر بعملة المؤسسة وحدها.** مبلغ اليورو يُحفظ على المستند
 * للمطابقة، والقيد يحمل مقابله بالجنيه — دفتر بعملتين ليس دفترًا.
 *
 * والثالث: اتجاه فرق التسوية. ارتفاع سعر الصرف بين التسجيل والسداد يعني أننا
 * ندفع **أكثر** بعملة الدفاتر، أي **خسارة**. عكس هذه الإشارة يقلب الربح خسارة
 * في كل فاتورة أجنبية، ولذلك يُختبر الاتجاهان معًا لا أحدهما.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let orgId: string;
let resortId: string;
let supplierId: string;
let periodId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;
let expenseAcc: string, payableAcc: string, gainAcc: string, lossAcc: string, vatAcc: string;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E SupFX ${stamp}`, slug: `e2e-supfx-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data, error: e } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  expenseAcc = await acc("5200", "EXPENSE", "DEBIT");
  payableAcc = await acc("2100", "LIABILITY", "CREDIT");
  gainAcc = await acc("4900", "REVENUE", "CREDIT");
  lossAcc = await acc("5900", "EXPENSE", "DEBIT");
  vatAcc = await acc("1250", "ASSET", "DEBIT");

  const { data: resort } = await admin.from("resorts").insert({
    organization_id: orgId, name: "R", code: `SFX-${stamp}`,
    timezone: "Africa/Cairo", property_type: "resort",
  }).select("id").single();
  resortId = resort!.id as string;

  const { data: supplier } = await admin.from("suppliers").insert({
    organization_id: orgId, name: "Euro Supplier", payable_account_id: payableAcc,
  }).select("id").single();
  supplierId = supplier!.id as string;

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  const { data: period } = await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  periodId = period!.id as string;

  await admin.from("organizations").update({
    fx_gain_account_id: gainAcc, fx_loss_account_id: lossAcc,
  }).eq("id", orgId);

  const email = `e2e-supfx-${stamp}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  userId = created!.user!.id;
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  asUser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, signInErr?.message).toBeNull();
});

afterAll(async () => {
  if (!orgId) return;
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", orgId);
  await admin.from("supplier_invoices").delete().eq("organization_id", orgId);
  await admin.from("suppliers").delete().eq("organization_id", orgId);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", orgId);
  await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
  await admin.from("fiscal_years").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("exchange_rates").delete().eq("organization_id", orgId);
  await admin.from("resorts").delete().eq("organization_id", orgId);
  await admin.from("organizations")
    .update({ fx_gain_account_id: null, fx_loss_account_id: null }).eq("id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  if (userId) await admin.auth.admin.deleteUser(userId);
});

function post(params: Record<string, unknown>) {
  return asUser.rpc("post_supplier_invoice_in_currency", {
    p_organization_id: orgId, p_resort_id: resortId, p_supplier_id: supplierId,
    p_purchase_order_id: null, p_expense_account_id: expenseAcc,
    p_discount_amount: 0, p_vat_rate: 0, p_vat_account_id: null,
    p_wht_rate: 0, p_wht_account_id: null,
    p_invoice_date: "2026-06-01", p_due_date: "2026-07-01",
    p_fiscal_period_id: periodId,
    ...params,
  });
}

describe("supplier invoices in a foreign currency", () => {
  it("leaves the base-currency path completely untouched", async () => {
    const { data: id, error } = await post({
      p_invoice_number: `EGP-${Date.now()}`, p_net_amount: 1000, p_currency: "EGP",
    });
    expect(error, error?.message).toBeNull();

    const { data: inv } = await admin.from("supplier_invoices")
      .select("amount, net_amount, currency, exchange_rate, foreign_amount")
      .eq("id", id as string).single();

    expect(Number(inv!.net_amount)).toBe(1000);
    expect(inv!.currency, "an own-currency invoice carries no FX metadata").toBeNull();
    expect(inv!.exchange_rate).toBeNull();
    expect(inv!.foreign_amount).toBeNull();
  });

  it("REFUSES a foreign invoice when no rate exists and none is supplied", async () => {
    const { error } = await post({
      p_invoice_number: `NORATE-${Date.now()}`, p_net_amount: 100, p_currency: "EUR",
    });
    expect(error?.message).toMatch(/EXCHANGE_RATE_MISSING/);
  });

  it("converts to the base currency for the ledger and keeps the foreign amount on the document", async () => {
    await admin.from("exchange_rates").insert({
      organization_id: orgId, foreign_currency: "EUR", base_currency: "EGP",
      rate_date: "2026-01-01", base_per_unit: 50, source: "test",
    });

    const { data: id, error } = await post({
      p_invoice_number: `EUR-${Date.now()}`, p_net_amount: 100, p_currency: "EUR",
    });
    expect(error, error?.message).toBeNull();

    const { data: inv } = await admin.from("supplier_invoices")
      .select("amount, net_amount, currency, exchange_rate, foreign_net_amount, foreign_amount, journal_entry_id")
      .eq("id", id as string).single();

    // The ledger figures are 100 EUR x 50.
    expect(Number(inv!.net_amount)).toBe(5000);
    expect(Number(inv!.amount)).toBe(5000);
    // The document keeps what was actually billed.
    expect(inv!.currency).toBe("EUR");
    expect(Number(inv!.exchange_rate)).toBe(50);
    expect(Number(inv!.foreign_net_amount)).toBe(100);
    expect(Number(inv!.foreign_amount)).toBe(100);

    // And the entry itself is in base currency only.
    const { data: lines } = await admin.from("journal_entry_lines")
      .select("debit, credit").eq("journal_entry_id", inv!.journal_entry_id!);
    expect(lines!.reduce((s, l) => s + Number(l.credit), 0)).toBe(5000);
    expect(lines!.reduce((s, l) => s + Number(l.debit), 0)).toBe(5000);
  });

  it("prefers an explicitly supplied rate over the registry, for a contracted rate", async () => {
    const { data: id } = await post({
      p_invoice_number: `CONTRACT-${Date.now()}`, p_net_amount: 100,
      p_currency: "EUR", p_exchange_rate: 45,
    });
    const { data: inv } = await admin.from("supplier_invoices")
      .select("net_amount, exchange_rate").eq("id", id as string).single();
    expect(Number(inv!.exchange_rate), "the contracted rate wins over the registry's 50").toBe(45);
    expect(Number(inv!.net_amount)).toBe(4500);
  });

  it("applies VAT as a RATE, so it needs no conversion of its own", async () => {
    // The underlying RPC requires a VAT account whenever a rate is set, so the
    // error is asserted rather than assumed away.
    const { data: id, error } = await post({
      p_invoice_number: `VAT-${Date.now()}`, p_net_amount: 100,
      p_currency: "EUR", p_exchange_rate: 50, p_vat_rate: 14,
      p_vat_account_id: vatAcc,
    });
    expect(error, error?.message).toBeNull();
    const { data: inv } = await admin.from("supplier_invoices")
      .select("net_amount, vat_amount, amount, foreign_amount")
      .eq("id", id as string).single();

    // 100 EUR x 50 = 5000 base, VAT 14% = 700, gross 5700.
    expect(Number(inv!.net_amount)).toBe(5000);
    expect(Number(inv!.vat_amount)).toBe(700);
    expect(Number(inv!.amount)).toBe(5700);
    // The foreign gross is the same arithmetic in EUR: 100 x 1.14.
    expect(Number(inv!.foreign_amount)).toBe(114);
  });

  it("books a LOSS when the settlement rate is higher than the invoice rate", async () => {
    const { data: id } = await post({
      p_invoice_number: `SETTLE-LOSS-${Date.now()}`, p_net_amount: 100,
      p_currency: "EUR", p_exchange_rate: 50,
    });

    // Recorded at 50, settled at 55: we pay 500 more base currency. A loss.
    const { data: entryId, error } = await asUser.rpc("settle_supplier_invoice_fx_difference", {
      p_invoice_id: id as string, p_settlement_date: "2026-06-20", p_settlement_rate: 55,
    });
    expect(error, error?.message).toBeNull();

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit").eq("journal_entry_id", entryId as string);
    const lossLine = lines!.find((l) => l.account_id === lossAcc);
    expect(lossLine, "a rate rise on a payable is a loss, not a gain").toBeDefined();
    expect(Number(lossLine!.debit)).toBe(500);

    const payableLine = lines!.find((l) => l.account_id === payableAcc);
    expect(Number(payableLine!.credit), "the difference lands on the payable it arose from").toBe(500);
  });

  it("books a GAIN when the settlement rate is lower than the invoice rate", async () => {
    const { data: id } = await post({
      p_invoice_number: `SETTLE-GAIN-${Date.now()}`, p_net_amount: 100,
      p_currency: "EUR", p_exchange_rate: 50,
    });

    const { data: entryId, error } = await asUser.rpc("settle_supplier_invoice_fx_difference", {
      p_invoice_id: id as string, p_settlement_date: "2026-06-20", p_settlement_rate: 48,
    });
    expect(error, error?.message).toBeNull();

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit").eq("journal_entry_id", entryId as string);
    const gainLine = lines!.find((l) => l.account_id === gainAcc);
    expect(Number(gainLine!.credit)).toBe(200);
  });

  it("refuses a settlement difference on an invoice that is in the organisation's own currency", async () => {
    const { data: id } = await post({
      p_invoice_number: `LOCAL-${Date.now()}`, p_net_amount: 100, p_currency: "EGP",
    });
    const { error } = await asUser.rpc("settle_supplier_invoice_fx_difference", {
      p_invoice_id: id as string, p_settlement_date: "2026-06-20", p_settlement_rate: 55,
    });
    expect(error?.message).toMatch(/INVOICE_NOT_FOREIGN_CURRENCY/);
  });
});
