/**
 * ADR 0003 — المرحلة الأولى: أساس تصنيف الإيراد والقواعد الضريبية المؤرَّخة.
 *
 * الادعاء المركزي للتصميم هو أن **تعديل قاعدة لا يحرّك قرارًا تاريخيًا**. ادعاء
 * كهذا لا يُثبت بقراءة الكود، بل بتعديل قاعدة بعد الترحيل والتأكد أن القرار لم
 * يتزحزح — وهو ما يفعله الاختبار الخامس هنا. الباقي اختبارات اختراق: كل واحد
 * يحاول تجاوز ثابت من ثوابت ADR 0003 ويجب أن يفشل.
 *
 * يعمل على القاعدة الحقيقية عبر جلسة مُصادَقة، فتسري RLS وhas_permission تمامًا
 * كما في المنتج.
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

/** يُميّز كل صف أنشأه هذا الملف حتى لا يلمس التنظيف شيئًا آخر. */
const SCOPE = `E2E_RC_${Date.now()}`;
const NATURE = "MANAGEMENT_FEE";

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

let orgA: string;
let orgB: string;
let dueTypeA: string;
let dueTypeB: string;
let staffA: Actor;
let staffB: Actor;
let platformAdmin: Actor;
const createdRuleIds: string[] = [];
/**
 * تُسجَّل المؤسسة لحظة إنشائها لا بعد اكتمال التهيئة. النسخة الأولى أسندت المعرّف
 * بعد نجاح المؤسستين معًا، فلما فشلت الثانية بقيت الأولى في القاعدة بلا تنظيف.
 */
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-rc-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
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

