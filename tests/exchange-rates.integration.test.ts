/**
 * أساس تعدد العملات — سعر الصرف والتحويل.
 *
 * الادّعاء الذي يجب أن يصمد قبل أي شيء آخر: **غياب السعر رفض، لا افتراض 1:1**.
 * لو افترضنا واحدًا، لدخل مبلغ باليورو الدفاتر برقمه كما هو — والقيد سيكون
 * **متوازنًا** بالرقم الخاطئ، فلا يكشفه ميزان مراجعة ولا مطابقة بنكية. الخطأ
 * الذي يوازن هو أخطر ما في المحاسبة، ولذلك يُختبر أولًا.
 *
 * والادّعاء الثاني: التحويل يأخذ السعر السارِي **في التاريخ أو قبله**، ولا يرى
 * سعرًا لاحقًا — لا يجوز تقييم معاملة بسعر لم يكن معروفًا وقتها.
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
let kwdOrgId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;

beforeAll(async () => {
  const stamp = Date.now();

  const mkOrg = async (currency: string, tag: string) => {
    const { data, error } = await admin.from("organizations").insert({
      name: `E2E FX ${tag} ${stamp}`, slug: `e2e-fx-${tag}-${stamp}`,
      default_currency: currency, status: "ACTIVE",
    }).select("id").single();
    expect(error, error?.message).toBeNull();
    await admin.rpc("clone_tenant_role_templates", { p_organization_id: data!.id });
    return data!.id as string;
  };

  orgId = await mkOrg("EGP", "egp");
  // الكويتي ثلاث خانات عشرية — يثبت أن التقريب يتبع عملة المؤسسة لا رقمًا مفترضًا.
  kwdOrgId = await mkOrg("KWD", "kwd");

  const email = `e2e-fx-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  expect(userErr, userErr?.message).toBeNull();
  userId = created!.user!.id;

  for (const id of [orgId, kwdOrgId]) {
    await admin.from("organization_memberships")
      .insert({ organization_id: id, user_id: userId, status: "active" });
    const { data: role } = await admin.from("roles")
      .select("id").eq("organization_id", id).eq("key", "TENANT_OWNER").single();
    await admin.from("user_role_assignments")
      .insert({ user_id: userId, role_id: role!.id, organization_id: id });
  }

  asUser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, signInErr?.message).toBeNull();
});

afterAll(async () => {
  for (const id of [orgId, kwdOrgId]) {
    if (!id) continue;
    await admin.from("exchange_rates").delete().eq("organization_id", id);
    await admin.from("user_role_assignments").delete().eq("organization_id", id);
    await admin.from("organization_memberships").delete().eq("organization_id", id);
    await admin.from("platform_audit_logs").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("exchange rates and conversion to the base currency", () => {
  it("REFUSES to convert when no rate exists, rather than assuming 1:1", async () => {
    const { error } = await asUser.rpc("convert_to_base", {
      p_organization_id: orgId,
      p_amount: 1000,
      p_currency: "EUR",
      p_date: "2026-06-01",
    });
    expect(error?.message, "a missing rate must be refused, not defaulted")
      .toMatch(/EXCHANGE_RATE_MISSING/);
  });

  it("passes the organization's own currency through untouched, with no rate needed", async () => {
    const { data, error } = await asUser.rpc("convert_to_base", {
      p_organization_id: orgId,
      p_amount: 1234.56,
      p_currency: "EGP",
      p_date: "2026-06-01",
    });
    expect(error, error?.message).toBeNull();
    expect(Number(data)).toBe(1234.56);
  });

  it("converts using the rate in force on or before the date, never a later one", async () => {
    await admin.from("exchange_rates").insert([
      { organization_id: orgId, foreign_currency: "EUR", base_currency: "EGP",
        rate_date: "2026-06-01", base_per_unit: 50, source: "test" },
      { organization_id: orgId, foreign_currency: "EUR", base_currency: "EGP",
        rate_date: "2026-06-10", base_per_unit: 55, source: "test" },
    ]);

    // On the later date: the newer rate.
    const { data: late } = await asUser.rpc("convert_to_base", {
      p_organization_id: orgId, p_amount: 100, p_currency: "EUR", p_date: "2026-06-15",
    });
    expect(Number(late)).toBe(5500);

    // Between the two: still the older one -- a rate published on the 10th was
    // not knowable on the 5th.
    const { data: mid } = await asUser.rpc("convert_to_base", {
      p_organization_id: orgId, p_amount: 100, p_currency: "EUR", p_date: "2026-06-05",
    });
    expect(Number(mid), "a later rate must not reach an earlier transaction").toBe(5000);

    // Before any rate exists: refused, not extrapolated backwards.
    const { error } = await asUser.rpc("convert_to_base", {
      p_organization_id: orgId, p_amount: 100, p_currency: "EUR", p_date: "2026-05-31",
    });
    expect(error?.message).toMatch(/EXCHANGE_RATE_MISSING/);
  });

  it("rounds to the base currency's own decimals, not an assumed two", async () => {
    // 1 USD = 0.30655 KWD. 100 USD = 30.655 KWD -> three decimals, kept.
    await admin.from("exchange_rates").insert({
      organization_id: kwdOrgId, foreign_currency: "USD", base_currency: "KWD",
      rate_date: "2026-01-01", base_per_unit: 0.30655, source: "test",
    });
    const { data, error } = await asUser.rpc("convert_to_base", {
      p_organization_id: kwdOrgId, p_amount: 100, p_currency: "USD", p_date: "2026-06-01",
    });
    expect(error, error?.message).toBeNull();
    // Rounded to 3 decimals because the Kuwaiti dinar has three, not two.
    expect(Number(data)).toBe(30.655);
  });

  it("refuses a rate of a currency against itself, and a non-positive rate", async () => {
    const same = await admin.from("exchange_rates").insert({
      organization_id: orgId, foreign_currency: "EGP", base_currency: "EGP",
      rate_date: "2026-01-01", base_per_unit: 1,
    });
    expect(same.error?.message).toMatch(/exchange_rates_distinct/);

    const zero = await admin.from("exchange_rates").insert({
      organization_id: orgId, foreign_currency: "GBP", base_currency: "EGP",
      rate_date: "2026-01-01", base_per_unit: 0,
    });
    expect(zero.error?.message).toMatch(/exchange_rates_positive/);
  });

  it("keeps one rate per pair per day, so a correction replaces rather than duplicates", async () => {
    const first = await admin.from("exchange_rates").insert({
      organization_id: orgId, foreign_currency: "SAR", base_currency: "EGP",
      rate_date: "2026-03-01", base_per_unit: 13,
    });
    expect(first.error).toBeNull();

    const duplicate = await admin.from("exchange_rates").insert({
      organization_id: orgId, foreign_currency: "SAR", base_currency: "EGP",
      rate_date: "2026-03-01", base_per_unit: 14,
    });
    expect(duplicate.error?.message).toMatch(/exchange_rates_unique/);
  });

  it("refuses a reader without finance.fx.read", async () => {
    const stamp = Date.now();
    const email = `e2e-fx-outsider-${stamp}@aqarbooks-test.local`;
    const { data: created } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    const outsider = createClient(url, anonKey, { auth: { persistSession: false } });
    await outsider.auth.signInWithPassword({ email, password: PASSWORD });

    const { error } = await outsider.rpc("list_exchange_rates", { p_organization_id: orgId });
    expect(error?.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);

    await admin.auth.admin.deleteUser(created!.user!.id);
  });
});
