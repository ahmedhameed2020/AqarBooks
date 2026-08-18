/**
 * الطيار الحقيقي — مؤسسة sandbox واحدة، تبقى مفعَّلة بعد التشغيل.
 *
 * تختلف عن `pilot-rehearsal.manual.test.ts` في أمرين جوهريين: تستعمل **القواعد
 * المعتمدة الفعلية** الموجودة في القاعدة لا قواعد وهمية، و**لا تحذف المؤسسة** —
 * فالطيار يُراقَب بعد تشغيله، ومؤسسة تُحذف فورًا لا يُراقَب فيها شيء.
 *
 * تُشغَّل يدويًا مرة واحدة:
 *     npx vitest run tests/sandbox-pilot.manual.test.ts
 *
 * التقرير في `test-results/sandbox-pilot-report.txt`.
 *
 * **إعادة التشغيل تُنشئ مؤسسة sandbox ثانية.** هذا مقصود: لا شيء هنا يعدّل
 * مؤسسة قائمة، فلا خطر من تشغيل مكرر سوى مؤسسة إضافية تُحذف يدويًا.
 */
import { writeFileSync, mkdirSync } from "node:fs";
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

const STAMP = Date.now();
const ORG_NAME = `SANDBOX Tax Pilot ${STAMP}`;

let orgId: string;
let propertyId: string;
let unitId: string;
let receivableId: string;
let feeTypeId: string;
let rentTypeId: string;
let owner: { userId: string; client: ReturnType<typeof createClient<Database>> };

const report: string[] = [];
const step = (n: string, msg: string) => report.push(`  [${n}] ${msg}`);

async function makeDue(dueTypeId: string, issueDate: string, amount: number, label: string) {
  return admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unitId,
    due_type_id: dueTypeId, receivable_account_id: receivableId,
    amount, issue_date: issueDate, due_date: issueDate,
    status: "ISSUED", description: label,
  } as never).select("id");
}

async function mapAndApprove(dueTypeId: string, nature: string, note: string) {
  const { data: id, error } = await owner.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: dueTypeId, p_revenue_nature: nature, p_notes: note,
  });
  expect(error, `mapping ${nature} failed: ${error?.message}`).toBeNull();
  const { error: appErr } = await owner.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: id as unknown as string,
  });
  expect(appErr, `approve ${nature} failed: ${appErr?.message}`).toBeNull();
}

beforeAll(async () => {
  const { data: org, error } = await admin.from("organizations").insert({
    name: ORG_NAME,
    slug: `sandbox-tax-pilot-${STAMP}`,
    default_currency: "EGP",
    status: "ACTIVE",
    tax_id: "100-SANDBOX-001",
    tax_jurisdiction: "EG",
  } as never).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  orgId = org!.id as string;

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

  // حساب ضريبة المخرجات: التزام نشط غير تجميعي. الـfixtures تنشئ دليلها يدويًا
  // بلا استنساخ القالب، فلا يصلها الحساب القياسي 2300 تلقائيًا.
  await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "2300", name_ar: "ضريبة مخرجات مستحقة",
    name_en: "Output Tax Payable", category: "LIABILITY", normal_balance: "CREDIT",
  } as never);

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "SANDBOX Property", code: `SBX-${STAMP}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  propertyId = property!.id as string;

  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `SBX-U-${STAMP}`,
  } as never).select("id").single();
  unitId = unit!.id as string;

  // المشتري: `dues` يرتبط بوحدة لا بعضو، فالمشتري يُشتق من الملكية السارية.
  // ومنذ إضافة هوية المشتري، المستحق الخاضع بلا مالك محسوم التصنيف مرفوض.
  const { data: buyer } = await admin.from("members").insert({
    organization_id: orgId, full_name: "مشتري اختبار", is_company: false,
    customer_type: "B2C", country_code: "EG",
  } as never).select("id").single();
  await admin.from("unit_ownerships").insert({
    organization_id: orgId, unit_id: unitId, member_id: buyer!.id,
    share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
  } as never);

  const { data: feeType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "رسوم إدارة", name_en: "Management Fee", is_active: true,
  } as never).select("id").single();
  feeTypeId = feeType!.id as string;

  const { data: rentType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "إيجار سكني", name_en: "Residential Rent", is_active: true,
  } as never).select("id").single();
  rentTypeId = rentType!.id as string;

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "SANDBOX FY", start_date: "2025-01-01",
    end_date: "2026-12-31", status: "OPEN",
  } as never).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "SANDBOX Period", start_date: "2025-01-01", end_date: "2026-12-31", status: "OPEN",
  } as never);

  const email = `sandbox-owner-${STAMP}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
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

  step("٠", `مؤسسة الطيار: ${ORG_NAME} (${orgId})`);
}, 180_000);

