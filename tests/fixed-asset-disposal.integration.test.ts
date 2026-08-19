/**
 * استبعاد الأصول الثابتة.
 *
 * الادّعاء الأول: **الأصل يخرج بقيمته الأصلية ومجمع إهلاكه يُقفل معه.** حذف الصف
 * أو تصفير الأرصدة كان سيُخفي تكلفة تاريخية وإهلاكًا مُرحَّلًا، ويترك الدفاتر غير
 * متوازنة. فالقيد يُفحص سطرًا سطرًا لا إجمالًا.
 *
 * والادّعاء الثاني: **الربح = المتحصلات − القيمة الدفترية**، والقيد يتوازن بالبناء
 * لا بالتقريب — يُختبر في الحالتين: بيع بربح، وخردة بلا متحصلات (خسارة كاملة
 * بالقيمة الدفترية).
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
let propertyId: string;
let periodId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;
let assetAcc: string, accumAcc: string, expenseAcc: string;
let gainAcc: string, lossAcc: string, cashAcc: string;

const COST = 10000;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Disposal ${stamp}`, slug: `e2e-disposal-${stamp}`,
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
  assetAcc = await acc("1210", "ASSET", "DEBIT");
  accumAcc = await acc("1220", "ASSET", "DEBIT");
  expenseAcc = await acc("5500", "EXPENSE", "DEBIT");
  lossAcc = await acc("5910", "EXPENSE", "DEBIT");
  gainAcc = await acc("4910", "REVENUE", "CREDIT");
  cashAcc = await acc("1010", "ASSET", "DEBIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "D P", code: `DSP-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  propertyId = property!.id as string;

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  const { data: period } = await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  periodId = period!.id as string;

  const email = `e2e-disposal-${stamp}@aqarbooks-test.local`;
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
  await admin.from("fixed_asset_depreciation").delete().eq("organization_id", orgId);
  await admin.from("fixed_assets").delete().eq("organization_id", orgId);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", orgId);
  await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
  await admin.from("fiscal_years").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
  await admin.from("organizations").update({
    asset_disposal_gain_account_id: null, asset_disposal_loss_account_id: null,
  }).eq("id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function makeAsset(code: string) {
  const { data, error } = await admin.from("fixed_assets").insert({
    organization_id: orgId, property_id: propertyId, code,
    name_ar: "أصل", name_en: "Asset",
    asset_account_id: assetAcc,
    accumulated_depreciation_account_id: accumAcc,
    depreciation_expense_account_id: expenseAcc,
    acquisition_date: "2026-01-01",
    acquisition_cost: COST, salvage_value: 0, useful_life_months: 10,
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function lineFor(entryId: string, accountId: string) {
  const { data } = await admin.from("journal_entry_lines")
    .select("account_id, debit, credit").eq("journal_entry_id", entryId);
  return data!.find((l) => l.account_id === accountId);
}

async function totals(entryId: string) {
  const { data } = await admin.from("journal_entry_lines")
    .select("debit, credit").eq("journal_entry_id", entryId);
  return {
    debit: data!.reduce((s, l) => s + Number(l.debit), 0),
    credit: data!.reduce((s, l) => s + Number(l.credit), 0),
  };
}

describe("fixed asset disposal", () => {
  it("REFUSES to dispose before the gain/loss accounts are set", async () => {
    const id = await makeAsset(`D-EARLY-${Date.now()}`);
    const { error } = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: 5000, p_proceeds_account_id: cashAcc,
    });
    expect(error?.message).toMatch(/DISPOSAL_ACCOUNTS_NOT_SET/);
  });

  it("refuses a gain account that is not revenue and a loss account that is not an expense", async () => {
    const badGain = await asUser.rpc("set_asset_disposal_accounts", {
      p_organization_id: orgId, p_gain_account_id: cashAcc, p_loss_account_id: lossAcc,
    });
    expect(badGain.error?.message).toMatch(/DISPOSAL_GAIN_ACCOUNT_INVALID/);

    const badLoss = await asUser.rpc("set_asset_disposal_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: cashAcc,
    });
    expect(badLoss.error?.message).toMatch(/DISPOSAL_LOSS_ACCOUNT_INVALID/);

    const ok = await asUser.rpc("set_asset_disposal_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: lossAcc,
    });
    expect(ok.error, ok.error?.message).toBeNull();
  });

  it("closes cost and accumulated depreciation and books the gain, line by line", async () => {
    const id = await makeAsset(`D-GAIN-${Date.now()}`);
    // Two instalments of 1000 posted, so accumulated 2000 and NBV 8000.
    await asUser.rpc("post_depreciation_for_period", {
      p_organization_id: orgId, p_fiscal_period_id: periodId,
    });
    const { data: dep } = await admin.from("fixed_asset_depreciation")
      .select("amount").eq("fixed_asset_id", id).single();
    const accumulated = Number(dep!.amount);
    const nbv = COST - accumulated;

    const proceeds = nbv + 1500;
    const { data: entryId, error } = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: proceeds, p_proceeds_account_id: cashAcc, p_reason: "sold",
    });
    expect(error, error?.message).toBeNull();

    // The asset leaves at its ORIGINAL cost, not its book value.
    const assetLine = await lineFor(entryId as string, assetAcc);
    expect(Number(assetLine!.credit)).toBe(COST);

    // Accumulated depreciation is closed by the amount actually posted.
    const accumLine = await lineFor(entryId as string, accumAcc);
    expect(Number(accumLine!.debit)).toBe(accumulated);

    const cashLine = await lineFor(entryId as string, cashAcc);
    expect(Number(cashLine!.debit)).toBe(proceeds);

    const gainLine = await lineFor(entryId as string, gainAcc);
    expect(Number(gainLine!.credit), "gain = proceeds - net book value").toBe(1500);

    const t = await totals(entryId as string);
    expect(t.debit).toBe(t.credit);

    const { data: after } = await admin.from("fixed_assets")
      .select("status, disposal_date, disposal_proceeds").eq("id", id).single();
    expect(after!.status).toBe("DISPOSED");
    expect(Number(after!.disposal_proceeds)).toBe(proceeds);
  });

  it("books the whole net book value as a loss when an asset is scrapped for nothing", async () => {
    const id = await makeAsset(`D-SCRAP-${Date.now()}`);
    const { data: entryId, error } = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: 0, p_proceeds_account_id: cashAcc, p_reason: "scrapped",
    });
    expect(error, error?.message).toBeNull();

    // No depreciation posted for this one, so the loss is the full cost.
    const lossLine = await lineFor(entryId as string, lossAcc);
    expect(Number(lossLine!.debit)).toBe(COST);

    // And no zero-value cash line is written at all.
    const cashLine = await lineFor(entryId as string, cashAcc);
    expect(cashLine, "a zero proceeds line is not written").toBeUndefined();

    const t = await totals(entryId as string);
    expect(t.debit).toBe(t.credit);
  });

  it("refuses to dispose the same asset twice", async () => {
    const id = await makeAsset(`D-TWICE-${Date.now()}`);
    const first = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: 100, p_proceeds_account_id: cashAcc,
    });
    expect(first.error, first.error?.message).toBeNull();

    const second = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-07-01",
      p_proceeds: 100, p_proceeds_account_id: cashAcc,
    });
    expect(second.error?.message).toMatch(/ASSET_ALREADY_DISPOSED/);
  });

  it("refuses a disposal dated before the asset was acquired, and negative proceeds", async () => {
    const id = await makeAsset(`D-BAD-${Date.now()}`);
    const early = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2025-12-31",
      p_proceeds: 100, p_proceeds_account_id: cashAcc,
    });
    expect(early.error?.message).toMatch(/DISPOSAL_BEFORE_ACQUISITION/);

    const negative = await asUser.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: -5, p_proceeds_account_id: cashAcc,
    });
    expect(negative.error?.message).toMatch(/DISPOSAL_PROCEEDS_NEGATIVE/);
  });

  it("refuses a CASHIER", async () => {
    const id = await makeAsset(`D-PERM-${Date.now()}`);
    const stamp = Date.now();
    const email = `e2e-disposal-cashier-${stamp}@aqarbooks-test.local`;
    const { data: created } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    await admin.from("organization_memberships")
      .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
    const { data: role } = await admin.from("roles")
      .select("id").eq("organization_id", orgId).eq("key", "CASHIER").single();
    await admin.from("user_role_assignments")
      .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });

    const cashier = createClient(url, anonKey, { auth: { persistSession: false } });
    await cashier.auth.signInWithPassword({ email, password: PASSWORD });
    const { error } = await cashier.rpc("dispose_fixed_asset", {
      p_asset_id: id, p_disposal_date: "2026-06-01",
      p_proceeds: 100, p_proceeds_account_id: cashAcc,
    });
    expect(error?.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);

    await admin.from("user_role_assignments").delete().eq("user_id", created!.user!.id);
    await admin.from("organization_memberships").delete().eq("user_id", created!.user!.id);
    await admin.auth.admin.deleteUser(created!.user!.id);
  });
});
