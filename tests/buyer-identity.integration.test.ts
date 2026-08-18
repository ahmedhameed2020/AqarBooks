/**
 * هوية المشتري — الحاجز الذي يسبق إصدار أي فاتورة خاضعة.
 *
 * اكتشاف سبق البناء: **`dues` لا يحمل مشتريًا إطلاقًا**، بل يرتبط بوحدة فقط.
 * فالمشتري يُشتق — من مستأجر العقد للإيجار المولَّد، ومن الملكية السارية بتاريخ
 * الإصدار لما عداه — وكلا المسارين قد يفشل. والفشل يُعلن ولا يُخمَّن.
 *
 * والحجب **للخاضع وحده** كما اعتُمد: المعفى يمر بلا هوية مشترٍ، لأن الإعفاء لا
 * يحتاج فاتورة ضريبية تحمل رقم تسجيل المشتري.
 *
 * يعمل في `SA` وعلى طبائع لا تستعملها قواعد الإنتاج — جدول القواعد عالمي.
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

const SCOPE = `E2E_BUYER_${Date.now()}`;
const TAXABLE_NATURE = "ACCESS_CARD_FEE";
const EXEMPT_NATURE = "DEPOSIT_FORFEITED";
const RATE = 15;

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgId: string;
let propertyId: string;
let receivableId: string;
let taxableTypeId: string;
let exemptTypeId: string;
let owner: Actor;
let platformAdmin: Actor;

/** وحدة لكل سيناريو ملكية، فلا يتداخل سيناريو مع آخر. */
let unitNoOwner: string;
let unitSoleOwner: string;
let unitTwoOwners: string;
let unitPrimary: string;
let memberUnresolved: string;
let memberB2BNoTaxId: string;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-buyer-${label.toLowerCase()}-${Date.now()}-${Math.floor(
    performance.now() * 1000,
  )}@aqarbooks-test.local`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  expect(error, `user create failed: ${error?.message}`).toBeNull();
  createdUserIds.push(created!.user!.id);
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
  return { userId: created!.user!.id, client };
}

async function makeUnit(label: string) {
  const { data } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `BU-${label}-${Date.now()}`,
  } as never).select("id").single();
  return data!.id as string;
}

async function makeMember(name: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("members").insert({
    organization_id: orgId, full_name: name, is_company: false, ...fields,
  } as never).select("id").single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function own(unitId: string, memberId: string, primary: boolean, share = 100) {
  await admin.from("unit_ownerships").insert({
    organization_id: orgId, unit_id: unitId, member_id: memberId,
    share_percentage: share, is_primary_contact: primary, start_date: "2020-01-01",
  } as never);
}

async function tryDue(unitId: string, dueTypeId: string, amount = 1150) {
  const { data, error } = await admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unitId,
    due_type_id: dueTypeId, receivable_account_id: receivableId,
    amount, issue_date: "2026-06-01", due_date: "2026-07-01",
    status: "ISSUED", description: "E2E buyer identity",
  } as never).select("id");
  if (error) return { error, dueId: null as string | null };
  const dueId = data![0].id as string;
  const { error: recErr } = await owner.client.rpc("record_tax_decision_for_due", {
    p_due_id: dueId,
  });
  return { error: recErr, dueId };
}

beforeAll(async () => {
  platformAdmin = await makeUser("PlatformAdmin");
  const { data: superRole } = await admin.from("roles")
    .select("id").eq("key", "PLATFORM_SUPER_ADMIN").is("organization_id", null).single();
  await admin.from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Buyer ${Date.now()}`, slug: `e2e-buyer-${Date.now()}`,
    default_currency: "EGP", status: "ACTIVE",
    tax_id: "100-BUYER-001", tax_jurisdiction: "SA",
  } as never).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: revenue } = await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "4100", name_ar: "إيراد", name_en: "Revenue",
    category: "REVENUE", normal_balance: "CREDIT",
  } as never).select("id").single();
  const { data: receivable } = await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "1200", name_ar: "ذمم", name_en: "Receivable",
    category: "ASSET", normal_balance: "DEBIT",
  } as never).select("id").single();
  receivableId = receivable!.id as string;
  await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "2300", name_ar: "ضريبة مخرجات مستحقة",
    name_en: "Output Tax Payable", category: "LIABILITY", normal_balance: "CREDIT",
  } as never);

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "Buyer P", code: `E2E-BUY-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  propertyId = property!.id as string;

  unitNoOwner = await makeUnit("NoOwner");
  unitSoleOwner = await makeUnit("Sole");
  unitTwoOwners = await makeUnit("Two");
  unitPrimary = await makeUnit("Primary");

  const { data: taxableType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "نوع خاضع", name_en: "Taxable", is_active: true,
  } as never).select("id").single();
  taxableTypeId = taxableType!.id as string;
  const { data: exemptType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "نوع معفى", name_en: "Exempt", is_active: true,
  } as never).select("id").single();
  exemptTypeId = exemptType!.id as string;

  owner = await makeUser("Owner");
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: owner.userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: owner.userId, role_id: role!.id, organization_id: orgId });

  for (const [nature, treatment, rate] of [
    [TAXABLE_NATURE, "TAXABLE", RATE], [EXEMPT_NATURE, "EXEMPT", 0],
  ] as [string, string, number][]) {
    const { data, error: ruleErr } = await admin.from("tax_rule_versions").insert({
      jurisdiction: "SA", revenue_nature: nature, tax_treatment: treatment, vat_rate: rate,
      effective_from: "2026-01-01", e_document_type: "BY_CUSTOMER_TYPE", issuer_scope: SCOPE,
      version: 1, rule_hash: "", status: "APPROVED",
      approved_by: platformAdmin.userId, approved_at: new Date().toISOString(),
    } as never).select("id").single();
    expect(ruleErr, `rule seed failed: ${ruleErr?.message}`).toBeNull();
    createdRuleIds.push(data!.id as string);
  }

  for (const [dueTypeId, nature, basis] of [
    [taxableTypeId, TAXABLE_NATURE, "GROSS"], [exemptTypeId, EXEMPT_NATURE, null],
  ] as [string, string, string | null][]) {
    const { data: id } = await owner.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeId, p_revenue_nature: nature, p_amount_basis: basis,
    });
    await owner.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: id as unknown as string,
    });
  }

  memberUnresolved = await makeMember("عضو بلا تصنيف");
  memberB2BNoTaxId = await makeMember("منشأة بلا رقم", { is_company: true });
  await admin.from("members")
    .update({ customer_type: "B2B" } as never).eq("id", memberB2BNoTaxId);

  await own(unitSoleOwner, memberUnresolved, true);
  await own(unitPrimary, memberB2BNoTaxId, true);
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const id of createdOrgIds) {
    await admin.from("tax_decisions").delete().eq("organization_id", id);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", id);
    await admin.from("dues").delete().eq("organization_id", id);
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

describe("هوية المشتري", () => {
  it("وحدة بلا مالك: الخاضع مرفوض ويسمّي سبب تعذّر التحديد", async () => {
    const { error } = await tryDue(unitNoOwner, taxableTypeId);
    expect(error, "لا مشتري ⇒ لا فاتورة خاضعة").not.toBeNull();
    expect(error!.message).toMatch(/TAX_BUYER_UNRESOLVED/);
    // السبب مذكور لا مُبهم: «تعذّر» وحدها لا تقول للمشغّل ماذا يصلح.
    expect(error!.message).toMatch(/NO_OWNER/);
  });

  it("والمعفى يمر بلا مشترٍ أصلًا — الحجب للخاضع وحده", async () => {
    const { error, dueId } = await tryDue(unitNoOwner, exemptTypeId, 500);
    expect(error, `المعفى لا يُحجب: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("tax_decisions")
      .select("buyer_member_id, tax_decision_snapshot").eq("source_id", dueId!).single();
    expect(d!.buyer_member_id).toBeNull();
    const snap = d!.tax_decision_snapshot as Record<string, unknown>;
    // ويُختم سبب تعذّر التحديد حتى في المعفى: السكوت عنه يخفي فجوة بيانات.
    expect(snap.buyer_unresolved_reason).toBe("NO_OWNER");
  });

  it("تصنيف المشتري غير المحسوم يحجب، ولا يُستنتج من الاسم", async () => {
    const { error } = await tryDue(unitSoleOwner, taxableTypeId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/TAX_BUYER_STATUS_UNRESOLVED/);
  });

  it("منشأة بلا رقم تسجيل ضريبي تحجب الفاتورة الخاضعة", async () => {
    const { error } = await tryDue(unitPrimary, taxableTypeId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/TAX_BUYER_TAX_ID_MISSING/);
  });

  it("وتعيين التصنيف منشأةً بلا رقم مرفوض من المصدر لا من الفاتورة", async () => {
    const { error } = await owner.client.rpc("set_member_tax_identity", {
      p_member_id: memberUnresolved,
      p_customer_type: "B2B",
    });
    expect(error, "الرفض عند المصدر أوضح من رفض كل فاتورة لاحقًا").not.toBeNull();
    expect(error!.message).toMatch(/BUYER_TAX_ID_MISSING/);
  });

  it("مشترٍ فرد محسوم: يمر، واللقطة تحمل هويته وقت الإصدار", async () => {
    const { error: setErr } = await owner.client.rpc("set_member_tax_identity", {
      p_member_id: memberUnresolved,
      p_customer_type: "B2C",
      p_legal_name: "الاسم القانوني",
      p_country_code: "EG",
      p_identity_document_type: "NATIONAL_ID",
      p_identity_document_number: "29001010123456",
    });
    expect(setErr, `set identity failed: ${setErr?.message}`).toBeNull();

    const { error, dueId } = await tryDue(unitSoleOwner, taxableTypeId);
    expect(error, `الفرد المحسوم يمر: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("tax_decisions")
      .select("buyer_member_id, tax_decision_snapshot").eq("source_id", dueId!).single();
    expect(d!.buyer_member_id).toBe(memberUnresolved);
    const snap = d!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.buyer_customer_type).toBe("B2C");
    expect(snap.buyer_resolved_via).toBe("SOLE_OWNER");
    expect(snap.buyer_legal_name).toBe("الاسم القانوني");
    expect(snap.buyer_identity_document_type).toBe("NATIONAL_ID");
    expect(snap.buyer_identity_document_on_file).toBe(true);

    // **الرقم الشخصي لا يُنسخ في اللقطة عمدًا**: جدول القرارات غير قابل للتعديل،
    // فرقم يُكتب فيه لا يُصحَّح ولا يُمحى أبدًا. النوع والوجود يكفيان هنا.
    expect(JSON.stringify(snap)).not.toContain("29001010123456");
  });

  it("منشأة برقم تسجيل: تمر، واللقطة تحمل الرقم لأنه بيان الفاتورة", async () => {
    await owner.client.rpc("set_member_tax_identity", {
      p_member_id: memberB2BNoTaxId,
      p_customer_type: "B2B",
      p_tax_registration_number: "TRN-99887766",
      p_legal_name: "شركة اختبار",
      p_country_code: "EG",
    });

    const { error, dueId } = await tryDue(unitPrimary, taxableTypeId);
    expect(error, `المنشأة برقم تمر: ${error?.message}`).toBeNull();

    const { data: d } = await admin.from("tax_decisions")
      .select("tax_decision_snapshot").eq("source_id", dueId!).single();
    const snap = d!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.buyer_customer_type).toBe("B2B");
    // رقم التسجيل الضريبي معرّف منشأة لا بيان شخصي، وهو من متطلبات الفاتورة.
    expect(snap.buyer_tax_registration_number).toBe("TRN-99887766");
  });

  it("تعدد المُلّاك بلا جهة اتصال أساسية التباس معلن لا اختيار عشوائي", async () => {
    const a = await makeMember("مالك أ", { customer_type: "B2C" });
    const b = await makeMember("مالك ب", { customer_type: "B2C" });
    await own(unitTwoOwners, a, false, 50);
    await own(unitTwoOwners, b, false, 50);

    const { error } = await tryDue(unitTwoOwners, taxableTypeId);
    expect(error, "اختيار أحدهما اعتباطًا يُنتج فاتورة باسم الخطأ").not.toBeNull();
    expect(error!.message).toMatch(/MULTIPLE_OWNERS_NO_PRIMARY/);

    // وتعيين جهة اتصال أساسية يحسمه.
    await admin.from("unit_ownerships")
      .update({ is_primary_contact: true } as never)
      .eq("unit_id", unitTwoOwners).eq("member_id", a);

    const { error: ok, dueId } = await tryDue(unitTwoOwners, taxableTypeId, 1150);
    expect(ok, `جهة الاتصال الأساسية تحسم: ${ok?.message}`).toBeNull();
    const { data: d } = await admin.from("tax_decisions")
      .select("buyer_member_id, tax_decision_snapshot").eq("source_id", dueId!).single();
    expect(d!.buyer_member_id).toBe(a);
    expect((d!.tax_decision_snapshot as Record<string, unknown>).buyer_resolved_via)
      .toBe("PRIMARY_CONTACT_OWNER");
  });

  it("تغيير هوية المشتري يُسجَّل، ولا يحرّك قرارًا مختومًا", async () => {
    const { data: before } = await admin.from("tax_decisions")
      .select("id, tax_decision_snapshot")
      .eq("buyer_member_id", memberB2BNoTaxId).limit(1).single();

    await owner.client.rpc("set_member_tax_identity", {
      p_member_id: memberB2BNoTaxId,
      p_customer_type: "B2B",
      p_tax_registration_number: "TRN-CHANGED",
      p_legal_name: "شركة اختبار",
    });

    const { data: after } = await admin.from("tax_decisions")
      .select("tax_decision_snapshot").eq("id", before!.id).single();
    // اللقطة هي المرجع، لا قيمة `members` الحالية.
    expect((after!.tax_decision_snapshot as Record<string, unknown>).buyer_tax_registration_number)
      .toBe("TRN-99887766");

    const { data: logs } = await admin.from("platform_audit_logs")
      .select("safe_change_summary").eq("organization_id", orgId)
      .eq("action", "member_tax_identity.changed")
      .order("created_at", { ascending: false }).limit(1);
    const summary = logs![0].safe_change_summary as Record<string, unknown>;
    expect(summary.tax_registration_from).toBe("TRN-99887766");
    expect(summary.tax_registration_to).toBe("TRN-CHANGED");
  });

  it("الجاهزية تُبلغ عن هوية المشتري مجمَّعةً لا صفًّا صفًّا", async () => {
    await makeMember("عضو جديد بلا تصنيف");

    const { data: gaps } = await owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: orgId,
    });
    const rows = gaps as unknown as { gap_code: string; detail: string }[];
    const unresolved = rows.find((g) => g.gap_code === "B2B_STATUS_UNRESOLVED");
    expect(unresolved, "العضو غير المصنَّف يظهر").toBeTruthy();
    // سطر واحد بعدد، لا سطر لكل عضو: قائمة بطول 617 لا تُقرأ فلا تُنفَّذ.
    expect(rows.filter((g) => g.gap_code === "B2B_STATUS_UNRESOLVED")).toHaveLength(1);
    expect(unresolved!.detail).toMatch(/\d+/);
  });
});
