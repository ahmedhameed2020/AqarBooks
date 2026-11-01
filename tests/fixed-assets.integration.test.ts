/**
 * الأصول الثابتة والإهلاك.
 *
 * الادّعاء الجوهري الذي يجب أن يصمد: **مجموع الأقساط يساوي (التكلفة − التخريدية)
 * بالضبط**، لا تقريبًا. القسط الشهري يُقرَّب بعملة المؤسسة، ومع عمر لا يقسم
 * الأساس بالتساوي يتراكم فرق التقريب — فلو أخذ القسط الأخير قيمته المقرَّبة
 * كالبقية لبقي الأصل إلى الأبد بقيمة دفترية لا تساوي قيمته التخريدية. لذلك
 * القسط الأخير يأخذ الباقي كاملًا.
 *
 * والادّعاء الثاني: إعادة تشغيل الإهلاك على الفترة نفسها **بلا أثر** — وهذه
 * ليست حالة نادرة، بل ما يحدث كلما أُقفل شهر على دفعتين.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { createOpenFiscalYear } from "./helpers/fiscal-calendar";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let orgId: string;
let propertyId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;
let assetAcc: string;
let accumAcc: string;
let expenseAcc: string;
const periodIds: string[] = [];

/** Cost 10000, salvage 1000, 7 months. Base 9000 does NOT divide evenly: 9000/7
 *  = 1285.714…, so the rounded monthly is 1285.71 and six of those leave 0.06
 *  unaccounted. The seventh must be 1285.74, not 1285.71. */
