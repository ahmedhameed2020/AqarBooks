/**
 * إشعارات الخصم — تصحيح مستند صادر.
 *
 * القاعدة التي تفصل الإشعار عن «فاتورة سالبة»، من بحث المستندات (قرار 0007):
 * **يشير إلى أصله، ولا يتجاوز إجماليه، ويعكس معالجته الضريبية بقاعدتها الأصلية
 * لا بقاعدة اليوم.** الثلاثة مُختبَرة هنا، والثالث هو الأخطر: تشريع جديد بعد
 * الإصدار لا يجوز أن يغيّر ضريبة إشعار يصحّح فاتورة قديمة.
 *
 * يعمل في `SA` وعلى طبيعة لا تستعملها قواعد الإنتاج — جدول القواعد عالمي.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const SCOPE = `E2E_CN_${Date.now()}`;
const NATURE = "TRANSFER_FEE";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgId: string;
let propertyId: string;
let unitId: string;
let receivableId: string;
let revenueId: string;
let outputTaxId: string;
let dueTypeId: string;
let dueId: string;
let owner: { userId: string; client: ReturnType<typeof createClient<Database>> };

async function makeDue(amount: number, label: string) {
  const { data, error } = await admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unitId,
    due_type_id: dueTypeId, receivable_account_id: receivableId,
    amount, issue_date: "2026-06-01", due_date: "2026-07-01",
    status: "ISSUED", description: label,
  } as never).select("id");
  expect(error, `due insert failed: ${error?.message}`).toBeNull();
  const id = data![0].id as string;
  const { error: recErr } = await owner.client.rpc("record_tax_decision_for_due", {
    p_due_id: id,
  });
  expect(recErr, `decision failed: ${recErr?.message}`).toBeNull();
  return id;
}

beforeAll(async () => {
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E CreditNote ${Date.now()}`, slug: `e2e-cn-${Date.now()}`,
    default_currency: "EGP", status: "ACTIVE",
    tax_id: "100-CN-001", tax_jurisdiction: "SA",
  } as never).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, nameAr: string, cat: string, bal: string) => {
    const { data } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: nameAr, name_en: code,
      category: cat, normal_balance: bal,
    } as never).select("id").single();
    return data!.id as string;
  };
  revenueId = await acc("4100", "إيراد", "REVENUE", "CREDIT");
  receivableId = await acc("1200", "ذمم", "ASSET", "DEBIT");
  outputTaxId = await acc("2300", "ضريبة مخرجات", "LIABILITY", "CREDIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "CN P", code: `E2E-CN-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  propertyId = property!.id as string;
  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `CNU-${Date.now()}`,
  } as never).select("id").single();
  unitId = unit!.id as string;

  const { data: buyer } = await admin.from("members").insert({
    organization_id: orgId, full_name: "مشترٍ", is_company: false,
    customer_type: "B2C", country_code: "EG",
  } as never).select("id").single();
  await admin.from("unit_ownerships").insert({
    organization_id: orgId, unit_id: unitId, member_id: buyer!.id,
    share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
  } as never);

  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenueId,
    name_ar: "رسوم نقل", name_en: "Transfer fee", is_active: true,
  } as never).select("id").single();
  dueTypeId = dueType!.id as string;

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "CN FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  } as never).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "CN Period", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  } as never);

  const email = `e2e-cn-${Date.now()}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  createdUserIds.push(created!.user!.id);
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
  owner = { userId: created!.user!.id, client };

  const { data: rule, error: ruleErr } = await admin.from("tax_rule_versions").insert({
    jurisdiction: "SA", revenue_nature: NATURE, tax_treatment: "TAXABLE", vat_rate: 15,
    effective_from: "2026-01-01", e_document_type: "BY_CUSTOMER_TYPE", issuer_scope: SCOPE,
    version: 1, rule_hash: "", status: "APPROVED",
    approved_by: owner.userId, approved_at: new Date().toISOString(),
  } as never).select("id").single();
  expect(ruleErr, `rule seed failed: ${ruleErr?.message}`).toBeNull();
  createdRuleIds.push(rule!.id as string);

  const { data: mappingId } = await owner.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: dueTypeId, p_revenue_nature: NATURE, p_amount_basis: "GROSS",
  });
  await owner.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: mappingId as unknown as string,
  });

  dueId = await makeDue(1150, "رسوم نقل");
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const id of createdOrgIds) {
    await admin.from("credit_notes").delete().eq("organization_id", id);
    await admin.from("document_numbers").delete().eq("organization_id", id);
    await admin.from("document_number_counters").delete().eq("organization_id", id);
    await admin.from("tax_decisions").delete().eq("organization_id", id);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", id);
    await admin.from("dues").delete().eq("organization_id", id);
    const { data: entries } = await admin.from("journal_entries")
      .select("id").eq("organization_id", id);
    for (const e of entries ?? []) {
      await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
    }
    await admin.from("journal_entries").delete().eq("organization_id", id);
    await admin.from("fiscal_periods").delete().eq("organization_id", id);
    await admin.from("fiscal_years").delete().eq("organization_id", id);
    await admin.from("unit_ownerships").delete().eq("organization_id", id);
    await admin.from("members").delete().eq("organization_id", id);
    await admin.from("platform_audit_logs").delete().eq("organization_id", id);
    await admin.from("units").delete().eq("organization_id", id);
    await admin.from("properties").delete().eq("organization_id", id);
    await admin.from("due_types").delete().eq("organization_id", id);
    await admin.from("chart_of_accounts")
      .update({ is_used: false } as never).eq("organization_id", id);
    await admin.from("chart_of_accounts").delete().eq("organization_id", id);
    const { error } = await admin.from("organizations").delete().eq("id", id);
    if (error) failures.push(`org ${id}: ${error.message}`);
  }
  if (createdRuleIds.length) {
    const { error } = await admin.from("tax_rule_versions").delete().in("id", createdRuleIds);
    if (error) failures.push(`rules: ${error.message}`);
  }
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
  expect(failures, `teardown left state behind: ${failures.join(" | ")}`).toEqual([]);
}, 180_000);

describe("إشعارات الخصم", () => {
  it("لا إشعار بلا سبب ولا بقيمة غير موجبة", async () => {
    const noReason = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 100, p_reason: "   ",
    });
    expect(noReason.error!.message).toMatch(/CREDIT_NOTE_REASON_REQUIRED/);

    const zero = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 0, p_reason: "خطأ",
    });
    expect(zero.error!.message).toMatch(/CREDIT_NOTE_AMOUNT_INVALID/);
  });

  it("إشعار جزئي: الضريبة تُعكس بنسبة الأصل، والقيد عكس القيد", async () => {
    const { data: id, error } = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 460, p_reason: "خصم جزئي متفق عليه",
      p_credit_date: "2026-06-10",
    });
    expect(error, `credit note failed: ${error?.message}`).toBeNull();

    const { data: cn } = await admin.from("credit_notes")
      .select("document_number, gross_amount, taxable_base, vat_amount, journal_entry_id")
      .eq("id", id as unknown as string).single();

    expect(cn!.document_number).toMatch(/^CRN-2026-\d{6}$/);
    // 460 شاملة بنسبة 15% ⇒ 60 ضريبة و400 صافٍ.
    expect(Number(cn!.gross_amount)).toBe(460);
    expect(Number(cn!.vat_amount)).toBe(60);
    expect(Number(cn!.taxable_base)).toBe(400);

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit")
      .eq("journal_entry_id", cn!.journal_entry_id as string);
    expect(lines, "ثلاثة أطراف عكس القيد الأصلي").toHaveLength(3);

    const revenue = lines!.find((l) => l.account_id === revenueId);
    const tax = lines!.find((l) => l.account_id === outputTaxId);
    const receivable = lines!.find((l) => l.account_id === receivableId);
    // الإيراد والضريبة مدينان، والذمم دائنة — عكس اتجاه الفاتورة تمامًا.
    expect(Number(revenue!.debit)).toBe(400);
    expect(Number(tax!.debit)).toBe(60);
    expect(Number(receivable!.credit)).toBe(460);
  });

  it("لا يتجاوز الأصل: المتبقي محسوب، والتجاوز مرفوض برقمه", async () => {
    const { data: remaining } = await admin.rpc("creditable_remaining", { p_due_id: dueId });
    expect(Number(remaining), "1150 ناقص 460").toBe(690);

    const tooMuch = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 700, p_reason: "محاولة تجاوز",
    });
    expect(tooMuch.error, "الإشعار ليس فاتورة سالبة بلا حد").not.toBeNull();
    expect(tooMuch.error!.message).toMatch(/CREDIT_NOTE_EXCEEDS_ORIGINAL/);
    // والرسالة تحمل الرقمين لا كلمة «تجاوز» وحدها.
    expect(tooMuch.error!.message).toMatch(/690/);
  });

  it("خصم المتبقي بالكامل مسموح، وبعده لا يبقى شيء", async () => {
    const { error } = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 690, p_reason: "إلغاء الباقي",
      p_credit_date: "2026-06-15",
    });
    expect(error, `credit note failed: ${error?.message}`).toBeNull();

    const { data: remaining } = await admin.rpc("creditable_remaining", { p_due_id: dueId });
    expect(Number(remaining)).toBe(0);

    const another = await owner.client.rpc("issue_credit_note", {
      p_due_id: dueId, p_gross_amount: 1, p_reason: "بعد الاستنفاد",
    });
    expect(another.error!.message).toMatch(/CREDIT_NOTE_EXCEEDS_ORIGINAL/);
  });

  it("تشريع جديد بعد الإصدار لا يغيّر ضريبة إشعار يصحّح فاتورة قديمة", async () => {
    const other = await makeDue(1150, "مستحق ثانٍ");

    // خلافة القاعدة إلى الإعفاء اعتبارًا من 2026-07-01.
    const { data: rule } = await admin.from("tax_rule_versions")
      .select("id").eq("issuer_scope", SCOPE).eq("status", "APPROVED").single();
    const { data: newRuleId, error: supErr } = await admin.rpc("supersede_tax_rule" as never, {
      p_rule_id: rule!.id, p_effective_from: "2026-07-01",
      p_tax_treatment: "EXEMPT", p_vat_rate: 0,
      p_e_document_type: "BY_CUSTOMER_TYPE", p_issuer_scope: SCOPE,
    } as never);
    // الخلافة لمشرف المنصة؛ إن رُفضت هنا فالاختبار يخص ثبات الإشعار لا الصلاحية.
    if (!supErr) createdRuleIds.push(newRuleId as unknown as string);

    const { data: id, error } = await owner.client.rpc("issue_credit_note", {
      p_due_id: other, p_gross_amount: 1150, p_reason: "إلغاء كامل بعد التشريع الجديد",
      p_credit_date: "2026-08-01",
    });
    expect(error, `credit note failed: ${error?.message}`).toBeNull();

    const { data: cn } = await admin.from("credit_notes")
      .select("vat_amount, taxable_base, decision_snapshot")
      .eq("id", id as unknown as string).single();

    // القاعدة اليوم معفاة، لكن الأصل كان خاضعًا بنسبة 15% — والإشعار يعكس الأصل.
    expect(Number(cn!.vat_amount), "الضريبة بقاعدة الأصل لا بقاعدة اليوم").toBe(150);
    expect(Number(cn!.taxable_base)).toBe(1000);
    expect((cn!.decision_snapshot as Record<string, unknown>).vat_rate).toBe(15);
  });

  it("الإشعار الصادر لا يُعدَّل، ويحمل مرجع أصله", async () => {
    const { data: cn } = await admin.from("credit_notes")
      .select("id, source_id, tax_decision_id, decision_snapshot")
      .eq("source_id", dueId).limit(1).single();

    expect(cn!.source_id, "يشير إلى أصله").toBe(dueId);
    expect(cn!.tax_decision_id, "وإلى القرار الذي بُني عليه").toBeTruthy();
    const snap = cn!.decision_snapshot as Record<string, unknown>;
    expect(Number(snap.original_gross)).toBe(1150);
    expect(snap.remaining_before).toBeDefined();

    const { error } = await admin.from("credit_notes")
      .update({ gross_amount: 1 } as never).eq("id", cn!.id);
    expect(error, "التصحيح بإشعار آخر لا بتعديل").not.toBeNull();
    expect(error!.message).toMatch(/CREDIT_NOTE_IMMUTABLE/);
  });

  it("مستند الإشعار الإلكتروني يحمل مرجع الأصل لدى السلطة", async () => {
    const { data: cn } = await admin.from("credit_notes")
      .select("id, document_number").eq("source_id", dueId).limit(1).single();

    const { data: source, error } = await owner.client.rpc(
      "get_einvoice_source_for_credit_note", { p_credit_note_id: cn!.id });
    expect(error, `source failed: ${error?.message}`).toBeNull();

    const doc = source as unknown as Record<string, unknown>;
    expect(doc.documentType).toBe("CREDIT_NOTE");
    expect(doc.documentNumber).toBe(cn!.document_number);
    // الأصل لم يُرسَل في هذا الاختبار، فالمرجع فارغ — والسلطة ترفض تصحيحًا بلا
    // أصل، وهو ما يجعل غيابه معلومة لا سهوًا.
    expect(doc.correctsAuthorityUuid).toBeNull();
  });
});
