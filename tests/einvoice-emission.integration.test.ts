/**
 * فاتورة إلكترونية تخرج من النظام — من طرف إلى طرف.
 *
 * المسار كاملًا على بيانات حقيقية: مستحق ← قرار ضريبي مختوم ← مستند مرقَّم
 * ← إرسال ← قبول ← أثر في السجل. والسلطة **وهمية** (`fake.ts`) لأن اعتماد ETA
 * والشهادة وخدمة التوقيع لم تصل بعد؛ وكل ما قبل التوقيع حقيقي.
 *
 * ما يُثبت هنا تحديدًا:
 *   - المستند يُبنى من **لقطة القرار** لا من الحالة الحالية، فتغيير اسم العميل
 *     بعد الإصدار لا يغيّر فاتورة صدرت.
 *   - نوع المستند يُشتق من القاعدة وتصنيف المشتري: منشأة ⇒ فاتورة، فرد ⇒ إيصال.
 *   - الترقيم متسلسل بلا فجوات، وإعادة البناء لا تحرق رقمًا.
 *   - الإعفاء **يُصدِر مستندًا** بضريبة صفر — لا يُلغي المستند.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { buildSourceDocumentForDue } from "../lib/einvoice/source-builder";
import { makeFakeEInvoiceAdapter, FAKE_AUTHORITY_UUID } from "../lib/einvoice/adapters/fake";
import { fileEInvoiceDocument } from "../lib/einvoice/service";
import type { EInvoiceCredentials } from "../lib/einvoice/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const SCOPE = `E2E_EMIT_${Date.now()}`;
const TAXABLE_NATURE = "GUEST_SERVICE_FEE";
const EXEMPT_NATURE = "DEPOSIT_FORFEITED";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgId: string;
let propertyId: string;
let receivableId: string;
let unitB2B: string;
let unitB2C: string;
let taxableTypeId: string;
let exemptTypeId: string;
let profileId: string;
let owner: { userId: string; client: ReturnType<typeof createClient<Database>> };

const CREDENTIALS: EInvoiceCredentials = {
  environment: "SANDBOX",
  taxpayerId: "100-EMIT-001",
  branchCode: "0",
  activityCode: "6820",
  clientId: "fake-client",
  clientSecret: "fake-secret",
  baseUrl: "https://fake.invalid",
};

async function makeDue(unitId: string, dueTypeId: string, amount: number, label: string) {
  const { data, error } = await admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unitId,
    due_type_id: dueTypeId, receivable_account_id: receivableId,
    amount, issue_date: "2026-06-01", due_date: "2026-07-01",
    status: "ISSUED", description: label,
  } as never).select("id");
  expect(error, `due insert failed: ${error?.message}`).toBeNull();
  const dueId = data![0].id as string;
  const { error: recErr } = await owner.client.rpc("record_tax_decision_for_due", {
    p_due_id: dueId,
  });
  expect(recErr, `decision failed: ${recErr?.message}`).toBeNull();
  return dueId;
}

beforeAll(async () => {
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Emission ${Date.now()}`, slug: `e2e-emission-${Date.now()}`,
    default_currency: "EGP", status: "ACTIVE",
    tax_id: "100-EMIT-001", tax_jurisdiction: "SA",
    governorate: "القاهرة", city: "مدينة نصر", address: "شارع الاختبار 1",
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
    organization_id: orgId, code: "2300", name_ar: "ضريبة مخرجات", name_en: "Output Tax",
    category: "LIABILITY", normal_balance: "CREDIT",
  } as never);

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "Emission P", code: `E2E-EM-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  propertyId = property!.id as string;

  const { data: u1 } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `EMB-${Date.now()}`,
  } as never).select("id").single();
  unitB2B = u1!.id as string;
  const { data: u2 } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `EMC-${Date.now()}`,
  } as never).select("id").single();
  unitB2C = u2!.id as string;

  const { data: company } = await admin.from("members").insert({
    organization_id: orgId, full_name: "شركة المشتري", is_company: true,
    customer_type: "B2B", tax_registration_number: "TRN-BUYER-77",
    legal_name: "شركة المشتري ذ.م.م", country_code: "EG",
    billing_address: "شارع العميل 5",
  } as never).select("id").single();
  const { data: person } = await admin.from("members").insert({
    organization_id: orgId, full_name: "مشترٍ فرد", is_company: false,
    customer_type: "B2C", country_code: "EG",
  } as never).select("id").single();

  await admin.from("unit_ownerships").insert([
    { organization_id: orgId, unit_id: unitB2B, member_id: company!.id,
      share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: unitB2C, member_id: person!.id,
      share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" },
  ] as never);

  const { data: taxableType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "خدمة زائر", name_en: "Guest service", is_active: true,
  } as never).select("id").single();
  taxableTypeId = taxableType!.id as string;
  const { data: exemptType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "تأمين مصادر", name_en: "Forfeited deposit", is_active: true,
  } as never).select("id").single();
  exemptTypeId = exemptType!.id as string;

  const email = `e2e-emit-${Date.now()}@aqarbooks-test.local`;
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

  for (const [nature, treatment, rate] of [
    [TAXABLE_NATURE, "TAXABLE", 15], [EXEMPT_NATURE, "EXEMPT", 0],
  ] as [string, string, number][]) {
    const { data, error: ruleErr } = await admin.from("tax_rule_versions").insert({
      jurisdiction: "SA", revenue_nature: nature, tax_treatment: treatment, vat_rate: rate,
      effective_from: "2026-01-01", e_document_type: "BY_CUSTOMER_TYPE", issuer_scope: SCOPE,
      version: 1, rule_hash: "", status: "APPROVED",
      approved_by: owner.userId, approved_at: new Date().toISOString(),
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

  // ملف تسجيل مفعَّل: `claim_einvoice_document` ترفض من ملف غير نشط، والتفعيل
  // لا يتم إلا بتحقق فعلي — يُحاكى هنا لأن السلطة وهمية.
  const { data: profile } = await admin.from("einvoice_profiles").insert({
    organization_id: orgId, jurisdiction: "SA_ZATCA", environment: "SANDBOX",
    taxpayer_id: "100-EMIT-001",
  } as never).select("id").single();
  profileId = profile!.id as string;
  await admin.from("einvoice_profiles")
    .update({ status: "ACTIVE", enabled: true, verified_at: new Date().toISOString() } as never)
    .eq("id", profileId);
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const id of createdOrgIds) {
    await admin.from("einvoice_submission_attempts").delete().eq("organization_id", id);
    await admin.from("einvoice_documents").delete().eq("organization_id", id);
    await admin.from("einvoice_profiles").delete().eq("organization_id", id);
    await admin.from("document_numbers").delete().eq("organization_id", id);
    await admin.from("document_number_counters").delete().eq("organization_id", id);
    await admin.from("tax_decisions").delete().eq("organization_id", id);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", id);
    await admin.from("dues").delete().eq("organization_id", id);
    await admin.from("unit_ownerships").delete().eq("organization_id", id);
    await admin.from("members").delete().eq("organization_id", id);
    await admin.from("platform_audit_logs").delete().eq("organization_id", id);
    await admin.from("units").delete().eq("organization_id", id);
    await admin.from("properties").delete().eq("organization_id", id);
    await admin.from("due_types").delete().eq("organization_id", id);
    await admin.from("catalogue_items").delete().eq("organization_id", id);
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

describe("إصدار مستند إلكتروني", () => {
  it("مشترٍ منشأة ⇒ فاتورة مرقَّمة بأطرافها وضريبتها", async () => {
    const dueId = await makeDue(unitB2B, taxableTypeId, 1150, "خدمة زائر — منشأة");
    const built = await buildSourceDocumentForDue(owner.client, dueId);

    expect(built.document.documentType, "منشأة ⇒ فاتورة").toBe("INVOICE");
    expect(built.document.documentNumber).toMatch(/^INV-2026-\d{6}$/);
    expect(built.document.seller.taxId).toBe("100-EMIT-001");
    expect(built.document.buyer.name).toBe("شركة المشتري ذ.م.م");
    expect(built.document.buyer.taxId).toBe("TRN-BUYER-77");

    // الأرقام من القرار المختوم: 1150 شاملة بنسبة 15% ⇒ 150 ضريبة و1000 صافٍ.
    expect(built.document.totals.netAmount).toBe(1000);
    expect(built.document.totals.taxAmount).toBe(150);
    expect(built.document.totals.grandTotal).toBe(1150);
    expect(built.document.lines).toHaveLength(1);
    expect(built.document.lines[0].taxRate).toBe(15);
    // كود الصنف غائب عمدًا: ETA تشترط EGS/GS1 ولا يحمله النظام بعد.
    expect(built.document.lines[0].itemCode).toBeNull();
  });

  it("مشترٍ فرد ⇒ إيصال بترقيم مستقل", async () => {
    const dueId = await makeDue(unitB2C, taxableTypeId, 1150, "خدمة زائر — فرد");
    const built = await buildSourceDocumentForDue(owner.client, dueId);

    expect(built.document.documentType, "فرد ⇒ إيصال").toBe("RECEIPT");
    expect(built.document.documentNumber).toMatch(/^RCT-2026-\d{6}$/);
    expect(built.document.buyer.taxId, "الفرد بلا رقم تسجيل").toBeNull();
  });

  it("الإعفاء يُصدِر مستندًا بضريبة صفر — لا يُلغي المستند", async () => {
    const dueId = await makeDue(unitB2C, exemptTypeId, 3000, "تأمين مصادر");
    const built = await buildSourceDocumentForDue(owner.client, dueId);

    expect(built.taxTreatment).toBe("EXEMPT");
    expect(built.document.totals.taxAmount).toBe(0);
    expect(built.document.totals.grandTotal).toBe(3000);
    // هذا هو التصحيح الذي قلبته البيانات سابقًا: الإعفاء يُسقط الضريبة لا المستند.
    expect(built.document.documentNumber).toMatch(/^RCT-2026-\d{6}$/);
  });

  it("الترقيم متسلسل، وإعادة البناء لا تحرق رقمًا", async () => {
    const { data: rows } = await admin.from("document_numbers")
      .select("document_type, sequence_number, document_number")
      .eq("organization_id", orgId).order("document_type").order("sequence_number");

    const invoices = (rows ?? []).filter((r) => r.document_type === "INVOICE");
    const receipts = (rows ?? []).filter((r) => r.document_type === "RECEIPT");
    expect(invoices.map((r) => r.sequence_number)).toEqual([1]);
    expect(receipts.map((r) => r.sequence_number), "تسلسل بلا فجوات").toEqual([1, 2]);

    // إعادة بناء المستند نفسه تعيد الرقم نفسه لا رقمًا جديدًا.
    const { data: firstInvoice } = await admin.from("document_numbers")
      .select("source_id, document_number").eq("organization_id", orgId)
      .eq("document_type", "INVOICE").single();
    const again = await buildSourceDocumentForDue(
      owner.client, firstInvoice!.source_id as string);
    expect(again.document.documentNumber).toBe(firstInvoice!.document_number);

    const { count } = await admin.from("document_numbers")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(count, "لا رقم إضافي").toBe(3);
  });

  it("وتخرج فعلًا: تُرسَل وتُقبَل ويُسجَّل أثرها", async () => {
    const { data: firstInvoice } = await admin.from("document_numbers")
      .select("source_id").eq("organization_id", orgId)
      .eq("document_type", "INVOICE").single();
    const dueId = firstInvoice!.source_id as string;
    const built = await buildSourceDocumentForDue(owner.client, dueId);

    const seen: string[] = [];
    const adapter = makeFakeEInvoiceAdapter({
      submitAs: "ACCEPTED", authorityStatus: "Valid", seenIdempotencyKeys: seen,
    });

    const outcome = await fileEInvoiceDocument(owner.client, adapter, {
      profileId,
      sourceType: "DUE",
      sourceId: dueId,
      documentType: "INVOICE",
      source: built.document,
      credentials: CREDENTIALS,
    });

    expect(outcome.status, "المستند خرج وقُبل").toBe("ACCEPTED");
    expect(outcome.authorityStatus).toBe("Valid");

    const { data: doc } = await admin.from("einvoice_documents")
      .select("status, authority_uuid, attempt_count, settled_at")
      .eq("id", outcome.documentId).single();
    expect(doc!.status).toBe("ACCEPTED");
    expect(doc!.authority_uuid).toBe(FAKE_AUTHORITY_UUID);
    expect(doc!.settled_at, "المقبول مُسوَّى").not.toBeNull();

    const { data: attempts } = await admin.from("einvoice_submission_attempts")
      .select("operation, response_summary").eq("document_id", outcome.documentId);
    expect(attempts).toHaveLength(1);
    // الحمولة لا تُخزَّن خامًا — القاعدة نفسها من مرحلة الفوترة الإلكترونية.
    expect(attempts![0].response_summary).toEqual({ redacted: true });
  });

  it("المستند يُبنى من لقطة القرار لا من الحالة الحالية", async () => {
    const { data: firstInvoice } = await admin.from("document_numbers")
      .select("source_id").eq("organization_id", orgId)
      .eq("document_type", "INVOICE").single();
    const dueId = firstInvoice!.source_id as string;

    const { data: decision } = await admin.from("tax_decisions")
      .select("buyer_member_id").eq("source_id", dueId).single();

    // العميل يتغير اسمه ورقمه بعد الإصدار.
    await owner.client.rpc("set_member_tax_identity", {
      p_member_id: decision!.buyer_member_id as string,
      p_customer_type: "B2B",
      p_tax_registration_number: "TRN-CHANGED-99",
      p_legal_name: "اسم جديد تمامًا",
    });

    const rebuilt = await buildSourceDocumentForDue(owner.client, dueId);
    expect(rebuilt.document.buyer.name, "الفاتورة الصادرة لا تتغير").toBe("شركة المشتري ذ.م.م");
    expect(rebuilt.document.buyer.taxId).toBe("TRN-BUYER-77");
  });

  it("كتالوج الأصناف: الكود يصل إلى المستند، وGS1 غير الصالح مرفوض", async () => {
    // GS1 رقمي بأطوال محددة، ويُفحص في القاعدة.
    const { error: badGs1 } = await owner.client.rpc("upsert_catalogue_item", {
      p_organization_id: orgId, p_code: "BAD", p_name_ar: "صنف", p_name_en: "Item",
      p_item_code_type: "GS1", p_item_code: "12345",
    });
    expect(badGs1, "طول GS1 غير صالح").not.toBeNull();

    // والكود بلا نوعه مرفوض: كود لا يُعرف مصدره لا يُرسَل.
    const { error: noType } = await owner.client.rpc("upsert_catalogue_item", {
      p_organization_id: orgId, p_code: "NOTYPE", p_name_ar: "صنف", p_name_en: "Item",
      p_item_code: "EGS-12345",
    });
    expect(noType!.message).toMatch(/ITEM_CODE_TYPE_MISMATCH/);

    const { data: itemId, error } = await owner.client.rpc("upsert_catalogue_item", {
      p_organization_id: orgId, p_code: "GUEST-SVC",
      p_name_ar: "خدمة زائر", p_name_en: "Guest service",
      p_unit_code: "HUR", p_item_code_type: "GS1", p_item_code: "6221033010113",
    });
    expect(error, `item upsert failed: ${error?.message}`).toBeNull();

    await owner.client.rpc("set_due_type_catalogue_item", {
      p_due_type_id: taxableTypeId, p_catalogue_item_id: itemId as unknown as string,
    });

    const dueId = await makeDue(unitB2B, taxableTypeId, 1150, "خدمة زائر مع كود");
    const built = await buildSourceDocumentForDue(owner.client, dueId);

    expect(built.document.lines[0].itemCode, "الكود وصل من الكتالوج").toBe("6221033010113");
    expect(built.document.lines[0].unitCode, "والوحدة كذلك").toBe("HUR");
  });

  it("جاهزية الإصدار تسمّي ما ينقص قبل الإرسال", async () => {
    const { data: gaps, error } = await owner.client.rpc("check_einvoice_emission_readiness", {
      p_organization_id: orgId,
    });
    expect(error, `readiness failed: ${error?.message}`).toBeNull();
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);

    // النوع المعفى لم يُربط بصنف بعد ⇒ يظهر النقص باسمه لا كصمت.
    expect(codes).toContain("ITEM_LINK_MISSING");
    expect(codes, "المؤسسة تحمل رقمًا ضريبيًا").not.toContain("SELLER_TAX_ID_MISSING");
  });

  it("لا مستند بلا قرار ضريبي مختوم", async () => {
    const { data } = await admin.from("dues").insert({
      organization_id: orgId, property_id: propertyId, unit_id: unitB2B,
      due_type_id: taxableTypeId, receivable_account_id: receivableId,
      amount: 500, issue_date: "2026-06-05", due_date: "2026-07-05",
      status: "ISSUED", description: "بلا قرار",
    } as never).select("id");

    const { error } = await owner.client.rpc("get_einvoice_source_for_due", {
      p_due_id: data![0].id as string,
    });
    expect(error, "المستند لا يسبق القرار").not.toBeNull();
    expect(error!.message).toMatch(/TAX_DECISION_MISSING/);
  });
});