async function makeOrgWithStaff(label: string) {
  const stamp = `${Date.now()}-${label}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E RevClass ${stamp}`,
      slug: `e2e-revclass-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_id: `100-000-${label === "A" ? "111" : "222"}`,
    } as never)
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const actor = await makeUser(label);
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", "TENANT_OWNER")
    .single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: actor.userId, role_id: role!.id, organization_id: orgId });

  // due_types يشترط حساب إيراد؛ حساب واحد يكفي لهذا الاختبار.
  const { data: account, error: acctErr } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId,
      code: "4100",
      name_ar: "إيراد اختبار",
      name_en: "Test Revenue",
      category: "REVENUE",
      normal_balance: "CREDIT",
    } as never)
    .select("id")
    .single();
  expect(acctErr, `account insert failed: ${acctErr?.message}`).toBeNull();

  const { data: dueType, error: dtErr } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: account!.id,
      // اسم عديم المعنى الضريبي عمدًا: لو اشتُقّت الطبيعة من الاسم يومًا،
      // فهذا النوع هو ما سيكشف ذلك.
      name_ar: "رسوم / x",
      name_en: "Fee / x",
      is_active: true,
    } as never)
    .select("id")
    .single();
  expect(dtErr, `due_type insert failed: ${dtErr?.message}`).toBeNull();

  return { orgId, actor, dueTypeId: dueType!.id as string };
}

/** ينشئ قاعدة معتمدة مباشرةً — يتجاوز RPC المشرف لتثبيت حالة بداية الاختبار. */
async function seedApprovedRule(opts: {
  effectiveFrom: string;
  treatment: string;
  rate: number | null;
  version: number;
  effectiveTo?: string;
}): Promise<string> {
  const { data, error } = await admin
    .from("tax_rule_versions")
    .insert({
      jurisdiction: "EG",
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
    .from("roles")
    .select("id")
    .eq("key", "PLATFORM_SUPER_ADMIN")
    .is("organization_id", null)
    .single();
  expect(superRole, "PLATFORM_SUPER_ADMIN role must exist").not.toBeNull();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  const a = await makeOrgWithStaff("A");
  const b = await makeOrgWithStaff("B");
  orgA = a.orgId;
  dueTypeA = a.dueTypeId;
  staffA = a.actor;
  orgB = b.orgId;
  dueTypeB = b.dueTypeId;
  staffB = b.actor;
}, 120_000);

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  }
  // القرارات حُذفت أعلاه، فلم تعد أي قاعدة مرجعًا لقرار مرحَّل ويجوز حذفها.
  // الخطأ يُفحص صراحةً: أول نسخة من هذا التنظيف فشلت صامتةً وتركت قواعد عالمية.
  if (createdRuleIds.length) {
    const { error: ruleDelErr } = await admin
      .from("tax_rule_versions")
      .delete()
      .in("id", createdRuleIds);
    expect(ruleDelErr, `fixture rules not removed: ${ruleDelErr?.message}`).toBeNull();
  }
  const { count } = await admin
    .from("tax_rule_versions")
    .select("id", { count: "exact", head: true })
    .eq("issuer_scope", SCOPE);
  expect(count ?? 0, "fixture rules left behind").toBe(0);
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}, 120_000);

describe("ADR 0003 — أساس تصنيف الإيراد", () => {
  it("يرفض الترحيل لنوع مستحق غير مربوط، ولا يستنطق الاسم النصي", async () => {
    const { error } = await staffA.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000a1",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2026-06-01",
    });
    expect(error, "غير المربوط يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);

    const { count } = await admin
      .from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA);
    expect(count ?? 0, "لا يُسجَّل قرار تحت المراجعة").toBe(0);
  });

  it("الربط الجديد يبدأ REVIEW_REQUIRED ويظل حاجبًا حتى يُعتمد", async () => {
    const { data: mappingId, error } = await staffA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: NATURE,
    });
    expect(error, `mapping failed: ${error?.message}`).toBeNull();

    const { data: row } = await admin
      .from("due_type_revenue_natures")
      .select("status, approved_at")
      .eq("id", mappingId as unknown as string)
      .single();
    expect(row!.status, "الربط لا يُولد معتمدًا").toBe("REVIEW_REQUIRED");
    expect(row!.approved_at).toBeNull();

    const { error: blocked } = await staffA.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000a2",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2026-06-01",
    });
    expect(blocked!.message).toMatch(/TAX_REVIEW_REQUIRED/);
  });

  it("يرفض الترحيل حين لا توجد قاعدة معتمدة سارية بتاريخ المعاملة", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id")
      .eq("organization_id", orgA)
      .single();
    const { error: approveErr } = await staffA.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: mapping!.id,
    });
    expect(approveErr, `approval failed: ${approveErr?.message}`).toBeNull();

    // القاعدة تبدأ 2026-01-01؛ المعاملة أقدم منها.
    await seedApprovedRule({ effectiveFrom: "2026-01-01", treatment: "TAXABLE", rate: 14, version: 1 });

    const { error } = await staffA.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000a3",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2025-06-01",
    });
    expect(error, "تاريخ خارج نطاق أي قاعدة يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);
  });

  it("يسجّل القرار ببصمة كاملة حين تكتمل الحلقة", async () => {
    const { data: decisionId, error } = await staffA.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000a4",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2026-06-01",
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: decision } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id, tax_rule_hash, tax_decision_snapshot, revenue_nature")
      .eq("id", decisionId as unknown as string)
      .single();

    expect(decision!.revenue_nature).toBe(NATURE);
    expect(decision!.tax_rule_version_id).not.toBeNull();
    expect(decision!.tax_rule_hash, "بصمة sha256").toHaveLength(64);

    const snap = decision!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.tax_treatment).toBe("TAXABLE");
    expect(Number(snap.vat_rate)).toBe(14);
    // اللقطة وحدها يجب أن تكفي لإعادة إنتاج القرار لو فُقد جدول القواعد.
    expect(snap.effective_from).toBe("2026-01-01");
    expect(snap.rule_hash).toBe(decision!.tax_rule_hash);
  });

  it("تعديل القاعدة لاحقًا لا يحرّك القرار التاريخي — وهذا هو ادعاء التصميم", async () => {
    const { data: before } = await admin
      .from("tax_decisions")
      .select("id, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot")
      .eq("source_id", "00000000-0000-0000-0000-0000000000a4")
      .single();

    const oldRuleId = before!.tax_rule_version_id as string;

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
      .eq("id", before!.id)
      .single();

    expect(after!.tax_rule_version_id, "القرار ما يزال يشير إلى قاعدته").toBe(oldRuleId);
    expect(after!.tax_rule_hash, "البصمة لم تتحرك رغم إغلاق النافذة").toBe(before!.tax_rule_hash);
    expect(after!.tax_decision_snapshot).toEqual(before!.tax_decision_snapshot);
    expect(
      (after!.tax_decision_snapshot as Record<string, unknown>).tax_treatment,
      "المعاملة القديمة تبقى خاضعة رغم إعفاء التشريع الجديد",
    ).toBe("TAXABLE");

    // والبحث بالتاريخ يفرّق بين الفترتين.
    const { data: oldDateRule } = await admin.rpc("resolve_tax_rule", {
      p_jurisdiction: "EG",
      p_revenue_nature: NATURE,
      p_transaction_date: "2026-06-01",
    });
    const { data: newDateRule } = await admin.rpc("resolve_tax_rule", {
      p_jurisdiction: "EG",
      p_revenue_nature: NATURE,
      p_transaction_date: "2026-08-01",
    });
    expect((oldDateRule as unknown as { tax_treatment: string }).tax_treatment).toBe("TAXABLE");
    expect((newDateRule as unknown as { tax_treatment: string }).tax_treatment).toBe("EXEMPT");
  });

  it("القرار المسجَّل لا يُعدَّل حتى بمفتاح الخدمة", async () => {
    const { error } = await admin
      .from("tax_decisions")
      .update({ tax_rule_hash: "tampered" } as never)
      .eq("source_id", "00000000-0000-0000-0000-0000000000a4");
    expect(error, "تعديل قرار مسجَّل يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_DECISION_IMMUTABLE/);
  });

  it("القاعدة المعتمدة لا يُعدَّل مضمونها ولا تُحذف", async () => {
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
    const { data: usedDecision } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id")
      .eq("source_id", "00000000-0000-0000-0000-0000000000a4")
      .single();
    const { error: usedDelErr } = await admin
      .from("tax_rule_versions")
      .delete()
      .eq("id", usedDecision!.tax_rule_version_id as string);
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
      jurisdiction: "EG",
      revenue_nature: NATURE,
      tax_treatment: "EXEMPT",
      vat_rate: 0,
      // يقع داخل نافذة قاعدة 2026-01-01 المفتوحة/المُخلَفة.
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
        jurisdiction: "SA",
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
      p_jurisdiction: "EG",
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
      p_jurisdiction: "EG",
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
      .select("id")
      .eq("issuer_scope", SCOPE)
      .limit(1)
      .single();
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

  it("العزل بين المؤسسات محفوظ للقراءة والربط والترحيل", async () => {
    // B لا يرى ربط A ولا قراراته.
    const { data: leakedMap } = await staffB.client
      .from("due_type_revenue_natures")
      .select("id")
      .eq("organization_id", orgA);
    expect(leakedMap ?? [], "RLS يخفي ربط مستأجر آخر").toEqual([]);

    const { data: leakedDecisions } = await staffB.client
      .from("tax_decisions")
      .select("id")
      .eq("organization_id", orgA);
    expect(leakedDecisions ?? [], "RLS يخفي قرارات مستأجر آخر").toEqual([]);

    // ولا يربط نوع مستحق يخص A.
    const { error: crossMap } = await staffB.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: NATURE,
    });
    expect(crossMap, "الربط عبر المؤسسات يجب أن يُرفض").not.toBeNull();
    expect(crossMap!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    // ولا يرحّل عنه.
    const { error: crossRecord } = await staffB.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000b1",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2026-06-01",
    });
    expect(crossRecord!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    // وربط B الخاص به لا يرث اعتماد A.
    await staffB.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeB,
      p_revenue_nature: NATURE,
    });
    const { data: bMap } = await admin
      .from("due_type_revenue_natures")
      .select("status")
      .eq("organization_id", orgB)
      .single();
    expect(bMap!.status).toBe("REVIEW_REQUIRED");
  });

  it("تغيير طبيعة إيراد مربوطة يعيدها إلى المراجعة ويحجب الترحيل من جديد", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id, status")
      .eq("organization_id", orgA)
      .single();
    expect(mapping!.status, "نقطة البداية معتمدة").toBe("APPROVED");

    await staffA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: "CLEANING_SERVICE",
    });

    const { data: after } = await admin
      .from("due_type_revenue_natures")
      .select("status, revenue_nature, approved_at")
      .eq("id", mapping!.id)
      .single();
    expect(after!.revenue_nature).toBe("CLEANING_SERVICE");
    // تغيير الطبيعة قرار ضريبي، فلا يرث اعتماد الربط السابق.
    expect(after!.status, "التغيير يُلغي الاعتماد").toBe("REVIEW_REQUIRED");
    expect(after!.approved_at).toBeNull();

    const { error } = await staffA.client.rpc("record_tax_decision", {
      p_source_type: "DUE",
      p_source_id: "00000000-0000-0000-0000-0000000000a9",
      p_due_type_id: dueTypeA,
      p_jurisdiction: "EG",
      p_transaction_date: "2026-06-01",
    });
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);
  });
});