afterAll(async () => {
  const { data: cov } = await admin.rpc("get_tax_decision_coverage" as never, {
    p_organization_id: orgId,
  } as never).select?.() ?? { data: null };
  void cov;
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/sandbox-pilot-report.txt",
    ["===== تقرير طيار مؤسسة sandbox =====", ...report, "===================================", ""].join("\n"),
    "utf8",
  );
}, 60_000);

describe("طيار الإنفاذ الضريبي — مؤسسة sandbox واحدة", () => {
  it("٢) الجاهزية قبل الربط ترفض وتسمّي النقص", async () => {
    const { data: gaps } = await owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: orgId,
    });
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);
    expect(codes).toContain("MAPPING_MISSING");
    // نوعان نشطان بلا ربط ⇒ فجوتان لا واحدة.
    expect(codes.filter((c) => c === "MAPPING_MISSING").length).toBe(2);
    step("٢", `الجاهزية ترفض: ${codes.length} نقص — ${[...new Set(codes)].join(", ")}`);
  });

  it("٣) ربط النوعين واعتمادهما", async () => {
    await mapAndApprove(feeTypeId, "MANAGEMENT_FEE", "طيار — رسوم إدارة");
    await mapAndApprove(rentTypeId, "RESIDENTIAL_RENT", "طيار — إيجار سكني");
    step("٣", "رُبط النوعان (MANAGEMENT_FEE، RESIDENTIAL_RENT) واعتُمدا");
  });

  it("٤) الجاهزية تعود فارغة", async () => {
    const { data: gaps } = await owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: orgId,
    });
    expect((gaps as unknown as unknown[]).length).toBe(0);
    step("٤", "الجاهزية مكتملة — القواعد المعتمدة سارية للطبيعتين");
  });

  it("٤أ) تقرير الفجوة التاريخية", async () => {
    // مستحق قائم قبل التفعيل، كما لدى أي مؤسسة حقيقية.
    const { error } = await makeDue(feeTypeId, "2026-02-01", 3000, "SANDBOX legacy due");
    expect(error, `legacy due failed: ${error?.message}`).toBeNull();

    const { data: cov } = await owner.client.rpc("get_tax_decision_coverage", {
      p_organization_id: orgId,
    });
    const c = (cov as unknown as {
      total_dues: number; dues_without_decision: number; undecided_amount: number;
      earliest_undecided_issue_date: string;
    }[])[0];
    expect(Number(c.dues_without_decision)).toBe(1);
    step("٤أ", `الفجوة: ${c.dues_without_decision} من ${c.total_dues} مستحق، من ${c.earliest_undecided_issue_date}، بمبلغ ${c.undecided_amount}`);
  });

  it("٥) التفعيل بإقرار صريح للفجوة", async () => {
    const { error: noAck } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgId, p_enabled: true,
    });
    expect(noAck!.message).toMatch(/TAX_HISTORICAL_GAP_UNACKNOWLEDGED/);

    const { error } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgId,
      p_enabled: true,
      p_reason: "طيار المرحلة الأولى — اعتماد تشغيلي من مالك المنتج",
      p_acknowledged_undecided_dues: 1,
    });
    expect(error, `enable failed: ${error?.message}`).toBeNull();

    const { data: o } = await admin.from("organizations")
      .select("tax_enforcement_enabled").eq("id", orgId).single();
    expect(o!.tax_enforcement_enabled).toBe(true);
    step("٥", "الإنفاذ مفعَّل بعد رفض محاولة بلا إقرار، والفجوة (1) مُقَرَّة ومختومة في السجل");
  });

  it("٦) رسوم إدارة ⇒ خاضعة 14%، والمستحق والقيد والقرار معًا", async () => {
    const { data, error } = await makeDue(feeTypeId, "2026-06-15", 1000, "SANDBOX management fee");
    expect(error, `fee due failed: ${error?.message}`).toBeNull();
    const dueId = data![0].id as string;

    const { data: due } = await admin.from("dues")
      .select("journal_entry_id").eq("id", dueId).single();
    expect(due!.journal_entry_id, "القيد أُنشئ").not.toBeNull();

    const { data: d } = await admin.from("tax_decisions")
      .select("tax_decision_snapshot, transaction_date").eq("source_id", dueId).single();
    const snap = d!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.tax_treatment).toBe("TAXABLE");
    expect(Number(snap.vat_rate)).toBe(14);
    step("٦", `رسوم الإدارة: ${snap.tax_treatment} ${snap.vat_rate}% — مستحق وقيد وقرار بتاريخ ${d!.transaction_date}`);
  });

  it("٦ب) إيجار سكني ⇒ معفى بلا نسبة، والمستند يتبع نوع العميل", async () => {
    const { data, error } = await makeDue(rentTypeId, "2026-06-20", 5000, "SANDBOX residential rent");
    expect(error, `rent due failed: ${error?.message}`).toBeNull();
    const dueId = data![0].id as string;

    const { data: d } = await admin.from("tax_decisions")
      .select("tax_decision_snapshot").eq("source_id", dueId).single();
    const snap = d!.tax_decision_snapshot as Record<string, unknown>;
    // الحكم الأهم في المصفوفة: الإعفاء يُسقط الضريبة لا المستند.
    expect(snap.tax_treatment).toBe("EXEMPT");
    expect(Number(snap.vat_rate)).toBe(0);
    expect(snap.e_document_type, "المستند ما يزال مطلوبًا").toBe("BY_CUSTOMER_TYPE");
    step("٦ب", `الإيجار السكني: ${snap.tax_treatment} بنسبة ${snap.vat_rate} — والمستند ${snap.e_document_type} أي مطلوب رغم الإعفاء`);
  });

  it("٦ج) تاريخ خارج نطاق القواعد ⇒ لا مستحق ولا قيد", async () => {
    const before = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    const beforeEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(beforeEntries.count ?? 0).toBeGreaterThan(0);

    const { error } = await makeDue(feeTypeId, "2025-05-01", 700, "SANDBOX out of range");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);

    const after = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    const afterEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(after.count).toBe(before.count);
    expect(afterEntries.count).toBe(beforeEntries.count);
    step("٦ج", "تاريخ قبل سريان القواعد: رُفض، ولم يبقَ مستحق ولا قيد");
  });

  it("٧) الحالة النهائية للطيار — التغطية وسجل التدقيق", async () => {
    const { data: cov } = await owner.client.rpc("get_tax_decision_coverage", {
      p_organization_id: orgId,
    });
    const c = (cov as unknown as {
      total_dues: number; dues_with_decision: number; dues_without_decision: number;
      enforcement_enabled: boolean;
    }[])[0];
    expect(c.enforcement_enabled).toBe(true);
    expect(Number(c.dues_with_decision)).toBe(2);
    expect(Number(c.dues_without_decision), "المستحق السابق للتفعيل يبقى بلا قرار").toBe(1);

    const { data: logs } = await admin.from("platform_audit_logs")
      .select("action").eq("organization_id", orgId);
    const actions = (logs ?? []).map((l) => l.action);
    expect(actions).toContain("tax_enforcement.enabled");
    expect(actions.filter((a) => a === "tax_decision.recorded").length).toBe(2);

    step("٧", `الحالة: ${c.dues_with_decision} مصنَّف و${c.dues_without_decision} سابق للتفعيل من ${c.total_dues}؛ الإنفاذ مفعَّل والسجل يحمل ${actions.length} واقعة`);
    step("ملاحظة", "المؤسسة تبقى قائمة ومفعَّلة للمراقبة — لا توسيع قبل تقرير مستقل");
  });
});
