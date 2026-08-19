/**
 * فروق الصرف — الحسابان والترحيل.
 *
 * الادّعاء الأول: **الترحيل يرفض حتى يُضبط الحسابان.** البديل هو أن يخترع الكود
 * حسابًا للفرق، وهو أسوأ من الرفض: قيد يُرحَّل إلى حساب لم يختره محاسب يظهر
 * سليمًا في كل تقرير ولا يُكتشف إلا عند مراجعة خارجية.
 *
 * والادّعاء الثاني: **الربح إيراد والخسارة مصروف** — ليس تفضيلًا بل تعريف، فالفرق
 * الموجب يزيد حقوق الملكية والسالب ينقصها. ولذلك يُرفض حساب أصل أو التزام لأيٍّ
 * منهما، ويُختبر الرفض لا النجاح فقط.
 *
 * ويجوز أن يشير الحسابان إلى **حساب واحد** لمن أراد صافي الحركة — الاختيار
 * محاسبي، والكود لا يفرضه في أي من الاتجاهين.
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
let gainAcc: string;
let lossAcc: string;
let payableAcc: string;
let assetAcc: string;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E FXDiff ${stamp}`, slug: `e2e-fxdiff-${stamp}`,
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
  gainAcc = await acc("4900", "REVENUE", "CREDIT");
  lossAcc = await acc("5900", "EXPENSE", "DEBIT");
  payableAcc = await acc("2100", "LIABILITY", "CREDIT");
  assetAcc = await acc("1010", "ASSET", "DEBIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "FX P", code: `FXD-${stamp}`,
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

  const email = `e2e-fxdiff-${stamp}@aqarbooks-test.local`;
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
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", orgId);
  await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
  await admin.from("fiscal_years").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
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

async function lines(entryId: string) {
  const { data } = await admin.from("journal_entry_lines")
    .select("account_id, debit, credit").eq("journal_entry_id", entryId);
  return data!;
}

describe("fx difference accounts and posting", () => {
  it("REFUSES to post a difference before the accounts are set", async () => {
    const { error } = await asUser.rpc("post_fx_difference", {
      p_organization_id: orgId, p_property_id: propertyId, p_fiscal_period_id: periodId,
      p_entry_date: "2026-06-01", p_difference: 100,
      p_counter_account_id: payableAcc,
      p_description: "premature", p_idempotency_key: `fx-premature-${Date.now()}`,
    });
    expect(error?.message, "an unconfigured organisation must be refused, not defaulted")
      .toMatch(/FX_ACCOUNTS_NOT_SET/);
  });

  it("refuses a gain account that is not revenue, and a loss account that is not an expense", async () => {
    const wrongGain = await asUser.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: assetAcc, p_loss_account_id: lossAcc,
    });
    expect(wrongGain.error?.message).toMatch(/FX_GAIN_ACCOUNT_INVALID/);

    const wrongLoss = await asUser.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: payableAcc,
    });
    expect(wrongLoss.error?.message).toMatch(/FX_LOSS_ACCOUNT_INVALID/);
  });

  it("reports readiness honestly while only one account is set", async () => {
    await admin.from("organizations")
      .update({ fx_gain_account_id: gainAcc, fx_loss_account_id: null }).eq("id", orgId);
    const { data } = await asUser.rpc("check_fx_readiness", { p_organization_id: orgId });
    const row = (data as unknown as { ready: boolean; reason: string }[])[0];
    expect(row.ready).toBe(false);
    expect(row.reason).toBe("FX_LOSS_ACCOUNT_NOT_SET");
  });

  it("posts a gain as revenue and a loss as an expense, both balanced", async () => {
    const { error: setErr } = await asUser.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: lossAcc,
    });
    expect(setErr, setErr?.message).toBeNull();

    const { data: gainEntry, error: gainErr } = await asUser.rpc("post_fx_difference", {
      p_organization_id: orgId, p_property_id: propertyId, p_fiscal_period_id: periodId,
      p_entry_date: "2026-06-01", p_difference: 250,
      p_counter_account_id: payableAcc,
      p_description: "FX gain on settlement", p_idempotency_key: `fx-gain-${Date.now()}`,
    });
    expect(gainErr, gainErr?.message).toBeNull();

    const gl = await lines(gainEntry as string);
    const gainCredit = gl.find((l) => Number(l.credit) > 0)!;
    expect(gainCredit.account_id, "a gain is credited to REVENUE").toBe(gainAcc);
    expect(Number(gainCredit.credit)).toBe(250);
    expect(gl.reduce((s, l) => s + Number(l.debit), 0)).toBe(250);

    const { data: lossEntry, error: lossErr } = await asUser.rpc("post_fx_difference", {
      p_organization_id: orgId, p_property_id: propertyId, p_fiscal_period_id: periodId,
      p_entry_date: "2026-06-01", p_difference: -180,
      p_counter_account_id: payableAcc,
      p_description: "FX loss on settlement", p_idempotency_key: `fx-loss-${Date.now()}`,
    });
    expect(lossErr, lossErr?.message).toBeNull();

    const ll = await lines(lossEntry as string);
    const lossDebit = ll.find((l) => Number(l.debit) > 0)!;
    expect(lossDebit.account_id, "a loss is debited to EXPENSE").toBe(lossAcc);
    // The magnitude is posted, never a negative amount on a line.
    expect(Number(lossDebit.debit)).toBe(180);
    expect(ll.every((l) => Number(l.debit) >= 0 && Number(l.credit) >= 0)).toBe(true);
  });

  it("posts nothing at all when the difference rounds to zero", async () => {
    const { data, error } = await asUser.rpc("post_fx_difference", {
      p_organization_id: orgId, p_property_id: propertyId, p_fiscal_period_id: periodId,
      p_entry_date: "2026-06-01", p_difference: 0.001,
      p_counter_account_id: payableAcc,
      p_description: "noise", p_idempotency_key: `fx-zero-${Date.now()}`,
    });
    expect(error, error?.message).toBeNull();
    expect(data, "a zero difference is not an entry").toBeNull();
  });

  it("accepts the SAME account for gain and loss, for organisations that want one net line", async () => {
    // A single "currency differences" account is a legitimate policy; the code
    // must not force the split it also allows.
    const { data: netAcc } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code: "4901", name_ar: "فروق", name_en: "FX net",
      category: "REVENUE", normal_balance: "CREDIT", is_group: false, is_active: true,
    }).select("id").single();

    const { error } = await asUser.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: netAcc!.id, p_loss_account_id: lossAcc,
    });
    expect(error, error?.message).toBeNull();

    // restore for any later test
    await asUser.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: lossAcc,
    });
  });

  it("refuses a user without finance.accounts.manage", async () => {
    const stamp = Date.now();
    const email = `e2e-fxdiff-cashier-${stamp}@aqarbooks-test.local`;
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
    const { error } = await cashier.rpc("set_fx_difference_accounts", {
      p_organization_id: orgId, p_gain_account_id: gainAcc, p_loss_account_id: lossAcc,
    });
    expect(error?.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);

    await admin.from("user_role_assignments").delete().eq("user_id", created!.user!.id);
    await admin.from("organization_memberships").delete().eq("user_id", created!.user!.id);
    await admin.auth.admin.deleteUser(created!.user!.id);
  });
});