const COST = 10000;
const SALVAGE = 1000;
const MONTHS = 7;
const BASE = COST - SALVAGE;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E FixedAssets ${stamp}`,
      slug: `e2e-fixed-assets-${stamp}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id").single();
  expect(orgErr, orgErr?.message).toBeNull();
  orgId = org!.id as string;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data, error } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: false,
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  };
  assetAcc = await acc("1210", "ASSET", "DEBIT");
  // مجمع الإهلاك مدين الرصيد عمدًا — حساب مقابل يظهر سالبًا فيُنقص الأصول.
  accumAcc = await acc("1220", "ASSET", "DEBIT");
  expenseAcc = await acc("5500", "EXPENSE", "DEBIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "FA Property", code: `FA-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  propertyId = property!.id as string;

  const email = `e2e-fa-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  expect(userErr, userErr?.message).toBeNull();
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

  // Fiscal calendar through the product RPCs as the signed-in owner (the guard refuses direct writes).
  // create_fiscal_year makes twelve monthly periods; the test uses the first eight: seven to exhaust
  // the asset, one to prove the eighth run posts nothing at all.
  await createOpenFiscalYear(admin, asUser, {
    orgId, name: "FY", startDate: "2026-01-01", endDate: "2026-12-31",
  });
  const { data: periods, error: periodsErr } = await admin
    .from("fiscal_periods").select("id, period_number")
    .eq("organization_id", orgId).order("period_number");
  expect(periodsErr, periodsErr?.message).toBeNull();
  for (const p of (periods ?? []).slice(0, 8)) periodIds.push(p.id as string);
  expect(periodIds).toHaveLength(8);
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
  // fiscal_years / fiscal_periods are removed by the organization cascade (open rows only; see the guard).
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
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
    acquisition_cost: COST, salvage_value: SALVAGE, useful_life_months: MONTHS,
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

describe("fixed assets and depreciation", () => {
  it("refuses salvage that is not below cost, rather than producing a zero instalment forever", async () => {
    const { error } = await admin.from("fixed_assets").insert({
      organization_id: orgId, property_id: propertyId, code: `BAD-${Date.now()}`,
      name_ar: "أصل", name_en: "Asset",
      asset_account_id: assetAcc,
      accumulated_depreciation_account_id: accumAcc,
      depreciation_expense_account_id: expenseAcc,
      acquisition_date: "2026-01-01",
      acquisition_cost: 1000, salvage_value: 1000, useful_life_months: 12,
    });
    expect(error?.message).toMatch(/fixed_assets_salvage_below_cost/);
  });

  it("depreciates to the salvage value EXACTLY, with the last instalment absorbing the rounding", async () => {
    const assetId = await makeAsset(`FA-EXACT-${Date.now()}`);

    const amounts: number[] = [];
    for (let i = 0; i < MONTHS; i++) {
      const { data: count, error } = await asUser.rpc("post_depreciation_for_period", {
        p_organization_id: orgId,
        p_fiscal_period_id: periodIds[i],
      });
      expect(error, `period ${i + 1}: ${error?.message}`).toBeNull();
      expect(count, `period ${i + 1} should post exactly one asset`).toBe(1);

      const { data: row } = await admin
        .from("fixed_asset_depreciation")
        .select("amount")
        .eq("fixed_asset_id", assetId)
        .eq("fiscal_period_id", periodIds[i])
        .single();
      amounts.push(Number(row!.amount));
    }

    // Compared in piastres: 1285.71 * 6 in floating point is not 7714.26.
    const totalPiastres = amounts.reduce((s, a) => s + Math.round(a * 100), 0);
    expect(totalPiastres, "the instalments must sum to the depreciable base exactly")
      .toBe(Math.round(BASE * 100));

    // The first six are the rounded monthly; the last is larger by the drift.
    expect(amounts.slice(0, 6).every((a) => Math.round(a * 100) === 128571)).toBe(true);
    expect(Math.round(amounts[6] * 100), "the final instalment absorbs the remainder")
      .toBe(128574);

    // Net book value now equals salvage, and the asset seals itself.
    const { data: listed } = await asUser.rpc("list_fixed_assets", { p_organization_id: orgId });
    const row = (listed as unknown as { id: string; status: string; net_book_value: number }[])
      .find((r) => r.id === assetId)!;
    expect(Math.round(Number(row.net_book_value) * 100)).toBe(Math.round(SALVAGE * 100));
    expect(row.status).toBe("FULLY_DEPRECIATED");
  });

  it("posts nothing on a re-run of the same period, and nothing after the asset is exhausted", async () => {
    const assetId = await makeAsset(`FA-IDEM-${Date.now()}`);

    const { data: first } = await asUser.rpc("post_depreciation_for_period", {
      p_organization_id: orgId, p_fiscal_period_id: periodIds[0],
    });
    expect(first).toBe(1);

    const { data: again, error } = await asUser.rpc("post_depreciation_for_period", {
      p_organization_id: orgId, p_fiscal_period_id: periodIds[0],
    });
    expect(error, error?.message).toBeNull();
    expect(again, "a re-run of the same period posts nothing").toBe(0);

    const { count } = await admin
      .from("fixed_asset_depreciation")
      .select("id", { count: "exact", head: true })
      .eq("fixed_asset_id", assetId);
    expect(count, "and leaves exactly one row").toBe(1);
  });

  it("refuses to post into a period that is not OPEN", async () => {
    // A direct write to the status is refused by the guard, and the row must stay as it was.
    const { error: directErr } = await admin
      .from("fiscal_periods").update({ status: "CLOSED" }).eq("id", periodIds[7]);
    expect(directErr?.message, "direct status write must be refused").toMatch(/FISCAL_STATUS_DIRECT_WRITE_BLOCKED/);
    expect(directErr?.code).toBe("42501");
    const { data: unchanged } = await admin
      .from("fiscal_periods").select("status").eq("id", periodIds[7]).single();
    expect(unchanged!.status).toBe("OPEN");

    // The transition goes through the owning function, then posting must be refused.
    const { error: closeErr } = await asUser.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodIds[7], p_status: "CLOSED", p_reason: "test: closed period refuses posting",
    } as never);
    expect(closeErr, `close period: ${closeErr?.message}`).toBeNull();
    try {
      const { error } = await asUser.rpc("post_depreciation_for_period", {
        p_organization_id: orgId, p_fiscal_period_id: periodIds[7],
      });
      expect(error?.message).toMatch(/FISCAL_PERIOD_NOT_OPEN/);
    } finally {
      const { error: reopenErr } = await asUser.rpc("set_fiscal_period_status", {
        p_fiscal_period_id: periodIds[7], p_status: "OPEN", p_reason: "test: reopen after refusal check",
      } as never);
      expect(reopenErr, `reopen period: ${reopenErr?.message}`).toBeNull();
    }
  });

  it("posts a balanced entry that debits the expense and credits accumulated depreciation", async () => {
    const assetId = await makeAsset(`FA-ENTRY-${Date.now()}`);
    await asUser.rpc("post_depreciation_for_period", {
      p_organization_id: orgId, p_fiscal_period_id: periodIds[1],
    });

    const { data: dep } = await admin
      .from("fixed_asset_depreciation")
      .select("amount, journal_entry_id")
      .eq("fixed_asset_id", assetId).single();
    expect(dep!.journal_entry_id, "depreciation must carry a real entry").not.toBeNull();

    const { data: lines } = await admin
      .from("journal_entry_lines")
      .select("account_id, debit, credit")
      .eq("journal_entry_id", dep!.journal_entry_id!);

    const amount = Number(dep!.amount);
    const debit = lines!.find((l) => Number(l.debit) > 0)!;
    const credit = lines!.find((l) => Number(l.credit) > 0)!;
    expect(debit.account_id).toBe(expenseAcc);
    expect(credit.account_id).toBe(accumAcc);
    expect(Math.round(Number(debit.debit) * 100)).toBe(Math.round(amount * 100));
    expect(Math.round(Number(credit.credit) * 100)).toBe(Math.round(amount * 100));
  });

  it("refuses a user without finance.assets.manage", async () => {
    const stamp = Date.now();
    const email = `e2e-fa-cashier-${stamp}@aqarbooks-test.local`;
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
    const { error } = await cashier.rpc("post_depreciation_for_period", {
      p_organization_id: orgId, p_fiscal_period_id: periodIds[2],
    });
    expect(error?.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);

    await admin.from("user_role_assignments").delete().eq("user_id", created!.user!.id);
    await admin.from("organization_memberships").delete().eq("user_id", created!.user!.id);
    await admin.auth.admin.deleteUser(created!.user!.id);
  });
});
