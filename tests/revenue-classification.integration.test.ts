/**
 * ADR 0003 — القواعد الضريبية المؤرَّخة والمُصدَّرة.
 *
 * نطاق هذا الملف **القواعد**: مناعتها، وعدم تداخلها، واتساق المعالجة مع النسبة،
 * ومَن يملك إدارتها. أما عقد تسجيل القرار فانتقل بالكامل إلى
 * `tax-decision-contract.integration.test.ts` بعد سحب العقد القديم؛ ما بقي هنا
 * منه اختبار واحد لا غنى عنه: **أن تعديل قاعدة لا يحرّك قرارًا تاريخيًا**، وهو
 * الادعاء المركزي للتصميم كله ولا يُثبت إلا بتعديل قاعدة بعد ترحيل قرار تحتها.
 *
 * الباقي اختبارات اختراق: كل واحد يحاول تجاوز ثابت من ثوابت ADR 0003.
 */
/**
 * ملاحظة على اختيار الاختصاص وطبيعة الإيراد أدناه:
 *
 * `tax_rule_versions` جدول **عالمي** لا يخص مؤسسة، وقيد عدم التداخل يسري على
 * `(jurisdiction, revenue_nature)` عبر المستأجرين جميعًا. فحين دخلت قواعد
 * الإنتاج المعتمدة لـ`EG` اصطدمت بها اختبارات كانت تنشئ قواعدها الخاصة لنفس
 * الزوج — وسقطت ثلاثة اختبارات دفعةً واحدة.
 *
 * لذلك تعمل الاختبارات في `SA` وعلى طبيعة إيراد لا تستعملها قواعد الإنتاج.
 * وهذا ليس التفافًا: مساحة الاختبار يجب أن تكون منفصلة عن مساحة الإنتاج في أي
 * مورد مشترك، وإلا صار كل إدخال إنتاجي كسرًا للاختبارات.
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

/** يميّز كل صف أنشأه هذا الملف حتى لا يلمس التنظيف شيئًا آخر. */
const SCOPE = `E2E_RC_${Date.now()}`;
const NATURE = "EVENT_VENUE_FEE";
const ISSUE_DATE = "2026-06-01";

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgA: string;
let dueA: string;
let staffA: Actor;
let platformAdmin: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-rc-${label.toLowerCase()}-${Date.now()}-${Math.floor(
    performance.now() * 1000,
  )}@aqarbooks-test.local`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error, `user create failed: ${error?.message}`).toBeNull();
  createdUserIds.push(created!.user!.id);
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
  return { userId: created!.user!.id, client };
}

async function makeOrgWithDue(label: string) {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E RevClass ${label} ${Date.now()}`,
      slug: `e2e-revclass-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_id: "100-000-111",
      tax_jurisdiction: "SA",
    } as never)
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: revenue } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId, code: "4100", name_ar: "إيراد اختبار",
      name_en: "Test Revenue", category: "REVENUE", normal_balance: "CREDIT",
    } as never)
    .select("id").single();
  const { data: receivable } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId, code: "1200", name_ar: "ذمم اختبار",
      name_en: "Test Receivable", category: "ASSET", normal_balance: "DEBIT",
    } as never)
    .select("id").single();

  const { data: property } = await admin
    .from("properties")
    .insert({
      organization_id: orgId, name: `E2E Property ${label}`,
      code: `E2E-RC-${label}-${Date.now()}`, timezone: "Africa/Cairo",
      property_type: "building",
    } as never)
    .select("id").single();

  const { data: unit } = await admin
    .from("units")
    .insert({
      organization_id: orgId, property_id: property!.id, code: `U-${label}-${Date.now()}`,
    } as never)
    .select("id").single();

  const { data: dueType } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: revenue!.id,
      // اسم بلا معنى ضريبي عمدًا: لو اشتُقّت الطبيعة من الاسم يومًا فهذا ما يكشفه.
      name_ar: "رسوم / x", name_en: "Fee / x", is_active: true,
    } as never)
    .select("id").single();

  const { data: due, error: dueErr } = await admin
    .from("dues")
    .insert({
      organization_id: orgId, property_id: property!.id, unit_id: unit!.id,
      due_type_id: dueType!.id, receivable_account_id: receivable!.id,
      amount: 1000, issue_date: ISSUE_DATE, due_date: "2026-07-01",
      status: "ISSUED", description: "E2E revenue classification",
    } as never)
    .select("id").single();
  expect(dueErr, `due insert failed: ${dueErr?.message}`).toBeNull();

  return { orgId, dueTypeId: dueType!.id as string, dueId: due!.id as string };
}

async function seedApprovedRule(opts: {
  effectiveFrom: string;
  effectiveTo?: string;
  treatment: string;
  rate: number | null;
  version: number;
}): Promise<string> {
  const { data, error } = await admin
    .from("tax_rule_versions")
    .insert({
      jurisdiction: "SA",
      revenue_nature: NATURE,
      tax_treatment: opts.treatment,
      vat_rate: opts.rate,
      effective_from: opts.effectiveFrom,
      effective_to: opts.effectiveTo ?? null,
      e_document_type: "BY_CUSTOMER_TYPE",
      issuer_scope: SCOPE,
      version: opts.version,
      rule_hash: "",
      status: "APPROVED",
      approved_by: platformAdmin.userId,
      approved_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  expect(error, `rule seed failed: ${error?.message}`).toBeNull();
  createdRuleIds.push(data!.id as string);
  return data!.id as string;
}

beforeAll(async () => {
  platformAdmin = await makeUser("PlatformAdmin");
  const { data: superRole } = await admin
    .from("roles").select("id").eq("key", "PLATFORM_SUPER_ADMIN").is("organization_id", null).single();
  expect(superRole, "PLATFORM_SUPER_ADMIN role must exist").not.toBeNull();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  const a = await makeOrgWithDue("A");
  orgA = a.orgId;
  dueA = a.dueId;
  staffA = await makeUser("StaffA");
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgA, user_id: staffA.userId, status: "active" });
  const { data: role } = await admin
    .from("roles").select("id").eq("organization_id", orgA).eq("key", "TENANT_OWNER").single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: staffA.userId, role_id: role!.id, organization_id: orgA });

  const { data: mappingId } = await staffA.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: a.dueTypeId,
    p_revenue_nature: NATURE,
  });
  await staffA.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: mappingId as unknown as string,
  });
}, 150_000);

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin
      .from("tax_decisions").delete().eq("organization_id", orgId)
      .not("reverses_decision_id", "is", null);
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("dues").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("units").delete().eq("organization_id", orgId);
    await admin.from("properties").delete().eq("organization_id", orgId);
    await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  }
  // القرارات حُذفت أعلاه، فلم تعد أي قاعدة مرجعًا لقرار مرحَّل ويجوز حذفها.
  if (createdRuleIds.length) {
    const { error } = await admin.from("tax_rule_versions").delete().in("id", createdRuleIds);
    expect(error, `fixture rules not removed: ${error?.message}`).toBeNull();
  }
  const { count } = await admin
    .from("tax_rule_versions")
    .select("id", { count: "exact", head: true })
    .eq("issuer_scope", SCOPE);
  expect(count ?? 0, "fixture rules left behind").toBe(0);
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
}, 150_000);

describe("ADR 0003 — القواعد الضريبية المؤرَّخة", () => {
  it("تعديل القاعدة لاحقًا لا يحرّك القرار التاريخي — وهذا هو ادعاء التصميم", async () => {
    await seedApprovedRule({
      effectiveFrom: "2026-01-01",
      treatment: "TAXABLE",
      rate: 14,
      version: 1,
    });

    const { data: decisionId, error } = await staffA.client.rpc("record_tax_decision_for_due", {
      p_due_id: dueA,
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: before } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id, tax_rule_hash, tax_decision_snapshot")
      .eq("id", decisionId as unknown as string)
      .single();
    const oldRuleId = before!.tax_rule_version_id as string;
    expect(before!.tax_rule_hash, "بصمة sha256").toHaveLength(64);

    // تشريع جديد: المعالجة تصبح معفاة اعتبارًا من 2026-07-01.
    const { data: newRuleId, error: supErr } = await platformAdmin.client.rpc("supersede_tax_rule", {
      p_rule_id: oldRuleId,
      p_effective_from: "2026-07-01",
      p_tax_treatment: "EXEMPT",
      p_vat_rate: 0,
      p_e_document_type: "BY_CUSTOMER_TYPE",
      p_issuer_scope: SCOPE,
    });
    expect(supErr, `supersede failed: ${supErr?.message}`).toBeNull();
    createdRuleIds.push(newRuleId as unknown as string);

    const { data: after } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id, tax_rule_hash, tax_decision_snapshot")
      .eq("id", decisionId as unknown as string)
      .single();

    expect(after!.tax_rule_version_id, "القرار ما يزال يشير إلى قاعدته").toBe(oldRuleId);
    // البصمة تستثني effective_to عمدًا، فإغلاق النافذة لا يُفسدها.
    expect(after!.tax_rule_hash, "البصمة لم تتحرك رغم إغلاق النافذة").toBe(before!.tax_rule_hash);
    expect(after!.tax_decision_snapshot).toEqual(before!.tax_decision_snapshot);
    expect(
      (after!.tax_decision_snapshot as Record<string, unknown>).tax_treatment,
      "المعاملة القديمة تبقى خاضعة رغم إعفاء التشريع الجديد",
    ).toBe("TAXABLE");

    // والبحث بالتاريخ يفرّق بين الفترتين.
    const { data: oldDateRule } = await admin.rpc("resolve_tax_rule", {
      p_jurisdiction: "SA", p_revenue_nature: NATURE, p_transaction_date: "2026-06-01",
    });
    const { data: newDateRule } = await admin.rpc("resolve_tax_rule", {
      p_jurisdiction: "SA", p_revenue_nature: NATURE, p_transaction_date: "2026-08-01",
    });
    expect((oldDateRule as unknown as { tax_treatment: string }).tax_treatment).toBe("TAXABLE");
    expect((newDateRule as unknown as { tax_treatment: string }).tax_treatment).toBe("EXEMPT");
  });

  it("القرار المسجَّل لا يُعدَّل حتى بمفتاح الخدمة", async () => {
    const { error } = await admin
      .from("tax_decisions")
      .update({ tax_rule_hash: "tampered" } as never)
      .eq("source_id", dueA);
    expect(error, "تعديل قرار مسجَّل يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_DECISION_IMMUTABLE/);
  });

  it("القاعدة المعتمدة لا يُعدَّل مضمونها، ولا تُحذف إن استند إليها قرار", async () => {
    // نافذة مغلقة في ماضٍ بعيد: هذا الاختبار يخص المناعة لا التداخل، فلا يجوز
    // أن يصطدم بقيد التداخل ويحجب ما جاء ليثبته.
    const ruleId = await seedApprovedRule({
      effectiveFrom: "2019-01-01",
      effectiveTo: "2019-06-01",
      treatment: "TAXABLE",
      rate: 14,
      version: 90,
    });

    const { error: editErr } = await admin
      .from("tax_rule_versions")
      .update({ vat_rate: 5 } as never)
      .eq("id", ruleId);
    expect(editErr, "تعديل مضمون قاعدة معتمدة يجب أن يُرفض").not.toBeNull();
    expect(editErr!.message).toMatch(/TAX_RULE_IMMUTABLE/);

    // القاعدة التي استند إليها قرار مرحَّل لا تُحذف — وهذا هو الضمان الفعلي.
    const { data: used } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id")
      .eq("source_id", dueA)
      .single();
    const { error: usedDelErr } = await admin
      .from("tax_rule_versions")
      .delete()
      .eq("id", used!.tax_rule_version_id as string);
    expect(usedDelErr, "قاعدة يستند إليها قرار يجب ألا تُحذف").not.toBeNull();
    expect(usedDelErr!.message).toMatch(/TAX_RULE_IMMUTABLE/);

    // أما قاعدة لم يُقرَّر تحتها شيء فلا تاريخ فيها يُحمى.
    const { error: unusedDelErr } = await admin
      .from("tax_rule_versions")
      .delete()
      .eq("id", ruleId);
    expect(unusedDelErr, `قاعدة بلا قرارات يجب أن تُحذف: ${unusedDelErr?.message}`).toBeNull();
    createdRuleIds.splice(createdRuleIds.indexOf(ruleId), 1);
  });

  it("يرفض تداخل نافذتين معتمدتين لنفس الاختصاص وطبيعة الإيراد", async () => {
    const { error } = await admin.from("tax_rule_versions").insert({
      jurisdiction: "SA",
      revenue_nature: NATURE,
      tax_treatment: "EXEMPT",
      vat_rate: 0,
      // يقع داخل نافذة قاعدة 2026-01-01 المُخلَفة.
      effective_from: "2026-03-01",
      e_document_type: "BY_CUSTOMER_TYPE",
      issuer_scope: SCOPE,
      version: 91,
      rule_hash: "",
      status: "APPROVED",
      approved_by: platformAdmin.userId,
      approved_at: new Date().toISOString(),
    } as never);
    expect(error, "التداخل الزمني يجب أن يُرفض").not.toBeNull();
    // 23P01 = exclusion_violation: القاعدة رفضته، لا التطبيق.
    expect(error!.code).toBe("23P01");
  });

  it("يرفض الخلط بين الإعفاء وصفر النسبة وخارج النطاق", async () => {
    const bad = [
      { treatment: "EXEMPT", rate: 14, why: "معفى بنسبة" },
      { treatment: "TAXABLE", rate: null, why: "خاضع بلا نسبة" },
      { treatment: "OUT_OF_SCOPE", rate: 0, why: "خارج النطاق بنسبة صفر" },
      { treatment: "REVIEW_REQUIRED", rate: 14, why: "تحت المراجعة بنسبة" },
    ];
    for (const [i, c] of bad.entries()) {
      const { error } = await admin.from("tax_rule_versions").insert({
        jurisdiction: "EG",
        revenue_nature: NATURE,
        tax_treatment: c.treatment,
        vat_rate: c.rate,
        effective_from: `20${30 + i}-01-01`,
        e_document_type: "NONE",
        issuer_scope: SCOPE,
        version: 200 + i,
        rule_hash: "",
        status: "DRAFT",
      } as never);
      expect(error, `يجب رفض: ${c.why}`).not.toBeNull();
    }
  });

  it("النوع المشتق لا تُوضع له قاعدة مستقلة", async () => {
    const { error } = await platformAdmin.client.rpc("create_tax_rule_draft", {
      p_jurisdiction: "SA",
      p_revenue_nature: "SALE_INSTALLMENT",
      p_tax_treatment: "TAXABLE",
      p_vat_rate: 14,
      p_effective_from: "2026-01-01",
      p_e_document_type: "E_INVOICE",
      p_issuer_scope: SCOPE,
    });
    expect(error, "القسط يرث ولا يُحسم").not.toBeNull();
    expect(error!.message).toMatch(/REVENUE_NATURE_DERIVED/);
  });

  it("إدارة القواعد ممنوعة على مستخدم المستأجر مهما كانت صلاحياته", async () => {
    const { error: draftErr } = await staffA.client.rpc("create_tax_rule_draft", {
      p_jurisdiction: "SA",
      p_revenue_nature: "CLEANING_SERVICE",
      p_tax_treatment: "TAXABLE",
      p_vat_rate: 14,
      p_effective_from: "2026-01-01",
      p_e_document_type: "E_INVOICE",
      p_issuer_scope: SCOPE,
    });
    expect(draftErr, "مالك المستأجر ليس مشرف منصة").not.toBeNull();
    expect(draftErr!.message).toMatch(/FORBIDDEN_TAX_RULE_ADMIN/);

    const { data: anyRule } = await admin
      .from("tax_rule_versions")
      .select("id").eq("issuer_scope", SCOPE).limit(1).single();
    const { error: supErr } = await staffA.client.rpc("supersede_tax_rule", {
      p_rule_id: anyRule!.id,
      p_effective_from: "2027-01-01",
      p_tax_treatment: "EXEMPT",
      p_vat_rate: 0,
      p_e_document_type: "NONE",
      p_issuer_scope: SCOPE,
    });
    expect(supErr!.message).toMatch(/FORBIDDEN_TAX_RULE_ADMIN/);
  });
});
