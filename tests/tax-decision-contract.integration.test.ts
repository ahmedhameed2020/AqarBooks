/**
 * عقد القرار الضريبي بعد إصلاح المراجعة.
 *
 * الاختبارات السابقة مرّت رغم عيوب حقيقية لأنها كانت تمرّر مُدخَلات **متسقة**:
 * فكانت تختبر الحواجز التي تقرؤها الدالة، لا ثقتها بما يُملى عليها. هذه المجموعة
 * تفعل العكس تحديدًا — تحاول التزوير، وكل محاولة يجب أن تفشل أو تُتجاهَل لصالح
 * ما هو مكتوب في صف المصدر.
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

const SCOPE = `E2E_TDC_${Date.now()}`;
const NATURE = "MANAGEMENT_FEE";
const ISSUE_DATE = "2026-03-15";

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgA: string;
let orgB: string;
let propertyA: string;
let unitA: string;
let dueTypeA: string;
let dueTypeB: string;
let dueA: string;
let dueB: string;
let ownerA: Actor;
let ownerB: Actor;
let platformAdmin: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-tdc-${label.toLowerCase()}-${Date.now()}-${Math.floor(
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

async function makeOrg(label: string, jurisdiction: string | null) {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: `E2E TaxDecision ${label} ${Date.now()}`,
      slug: `e2e-tdc-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_jurisdiction: jurisdiction,
    } as never)
    .select("id")
    .single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: revenue } = await admin
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

  const { data: receivable } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId,
      code: "1200",
      name_ar: "ذمم اختبار",
      name_en: "Test Receivable",
      category: "ASSET",
      normal_balance: "DEBIT",
    } as never)
    .select("id")
    .single();

  const { data: property, error: propErr } = await admin
    .from("properties")
    .insert({
      organization_id: orgId,
      name: `E2E Property ${label}`,
      code: `E2E-${label}-${Date.now()}`,
      timezone: "Africa/Cairo",
      property_type: "building",
    } as never)
    .select("id")
    .single();
  expect(propErr, `property insert failed: ${propErr?.message}`).toBeNull();

  const { data: unit, error: unitErr } = await admin
    .from("units")
    .insert({
      organization_id: orgId,
      property_id: property!.id,
      code: `U-${label}-${Date.now()}`,
    } as never)
    .select("id")
    .single();
  expect(unitErr, `unit insert failed: ${unitErr?.message}`).toBeNull();

  const { data: dueType, error: dtErr } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: revenue!.id,
      name_ar: `Fee / x ${label}`,
      name_en: `Fee / x ${label}`,
      is_active: true,
    } as never)
    .select("id")
    .single();
  expect(dtErr, `due_type insert failed: ${dtErr?.message}`).toBeNull();

  const { data: due, error: dueErr } = await admin
    .from("dues")
    .insert({
      organization_id: orgId,
      property_id: property!.id,
      unit_id: unit!.id,
      due_type_id: dueType!.id,
      receivable_account_id: receivable!.id,
      amount: 1000,
      issue_date: ISSUE_DATE,
      due_date: "2026-04-15",
      status: "ISSUED",
      description: `E2E tax decision ${label}`,
    } as never)
    .select("id")
    .single();
  expect(dueErr, `due insert failed: ${dueErr?.message}`).toBeNull();

  return {
    orgId,
    propertyId: property!.id as string,
    unitId: unit!.id as string,
    dueTypeId: dueType!.id as string,
    dueId: due!.id as string,
  };
}

async function approveMapping(actor: Actor, dueTypeId: string) {
  const { data: mappingId, error } = await actor.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: dueTypeId,
    p_revenue_nature: NATURE,
  });
  expect(error, `mapping failed: ${error?.message}`).toBeNull();
  const { error: approveErr } = await actor.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: mappingId as unknown as string,
  });
  expect(approveErr, `approve failed: ${approveErr?.message}`).toBeNull();
}

async function seedRule(opts: {
  from: string;
  to?: string;
  treatment: string;
  rate: number | null;
  version: number;
}) {
  const { data, error } = await admin
    .from("tax_rule_versions")
    .insert({
      jurisdiction: "EG",
      revenue_nature: NATURE,
      tax_treatment: opts.treatment,
      vat_rate: opts.rate,
      effective_from: opts.from,
      effective_to: opts.to ?? null,
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
  await admin
    .from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  const a = await makeOrg("A", "EG");
  orgA = a.orgId;
  propertyA = a.propertyId;
  unitA = a.unitId;
  dueTypeA = a.dueTypeId;
  dueA = a.dueId;
  ownerA = await makeUser("OwnerA");
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgA, user_id: ownerA.userId, status: "active" });
  const { data: roleA } = await admin
    .from("roles").select("id").eq("organization_id", orgA).eq("key", "TENANT_OWNER").single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: ownerA.userId, role_id: roleA!.id, organization_id: orgA });

  const b = await makeOrg("B", "EG");
  orgB = b.orgId;
  dueTypeB = b.dueTypeId;
  dueB = b.dueId;
  ownerB = await makeUser("OwnerB");
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgB, user_id: ownerB.userId, status: "active" });
  const { data: roleB } = await admin
    .from("roles").select("id").eq("organization_id", orgB).eq("key", "TENANT_OWNER").single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: ownerB.userId, role_id: roleB!.id, organization_id: orgB });

  await approveMapping(ownerA, dueTypeA);
  await approveMapping(ownerB, dueTypeB);
}, 150_000);

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    // القرارات العكسية أولًا: صف الأصل مشار إليه من العكسي.
    await admin.from("tax_decisions").delete().eq("organization_id", orgId).not("reverses_decision_id", "is", null);
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("dues").delete().eq("organization_id", orgId);
    await admin.from("journal_entry_lines").delete().eq("organization_id", orgId);
    await admin.from("journal_entries").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
    await admin.from("units").delete().eq("organization_id", orgId);
    await admin.from("properties").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  }
  if (createdRuleIds.length) {
    const { error } = await admin.from("tax_rule_versions").delete().in("id", createdRuleIds);
    expect(error, `fixture rules not removed: ${error?.message}`).toBeNull();
  }
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);
}, 150_000);

describe("عقد القرار الضريبي — المصدر هو الحقيقة", () => {
  it("العقد القديم ذو المُدخَلات المستقلة لم يعد موجودًا", async () => {
    // إبقاؤه متاحًا يجعل الإصلاح اختياريًا: يكفي أن يستدعي أحدٌ القديم.
    const { error } = await ownerA.client.rpc(
      "record_tax_decision" as never,
      {
        p_source_type: "DUE",
        p_source_id: dueA,
        p_due_type_id: dueTypeA,
        p_jurisdiction: "EG",
        p_transaction_date: "2020-01-01",
      } as never,
    );
    expect(error, "العقد القديم يجب أن يكون مسحوبًا").not.toBeNull();
  });

  it("مصدر من مؤسسة أخرى مرفوض — الصلاحية تُفحص على مالك المصدر", async () => {
    await seedRule({ from: "2026-01-01", treatment: "TAXABLE", rate: 14, version: 1 });

    // A تحاول تسجيل قرار لمستحق يخص B. لم يعد بالإمكان تمرير نوع مستحق من A
    // لتمرير فحص الصلاحية: المؤسسة تُقرأ من المستحق نفسه.
    const { error } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: dueB,
    });
    expect(error, "التسجيل عبر المؤسسات يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    const { count } = await admin
      .from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("source_id", dueB);
    expect(count ?? 0, "لا يُختم قرار لمستحق مؤسسة أخرى").toBe(0);
  });

  it("تاريخ المعاملة يؤخذ من المستحق ولا يمكن تزويره", async () => {
    const { data: decisionId, error } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: dueA,
    });
    expect(error, `record failed: ${error?.message}`).toBeNull();

    const { data: decision } = await admin
      .from("tax_decisions")
      .select("transaction_date, tax_decision_snapshot, jurisdiction, revenue_nature")
      .eq("id", decisionId as unknown as string)
      .single();

    // لا يوجد مُعامل تاريخ في التوقيع أصلًا؛ هذا يثبت أن المأخوذ هو issue_date.
    expect(decision!.transaction_date).toBe(ISSUE_DATE);
    const snap = decision!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.source_issue_date).toBe(ISSUE_DATE);
    // والاختصاص مشتق من صفة المؤسسة القانونية لا من مُدخَل.
    expect(decision!.jurisdiction).toBe("EG");
    expect(decision!.revenue_nature).toBe(NATURE);
  });

  it("تكرار الاستدعاء يعيد القرار نفسه ولا يرفع خطأ", async () => {
    const { data: first } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: dueA,
    });
    const { data: second, error } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: dueA,
    });
    expect(error, "إعادة المحاولة بعد انقطاع يجب ألا تنفجر").toBeNull();
    expect(second).toBe(first);

    const { count } = await admin
      .from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("source_id", dueA);
    expect(count ?? 0, "لا يُنشأ صف ثانٍ").toBe(1);
  });

  it("الاختصاص الضريبي غير المسجَّل يمنع القرار ولا يُخمَّن", async () => {
    const { data: due } = await admin
      .from("dues")
      .select("id")
      .eq("organization_id", orgB)
      .single();

    await admin.from("organizations").update({ tax_jurisdiction: null } as never).eq("id", orgB);

    const { error } = await ownerB.client.rpc("record_tax_decision_for_due", {
      p_due_id: due!.id,
    });
    expect(error, "الغياب يُرفض ولا يُفترض EG").not.toBeNull();
    expect(error!.message).toMatch(/TAX_JURISDICTION_MISSING/);

    await admin.from("organizations").update({ tax_jurisdiction: "EG" } as never).eq("id", orgB);
  });

  it("مستحق ملغى لا يُسجَّل له قرار", async () => {
    const { data: voidDue } = await admin
      .from("dues")
      .insert({
        organization_id: orgA,
        property_id: propertyA,
        unit_id: unitA,
        due_type_id: dueTypeA,
        receivable_account_id: (
          await admin
            .from("chart_of_accounts")
            .select("id")
            .eq("organization_id", orgA)
            .eq("code", "1200")
            .single()
        ).data!.id,
        amount: 500,
        issue_date: ISSUE_DATE,
        due_date: "2026-04-15",
        status: "VOID",
        description: "E2E void",
      } as never)
      .select("id")
      .single();

    const { error } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: voidDue!.id,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/DUE_VOID/);
  });

  it("التصحيح يُنشئ أثرًا عكسيًا ولا يمحو الأصل", async () => {
    const { data: original } = await admin
      .from("tax_decisions")
      .select("id, tax_rule_hash, tax_decision_snapshot")
      .eq("source_id", dueA)
      .single();

    const { error: noReason } = await ownerA.client.rpc("reverse_tax_decision", {
      p_decision_id: original!.id,
      p_reason: "   ",
    });
    expect(noReason, "الإبطال بلا سبب مرفوض").not.toBeNull();
    expect(noReason!.message).toMatch(/TAX_DECISION_REASON_REQUIRED/);

    const { data: reversalId, error } = await ownerA.client.rpc("reverse_tax_decision", {
      p_decision_id: original!.id,
      p_reason: "ربط خاطئ اكتُشف في المراجعة",
    });
    expect(error, `reverse failed: ${error?.message}`).toBeNull();

    // الأصل باقٍ كما هو، حرفيًا.
    const { data: stillThere } = await admin
      .from("tax_decisions")
      .select("id, tax_rule_hash, tax_decision_snapshot")
      .eq("id", original!.id)
      .single();
    expect(stillThere!.id).toBe(original!.id);
    expect(stillThere!.tax_rule_hash).toBe(original!.tax_rule_hash);
    expect(stillThere!.tax_decision_snapshot).toEqual(original!.tax_decision_snapshot);

    // والعكسي يحمل بصمة الأصل نفسها: قيد عكسي لا إعادة تقييم بقاعدة اليوم.
    const { data: reversal } = await admin
      .from("tax_decisions")
      .select("reverses_decision_id, reason, tax_rule_hash")
      .eq("id", reversalId as unknown as string)
      .single();
    expect(reversal!.reverses_decision_id).toBe(original!.id);
    expect(reversal!.reason).toBe("ربط خاطئ اكتُشف في المراجعة");
    expect(reversal!.tax_rule_hash).toBe(original!.tax_rule_hash);

    // الإبطال مرتين مرفوض.
    const { error: twice } = await ownerA.client.rpc("reverse_tax_decision", {
      p_decision_id: original!.id,
      p_reason: "محاولة ثانية",
    });
    expect(twice!.message).toMatch(/TAX_DECISION_ALREADY_REVERSED/);

    // وبعد الإبطال يمكن تسجيل قرار جديد يخلف الأصل صراحةً.
    const { data: correctedId, error: reErr } = await ownerA.client.rpc(
      "record_tax_decision_for_due",
      { p_due_id: dueA },
    );
    expect(reErr, `re-record failed: ${reErr?.message}`).toBeNull();
    expect(correctedId).not.toBe(original!.id);

    const { data: corrected } = await admin
      .from("tax_decisions")
      .select("replaces_decision_id")
      .eq("id", correctedId as unknown as string)
      .single();
    expect(corrected!.replaces_decision_id, "القرار الجديد يخلف الأصل").toBe(original!.id);

    // ثلاثة صفوف: الأصل، العكسي، المصحَّح — سلسلة لا استبدال.
    const { count } = await admin
      .from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("source_id", dueA);
    expect(count).toBe(3);
  });

  it("خلافة قاعدة لا تختم قرارًا خارج نطاقها", async () => {
    const { data: activeDecision } = await admin
      .from("tax_decisions")
      .select("tax_rule_version_id")
      .eq("source_id", dueA)
      .not("replaces_decision_id", "is", null)
      .single();

    // تشريع جديد يبدأ بعد تاريخ إصدار المستحق.
    const { data: newRuleId, error } = await platformAdmin.client.rpc("supersede_tax_rule", {
      p_rule_id: activeDecision!.tax_rule_version_id as string,
      p_effective_from: "2026-06-01",
      p_tax_treatment: "EXEMPT",
      p_vat_rate: 0,
      p_e_document_type: "BY_CUSTOMER_TYPE",
      p_issuer_scope: SCOPE,
    });
    expect(error, `supersede failed: ${error?.message}`).toBeNull();
    createdRuleIds.push(newRuleId as unknown as string);

    // مستحق جديد بتاريخ إصدار قديم يلتقط قاعدة فترته هو، لا قاعدة اليوم.
    const { data: oldDue } = await admin
      .from("dues")
      .insert({
        organization_id: orgA,
        property_id: propertyA,
        unit_id: unitA,
        due_type_id: dueTypeA,
        receivable_account_id: (
          await admin
            .from("chart_of_accounts")
            .select("id").eq("organization_id", orgA).eq("code", "1200").single()
        ).data!.id,
        amount: 700,
        issue_date: "2026-02-01",
        due_date: "2026-03-01",
        status: "ISSUED",
        description: "E2E old issue date",
      } as never)
      .select("id")
      .single();

    const { data: oldDecisionId } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: oldDue!.id,
    });
    const { data: oldDecision } = await admin
      .from("tax_decisions")
      .select("transaction_date, tax_decision_snapshot")
      .eq("id", oldDecisionId as unknown as string)
      .single();

    const snap = oldDecision!.tax_decision_snapshot as Record<string, unknown>;
    expect(oldDecision!.transaction_date).toBe("2026-02-01");
    expect(snap.tax_treatment, "قاعدة الفترة لا قاعدة اليوم").toBe("TAXABLE");
    expect(Number(snap.vat_rate)).toBe(14);

    // ومستحق بتاريخ بعد الخلافة يلتقط الجديدة.
    const { data: newDue } = await admin
      .from("dues")
      .insert({
        organization_id: orgA,
        property_id: propertyA,
        unit_id: unitA,
        due_type_id: dueTypeA,
        receivable_account_id: (
          await admin
            .from("chart_of_accounts")
            .select("id").eq("organization_id", orgA).eq("code", "1200").single()
        ).data!.id,
        amount: 700,
        issue_date: "2026-08-01",
        due_date: "2026-09-01",
        status: "ISSUED",
        description: "E2E new issue date",
      } as never)
      .select("id")
      .single();

    const { data: newDecisionId } = await ownerA.client.rpc("record_tax_decision_for_due", {
      p_due_id: newDue!.id,
    });
    const { data: newDecision } = await admin
      .from("tax_decisions")
      .select("tax_decision_snapshot")
      .eq("id", newDecisionId as unknown as string)
      .single();
    expect((newDecision!.tax_decision_snapshot as Record<string, unknown>).tax_treatment).toBe(
      "EXEMPT",
    );
  });

  it("الربط غير المعتمد يمنع القرار، والقرار يمنع نفسه عند غياب قاعدة", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id")
      .eq("organization_id", orgB)
      .single();
    await ownerB.client.rpc("revoke_due_type_revenue_nature_approval", {
      p_mapping_id: mapping!.id,
      p_reason: "اختبار الحاجز",
    });

    const { error } = await ownerB.client.rpc("record_tax_decision_for_due", { p_due_id: dueB });
    expect(error, "ربط غير معتمد يحجب").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);

    const { count } = await admin
      .from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB);
    expect(count ?? 0).toBe(0);
  });

  it("مصدر غير مدعوم لا يمكن ختمه أصلًا", async () => {
    // العمولة وفاتورة المورد ليستا مصدري إيراد؛ القيد يرفض ختمهما بدل أن يوجد
    // adapter يخترع لهما معنى إيراديًا.
    const { error } = await admin.from("tax_decisions").insert({
      organization_id: orgA,
      source_type: "SUPPLIER_INVOICE",
      source_id: "00000000-0000-0000-0000-0000000000c1",
      revenue_nature: NATURE,
      jurisdiction: "EG",
      transaction_date: ISSUE_DATE,
      tax_rule_version_id: createdRuleIds[0],
      tax_rule_hash: "x",
      tax_decision_snapshot: {},
    } as never);
    expect(error, "مصدر غير إيرادي يجب أن يُرفض").not.toBeNull();
    expect(error!.code).toBe("23514");
  });
});
