/**
 * مبلغ ضريبة المخرجات — الحساب نفسه.
 *
 * مرحلة التصنيف بنت **الحُكم** («خاضع 14%») ولم تبنِ **المبلغ**. هذا الملف يختبر
 * المبلغ: الأساس، والضريبة، والإجمالي، ومَن يقرر أن مبلغ المستحق صافٍ أم شامل.
 *
 * ثلاثة أشياء تُختبَر هنا لأنها تُخطئ صامتةً:
 *   - الاستخراج من مبلغ شامل ليس ضربًا في النسبة بل قسمة على (100 + النسبة).
 *   - `base + vat` يجب أن يساوي `gross` **بالضبط**، فالتقريب المزدوج يفتح فروقًا.
 *   - التقريب بخانات العملة لا بخانتين: الدينار الكويتي ثلاث خانات، وافتراض
 *     خانتين يبتلع فلوسًا في كل سطر.
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

const SCOPE = `E2E_VAT_${Date.now()}`;
const TAXABLE_NATURE = "CONTRACTOR_RECHARGE";
const EXEMPT_NATURE = "INTEREST_FINANCING_CHARGE";
const RATE = 15;

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };
type Org = {
  id: string; propertyId: string; unitId: string; receivableId: string;
  taxableTypeId: string; exemptTypeId: string; owner: Actor;
};

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let egp: Org;
let kwd: Org;
let platformAdmin: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-vat-${label.toLowerCase()}-${Date.now()}-${Math.floor(
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

async function makeOrg(label: string, currency: string): Promise<Org> {
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E OutputVAT ${label} ${Date.now()}`,
    slug: `e2e-outputvat-${label.toLowerCase()}-${Date.now()}`,
    default_currency: currency,
    status: "ACTIVE",
    tax_id: `100-VAT-${label}`,
    tax_jurisdiction: "SA",
  } as never).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
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
  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: `P ${label}`, code: `E2E-VAT-${label}-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: property!.id, code: `U-${label}-${Date.now()}`,
  } as never).select("id").single();
  const { data: taxableType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "نوع خاضع", name_en: "Taxable type", is_active: true,
  } as never).select("id").single();
  const { data: exemptType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "نوع معفى", name_en: "Exempt type", is_active: true,
  } as never).select("id").single();

  const owner = await makeUser(label);
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: owner.userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: owner.userId, role_id: role!.id, organization_id: orgId });

  return {
    id: orgId,
    propertyId: property!.id as string,
    unitId: unit!.id as string,
    receivableId: receivable!.id as string,
    taxableTypeId: taxableType!.id as string,
    exemptTypeId: exemptType!.id as string,
    owner,
  };
}

async function seedRule(nature: string, treatment: string, rate: number | null, version: number) {
  const { data, error } = await admin.from("tax_rule_versions").insert({
    jurisdiction: "SA", revenue_nature: nature, tax_treatment: treatment, vat_rate: rate,
    effective_from: "2026-01-01", e_document_type: "BY_CUSTOMER_TYPE", issuer_scope: SCOPE,
    version, rule_hash: "", status: "APPROVED",
    approved_by: platformAdmin.userId, approved_at: new Date().toISOString(),
  } as never).select("id").single();
  expect(error, `rule seed failed: ${error?.message}`).toBeNull();
  createdRuleIds.push(data!.id as string);
}

async function mapApprove(org: Org, dueTypeId: string, nature: string, basis: string | null) {
  const { data: id, error } = await org.owner.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: dueTypeId, p_revenue_nature: nature, p_amount_basis: basis,
  });
  expect(error, `mapping failed: ${error?.message}`).toBeNull();
  const { error: appErr } = await org.owner.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: id as unknown as string,
  });
  expect(appErr, `approve failed: ${appErr?.message}`).toBeNull();
}

async function decide(org: Org, dueTypeId: string, amount: number) {
  const { data, error } = await admin.from("dues").insert({
    organization_id: org.id, property_id: org.propertyId, unit_id: org.unitId,
    due_type_id: dueTypeId, receivable_account_id: org.receivableId,
    amount, issue_date: "2026-06-01", due_date: "2026-07-01",
    status: "ISSUED", description: "E2E output vat",
  } as never).select("id");
  expect(error, `due insert failed: ${error?.message}`).toBeNull();
  const { data: id, error: recErr } = await org.owner.client.rpc("record_tax_decision_for_due", {
    p_due_id: data![0].id as string,
  });
  expect(recErr, `record failed: ${recErr?.message}`).toBeNull();
  const { data: d } = await admin.from("tax_decisions")
    .select("amount_basis, taxable_base, vat_amount, gross_amount, tax_decision_snapshot")
    .eq("id", id as unknown as string).single();
  return d!;
}

beforeAll(async () => {
  platformAdmin = await makeUser("PlatformAdmin");
  const { data: superRole } = await admin.from("roles")
    .select("id").eq("key", "PLATFORM_SUPER_ADMIN").is("organization_id", null).single();
  await admin.from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  await seedRule(TAXABLE_NATURE, "TAXABLE", RATE, 1);
  await seedRule(EXEMPT_NATURE, "EXEMPT", 0, 1);

  egp = await makeOrg("EGP", "EGP");
  kwd = await makeOrg("KWD", "KWD");
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const orgId of createdOrgIds) {
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("dues").delete().eq("organization_id", orgId);
    const { data: entries } = await admin.from("journal_entries")
      .select("id").eq("organization_id", orgId);
    for (const e of entries ?? []) {
      await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
    }
    await admin.from("journal_entries").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("units").delete().eq("organization_id", orgId);
    await admin.from("properties").delete().eq("organization_id", orgId);
    await admin.from("due_types").delete().eq("organization_id", orgId);
    await admin.from("chart_of_accounts")
      .update({ is_used: false } as never).eq("organization_id", orgId);
    await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) failures.push(`org ${orgId}: ${error.message}`);
  }
  if (createdRuleIds.length) {
    const { error } = await admin.from("tax_rule_versions").delete().in("id", createdRuleIds);
    if (error) failures.push(`rules: ${error.message}`);
  }
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
  expect(failures, `teardown left state behind: ${failures.join(" | ")}`).toEqual([]);
}, 180_000);

describe("مبلغ ضريبة المخرجات", () => {
  it("لا يُخمَّن أساس المبلغ: المعالجة الخاضعة بلا أساس تحجب القرار", async () => {
    await mapApprove(egp, egp.taxableTypeId, TAXABLE_NATURE, null);

    const { data: due } = await admin.from("dues").insert({
      organization_id: egp.id, property_id: egp.propertyId, unit_id: egp.unitId,
      due_type_id: egp.taxableTypeId, receivable_account_id: egp.receivableId,
      amount: 1000, issue_date: "2026-06-01", due_date: "2026-07-01",
      status: "ISSUED", description: "E2E no basis",
    } as never).select("id");

    const { error } = await egp.owner.client.rpc("record_tax_decision_for_due", {
      p_due_id: due![0].id as string,
    });
    expect(error, "بلا أساس لا يُحسب مبلغ").not.toBeNull();
    expect(error!.message).toMatch(/TAX_AMOUNT_BASIS_REQUIRED/);
  });

  it("والجاهزية تكشفه قبل التفعيل لا بعده", async () => {
    const { data: gaps } = await egp.owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: egp.id,
    });
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);
    // لولا هذا الفحص لمرّ التفعيل ثم انهار أول إصدار خاضع.
    expect(codes).toContain("AMOUNT_BASIS_MISSING");
  });

  it("أساس صافٍ: الضريبة تُضاف فوق المبلغ", async () => {
    await mapApprove(egp, egp.taxableTypeId, TAXABLE_NATURE, "NET");
    const d = await decide(egp, egp.taxableTypeId, 1000);

    expect(d.amount_basis).toBe("NET");
    expect(Number(d.taxable_base)).toBe(1000);
    expect(Number(d.vat_amount)).toBe(150);
    expect(Number(d.gross_amount)).toBe(1150);
  });

  it("أساس شامل: الضريبة تُستخرج بالقسمة على (100 + النسبة) لا بالضرب فيها", async () => {
    await mapApprove(egp, egp.taxableTypeId, TAXABLE_NATURE, "GROSS");
    const d = await decide(egp, egp.taxableTypeId, 1150);

    expect(d.amount_basis).toBe("GROSS");
    // الخطأ الشائع هنا 1150×15% = 172.5 — وهو ما ترفضه هذه الأرقام.
    expect(Number(d.vat_amount)).toBe(150);
    expect(Number(d.taxable_base)).toBe(1000);
    expect(Number(d.gross_amount)).toBe(1150);
  });

  it("المعفى: لا ضريبة، والإجمالي هو المبلغ نفسه", async () => {
    await mapApprove(egp, egp.exemptTypeId, EXEMPT_NATURE, null);
    const d = await decide(egp, egp.exemptTypeId, 5000);

    expect(Number(d.vat_amount)).toBe(0);
    expect(Number(d.taxable_base)).toBe(5000);
    expect(Number(d.gross_amount)).toBe(5000);
    const snap = d.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.tax_treatment).toBe("EXEMPT");
  });

  it("التقريب بخانات العملة: الدينار الكويتي ثلاث خانات لا خانتان", async () => {
    await mapApprove(kwd, kwd.taxableTypeId, TAXABLE_NATURE, "NET");
    const d = await decide(kwd, kwd.taxableTypeId, 1000.123);

    const snap = d.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.currency).toBe("KWD");
    expect(Number(snap.currency_decimals), "ثلاث خانات").toBe(3);

    // 1000.123 × 15% = 150.01845 ⇒ 150.018 بثلاث خانات.
    // افتراض خانتين كان سيعطي 150.02 ويبتلع فرقًا في كل سطر.
    expect(Number(d.vat_amount)).toBe(150.018);
    expect(Number(d.taxable_base)).toBe(1000.123);
    expect(Number(d.gross_amount)).toBe(1150.141);
  });

  it("الأساس زائد الضريبة يساوي الإجمالي بالضبط في كل حالة", async () => {
    const { data: rows } = await admin.from("tax_decisions")
      .select("taxable_base, vat_amount, gross_amount")
      .in("organization_id", [egp.id, kwd.id]);

    expect((rows ?? []).length, "لا بد من قرارات وإلا كان التوكيد فارغًا").toBeGreaterThan(0);
    for (const r of rows ?? []) {
      // القيد في القاعدة يفرضه، وهذا يتحقق منه على بيانات فعلية: التقريب
      // المزدوج (تقريب الأساس ثم تقريب الضريبة) يفتح فرقًا لا يظهر إلا هنا.
      expect(Number(r.taxable_base) + Number(r.vat_amount)).toBe(Number(r.gross_amount));
    }
  });

  it("تغيير أساس المبلغ يُلغي اعتماد الربط — فهو قرار لا إعداد", async () => {
    const { data: before } = await admin.from("due_type_revenue_natures")
      .select("id, status").eq("organization_id", egp.id).eq("due_type_id", egp.taxableTypeId).single();
    expect(before!.status).toBe("APPROVED");

    await egp.owner.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: egp.taxableTypeId, p_revenue_nature: TAXABLE_NATURE, p_amount_basis: "NET",
    });

    const { data: after } = await admin.from("due_type_revenue_natures")
      .select("status, amount_basis, approved_at").eq("id", before!.id).single();
    expect(after!.amount_basis).toBe("NET");
    expect(after!.status, "تغيير الأساس يغيّر المبلغ المستحق فعليًا").toBe("REVIEW_REQUIRED");
    expect(after!.approved_at).toBeNull();
  });
});
