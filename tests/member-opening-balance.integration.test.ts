/**
 * الرصيد الافتتاحي للعميل.
 *
 * الادّعاء الأول: **الرصيد الافتتاحي مستحق، لا رقم على بطاقة العميل.** يُسجَّل
 * كـdue بمصدر OPENING_BALANCE على وحدة العميل، فيراه رصيد الوحدة ورصيد العميل
 * وكشف الحساب والتحصيل، ويُخصَّص عليه السداد كأي مستحق آخر.
 *
 * والثاني: **الطرف الدائن حقوق ملكية لا إيراد.** الإيراد الذي وراء هذا الدين
 * تحقّق — وخُضع للضريبة — في النظام السابق. تسجيله إيرادًا مرة أخرى يضخّم أرباح
 * السنة الجارية ويحاول فرض ضريبة على ما سبق فوترته.
 *
 * والثالث: **رصيد واحد لكل عميل على كل وحدة.** التصحيح إشعار دائن أو إلغاء، لا
 * رصيد افتتاحي ثانٍ.
 *
 * والرابع: **لا رصيد على وحدة لا تخصّ العميل.** الرصيد يُقرأ عبر الوحدة، فرصيد
 * على وحدة غير مربوطة به يظهر في الدفتر ولا يظهر في كشف أحد.
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
let unitId: string;
let otherUnitId: string;
let memberId: string;
let strangerId: string;
let receivableId: string;
let equityGroupId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;

const AS_OF = "2026-01-01";
const AMOUNT = 1500;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Opening Balance ${stamp}`, slug: `e2e-ob-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string, isGroup = false) => {
    const { data, error: accErr } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: isGroup, is_active: true,
    }).select("id").single();
    expect(accErr, accErr?.message).toBeNull();
    return data!.id as string;
  };
  receivableId = await acc("1130", "ASSET", "DEBIT");
  equityGroupId = await acc("3000", "EQUITY", "CREDIT", true);

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "P", code: `OB-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  propertyId = property!.id as string;

  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `U-${stamp}`,
  }).select("id").single();
  unitId = unit!.id as string;
  const { data: otherUnit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `V-${stamp}`,
  }).select("id").single();
  otherUnitId = otherUnit!.id as string;

  const { data: member } = await admin.from("members").insert({
    organization_id: orgId, full_name: "عميل قديم", phone: "+201000000001",
  }).select("id").single();
  memberId = member!.id as string;
  const { data: stranger } = await admin.from("members").insert({
    organization_id: orgId, full_name: "عميل بلا وحدة", phone: "+201000000002",
  }).select("id").single();
  strangerId = stranger!.id as string;

  await admin.from("unit_ownerships").insert({
    organization_id: orgId, unit_id: unitId, member_id: memberId,
    share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
  });

  // An open period covering the as-of date, so the insert trigger posts the
  // due to the ledger and the test can read the journal it produced.
  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "OB FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "OB Period", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  });

  const email = `e2e-ob-${stamp}@aqarbooks-test.local`;
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
  await admin.from("organizations")
    .update({ tax_enforcement_enabled: false, tax_enforcement_enabled_at: null })
    .eq("id", orgId);
  await admin.from("financial_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("tax_decisions").delete().eq("organization_id", orgId);
  await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
  await admin.from("dues").delete().eq("organization_id", orgId);
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", orgId);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", orgId);
  await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
  await admin.from("fiscal_years").delete().eq("organization_id", orgId);
  await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
  await admin.from("members").delete().eq("organization_id", orgId);
  await admin.from("units").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
  await admin.from("due_types").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  if (userId) await admin.auth.admin.deleteUser(userId);
}, 120_000);

async function record(args: Partial<{
  member: string; unit: string; amount: number; asOf: string; receivable: string | null; description: string | null;
}> = {}) {
  return asUser.rpc("record_member_opening_balance", {
    p_organization_id: orgId,
    p_member_id: args.member ?? memberId,
    p_unit_id: args.unit ?? unitId,
    p_amount: args.amount ?? AMOUNT,
    p_as_of_date: args.asOf ?? AS_OF,
    p_receivable_account_id: args.receivable === undefined ? receivableId : args.receivable,
    p_description: args.description ?? null,
  });
}

describe("member opening balance", () => {
  let dueTypeId: string;
  let equityAccountId: string;

  it("creates the «رصيد افتتاحي» due type once, backed by an EQUITY account under the equity group", async () => {
    const first = await asUser.rpc("ensure_opening_balance_due_type", { p_organization_id: orgId });
    expect(first.error, first.error?.message).toBeNull();
    dueTypeId = first.data as string;

    const { data: dueType } = await admin.from("due_types")
      .select("name_ar, name_en, is_active, default_revenue_account_id")
      .eq("id", dueTypeId).single();
    expect(dueType!.name_ar).toBe("رصيد افتتاحي");
    expect(dueType!.is_active).toBe(true);
    equityAccountId = dueType!.default_revenue_account_id as string;

    const { data: account } = await admin.from("chart_of_accounts")
      .select("code, category, normal_balance, is_group, parent_id")
      .eq("id", equityAccountId).single();
    expect(account!.category).toBe("EQUITY");
    expect(account!.normal_balance).toBe("CREDIT");
    expect(account!.is_group).toBe(false);
    expect(account!.code).toBe("3900");
    expect(account!.parent_id).toBe(equityGroupId);

    // Idempotent: a second call returns the same type and creates nothing.
    const second = await asUser.rpc("ensure_opening_balance_due_type", { p_organization_id: orgId });
    expect(second.error).toBeNull();
    expect(second.data).toBe(dueTypeId);
    const { count } = await admin.from("due_types")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("name_en", "Opening Balance");
    expect(count).toBe(1);
  });

  it("refuses a non-positive amount and a future date before touching anything", async () => {
    const zero = await record({ amount: 0 });
    expect(zero.error?.message).toContain("OPENING_BALANCE_AMOUNT_INVALID");
    const negative = await record({ amount: -10 });
    expect(negative.error?.message).toContain("OPENING_BALANCE_AMOUNT_INVALID");
    const future = await record({ asOf: "2999-01-01" });
    expect(future.error?.message).toContain("OPENING_BALANCE_DATE_IN_FUTURE");

    const { count } = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(count).toBe(0);
  });

  it("refuses a unit the client neither owns nor rents", async () => {
    const res = await record({ member: strangerId });
    expect(res.error?.message).toContain("MEMBER_NOT_LINKED_TO_UNIT");
  });

  it("records the balance as an OPENING_BALANCE due, posted Dr receivable / Cr equity, and it reaches the client's balance", async () => {
    const res = await record({ description: "متأخرات 2025" });
    expect(res.error, res.error?.message).toBeNull();
    const dueId = res.data as string;

    const { data: due } = await admin.from("dues").select("*").eq("id", dueId).single();
    expect(due!.source_type).toBe("OPENING_BALANCE");
    expect(due!.source_id).toBe(memberId);
    expect(due!.unit_id).toBe(unitId);
    expect(due!.property_id).toBe(propertyId);
    expect(due!.due_type_id).toBe(dueTypeId);
    expect(due!.receivable_account_id).toBe(receivableId);
    expect(Number(due!.amount)).toBe(AMOUNT);
    expect(due!.issue_date).toBe(AS_OF);
    expect(due!.due_date).toBe(AS_OF);
    expect(due!.status).toBe("ISSUED");
    expect(due!.description).toBe("متأخرات 2025");
    expect(due!.journal_entry_id, "the insert trigger must have posted it").not.toBeNull();

    const { data: entry } = await admin.from("journal_entries")
      .select("status, entry_date, idempotency_key")
      .eq("id", due!.journal_entry_id).single();
    expect(entry!.status).toBe("POSTED");
    expect(entry!.entry_date).toBe(AS_OF);
    expect(entry!.idempotency_key).toBe(`due:${dueId}`);

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit")
      .eq("journal_entry_id", due!.journal_entry_id);
    const debit = (lines ?? []).find((l) => Number(l.debit) > 0);
    const credit = (lines ?? []).find((l) => Number(l.credit) > 0);
    expect(debit!.account_id).toBe(receivableId);
    expect(Number(debit!.debit)).toBe(AMOUNT);
    expect(credit!.account_id).toBe(equityAccountId);
    expect(Number(credit!.credit)).toBe(AMOUNT);

    const { data: unitView } = await admin.from("units_with_financials")
      .select("balance, has_arrears").eq("id", unitId).single();
    expect(Number(unitView!.balance)).toBe(AMOUNT);
    expect(unitView!.has_arrears).toBe(true);

    const { data: memberView } = await admin.from("members_with_financials")
      .select("total_balance").eq("id", memberId).single();
    expect(Number(memberView!.total_balance)).toBe(AMOUNT);

    const { data: audit } = await admin.from("financial_audit_logs")
      .select("action, entity_id")
      .eq("organization_id", orgId).eq("action", "OPENING_BALANCE_RECORDED");
    expect(audit).toHaveLength(1);
    expect(audit![0].entity_id).toBe(dueId);
  });

  it("refuses a second opening balance for the same client on the same unit", async () => {
    const res = await record({ amount: 10 });
    expect(res.error?.message).toContain("OPENING_BALANCE_ALREADY_RECORDED");
    const { count } = await admin.from("dues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("source_type", "OPENING_BALANCE");
    expect(count).toBe(1);
  });

  it("falls back to the organization's usual receivable account when none is given, and writes a default memo", async () => {
    await admin.from("unit_ownerships").insert({
      organization_id: orgId, unit_id: otherUnitId, member_id: memberId,
      share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
    });
    const res = await record({ unit: otherUnitId, amount: 250, receivable: null });
    expect(res.error, res.error?.message).toBeNull();
    const { data: due } = await admin.from("dues")
      .select("receivable_account_id, description").eq("id", res.data).single();
    expect(due!.receivable_account_id).toBe(receivableId);
    expect(due!.description).toContain("رصيد افتتاحي");
    expect(due!.description).toContain("عميل قديم");

    const { data: memberView } = await admin.from("members_with_financials")
      .select("total_balance").eq("id", memberId).single();
    expect(Number(memberView!.total_balance)).toBe(AMOUNT + 250);
  });

  it("rejects a receivable account that is not a leaf asset account", async () => {
    const res = await record({ unit: otherUnitId, member: strangerId, receivable: equityAccountId });
    // Linking is checked before the account, so use the linked member instead.
    expect(res.error).not.toBeNull();
    const linked = await admin.from("unit_ownerships").insert({
      organization_id: orgId, unit_id: otherUnitId, member_id: strangerId,
      share_percentage: 100, is_primary_contact: false, start_date: "2020-01-01",
    });
    expect(linked.error, linked.error?.message).toBeNull();
    const res2 = await record({ unit: otherUnitId, member: strangerId, receivable: equityAccountId });
    expect(res2.error?.message).toContain("RECEIVABLE_ACCOUNT_INVALID");
  });

  it("under tax enforcement, names the missing mapping instead of a generic tax error, and leaves the due type in place", async () => {
    const { error: enforceErr } = await admin.from("organizations")
      .update({ tax_enforcement_enabled: true, tax_enforcement_enabled_at: new Date().toISOString() })
      .eq("id", orgId);
    expect(enforceErr, enforceErr?.message).toBeNull();

    const res = await record({ unit: otherUnitId, member: strangerId });
    expect(res.error?.message).toContain("OPENING_BALANCE_TAX_MAPPING_REQUIRED");

    const { count } = await admin.from("due_types")
      .select("id", { count: "exact", head: true }).eq("id", dueTypeId);
    expect(count).toBe(1);

    await admin.from("organizations")
      .update({ tax_enforcement_enabled: false, tax_enforcement_enabled_at: null })
      .eq("id", orgId);
  });

  it("is not callable anonymously", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const res = await anon.rpc("record_member_opening_balance", {
      p_organization_id: orgId, p_member_id: memberId, p_unit_id: unitId,
      p_amount: 1, p_as_of_date: AS_OF, p_receivable_account_id: null, p_description: null,
    });
    expect(res.error).not.toBeNull();
    const ensure = await anon.rpc("ensure_opening_balance_due_type", { p_organization_id: orgId });
    expect(ensure.error).not.toBeNull();
  });
});
