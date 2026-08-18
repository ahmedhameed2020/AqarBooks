/**
 * الإنفاذ الضريبي لكل مؤسسة على حدة.
 *
 * السؤال الذي عجزت المراجعة عن الإجابة عليه — «هل يمنع فشل القرار الترحيل
 * فعلًا؟» — يُجاب هنا، لأن الحاجز صار موصولًا. والوصل **trigger على `dues`** لا
 * ترتيب استدعاءات من طبقة التطبيق: أربعة محركات تُدرج في `dues`، وترتيبٌ يعتمد
 * على التطبيق كان سيترك كل محرك يتذكّر الاستدعاء وحده.
 *
 * الذرية هي جوهر ما يُختبَر هنا: إن فشل القرار، يجب ألا يبقى مستحق ولا قيد.
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

const SCOPE = `E2E_ENF_${Date.now()}`;
const NATURE = "ACCESS_CARD_FEE";

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };
type Org = {
  orgId: string;
  propertyId: string;
  unitId: string;
  dueTypeId: string;
  receivableId: string;
  owner: Actor;
};

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let orgOff: Org;
let orgOn: Org;
let orgOther: Org;
let platformAdmin: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-enf-${label.toLowerCase()}-${Date.now()}-${Math.floor(
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

async function makeOrg(label: string): Promise<Org> {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: `E2E TaxEnf ${label} ${Date.now()}`,
      slug: `e2e-taxenf-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_id: `100-000-${label}`,
      tax_jurisdiction: "SA",
    } as never)
    .select("id").single();
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
    organization_id: orgId, name: `P ${label}`, code: `E2E-ENF-${label}-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: property!.id, code: `U-${label}-${Date.now()}`,
  } as never).select("id").single();
  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "رسوم / x", name_en: "Fee / x", is_active: true,
  } as never).select("id").single();

  // فترة مالية مفتوحة تغطي 2025 و2026: بدونها لا يرحّل post_due_to_ledger شيئًا،
  // فيصبح توكيد «ولا قيد» فارغًا — 0 قبل و0 بعد. أول نسخة من هذا الملف وقعت في
  // ذلك بالضبط ومرّت 9/9 وهي لا تُثبت الذرية إطلاقًا.
  const { data: fy, error: fyErr } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "E2E FY", start_date: "2025-01-01",
    end_date: "2026-12-31", status: "OPEN",
  } as never).select("id").single();
  expect(fyErr, `fiscal year insert failed: ${fyErr?.message}`).toBeNull();
  const { error: fpErr } = await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "E2E Period", start_date: "2025-01-01", end_date: "2026-12-31", status: "OPEN",
  } as never);
  expect(fpErr, `fiscal period insert failed: ${fpErr?.message}`).toBeNull();

  const owner = await makeUser(label);
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: owner.userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: owner.userId, role_id: role!.id, organization_id: orgId });

  return {
    orgId,
    propertyId: property!.id as string,
    unitId: unit!.id as string,
    dueTypeId: dueType!.id as string,
    receivableId: receivable!.id as string,
    owner,
  };
}

/** يُدرج مستحقًا كما تفعل محركات المستحقات الأربعة. */
async function insertDue(org: Org, issueDate: string, amount = 1000) {
  return admin
    .from("dues")
    .insert({
      organization_id: org.orgId,
      property_id: org.propertyId,
      unit_id: org.unitId,
      due_type_id: org.dueTypeId,
      receivable_account_id: org.receivableId,
      amount,
      issue_date: issueDate,
      due_date: issueDate,
      status: "ISSUED",
      description: `E2E enforcement ${issueDate}`,
    } as never)
    .select("id");
}

async function approveMapping(org: Org) {
  const { data: mappingId } = await org.owner.client.rpc("set_due_type_revenue_nature", {
    p_due_type_id: org.dueTypeId, p_revenue_nature: NATURE,
  });
  await org.owner.client.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: mappingId as unknown as string,
  });
}

async function seedRule(from: string, treatment: string, rate: number | null, version: number) {
  const { data, error } = await admin.from("tax_rule_versions").insert({
    jurisdiction: "SA", revenue_nature: NATURE, tax_treatment: treatment, vat_rate: rate,
    effective_from: from, e_document_type: "BY_CUSTOMER_TYPE", issuer_scope: SCOPE,
    version, rule_hash: "", status: "APPROVED",
    approved_by: platformAdmin.userId, approved_at: new Date().toISOString(),
  } as never).select("id").single();
  expect(error, `rule seed failed: ${error?.message}`).toBeNull();
  createdRuleIds.push(data!.id as string);
  return data!.id as string;
}

beforeAll(async () => {
  platformAdmin = await makeUser("PlatformAdmin");
  const { data: superRole } = await admin.from("roles")
    .select("id").eq("key", "PLATFORM_SUPER_ADMIN").is("organization_id", null).single();
  await admin.from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  orgOff = await makeOrg("Off");
  orgOn = await makeOrg("On");
  orgOther = await makeOrg("Other");
}, 180_000);

afterAll(async () => {
  // التنظيف لا يتوقف عند أول فشل. النسخة الأولى وضعت `expect` داخل الحلقة،
  // فلمّا رفض حارس الحسابات الحذف انهار ما بعده — ومنه إزالة القواعد — فبقيت
  // قواعد عالمية أسقطت التشغيل التالي بأخطاء لا علاقة لها بالمنتج. تُجمع
  // الأخطاء وتُفحص مرة واحدة في النهاية.
  const failures: string[] = [];
  const attempt = async (what: string, run: () => Promise<{ error: unknown }>) => {
    const { error } = await run();
    if (error) failures.push(`${what}: ${(error as { message?: string }).message}`);
  };

  for (const orgId of createdOrgIds) {
    await admin.from("tax_decisions").delete().eq("organization_id", orgId)
      .not("reverses_decision_id", "is", null);
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("dues").delete().eq("organization_id", orgId);
    const { data: entries } = await admin.from("journal_entries")
      .select("id").eq("organization_id", orgId);
    for (const entry of entries ?? []) {
      await admin.from("journal_entry_lines").delete().eq("journal_entry_id", entry.id);
    }
    await admin.from("journal_entries").delete().eq("organization_id", orgId);
    await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
    await admin.from("fiscal_years").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("units").delete().eq("organization_id", orgId);
    await admin.from("properties").delete().eq("organization_id", orgId);
    await admin.from("due_types").delete().eq("organization_id", orgId);
    // prevent_delete_used_coa يقرأ العلم لا الاستخدام الفعلي، فيُرفع أولًا.
    await admin.from("chart_of_accounts")
      .update({ is_used: false } as never).eq("organization_id", orgId);
    await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
    await attempt(`org ${orgId}`, () =>
      admin.from("organizations").delete().eq("id", orgId) as never);
  }

  if (createdRuleIds.length) {
    await attempt("rules", () =>
      admin.from("tax_rule_versions").delete().in("id", createdRuleIds) as never);
  }
  for (const userId of createdUserIds) await admin.auth.admin.deleteUser(userId);

  const { count } = await admin.from("tax_rule_versions")
    .select("id", { count: "exact", head: true }).eq("issuer_scope", SCOPE);
  if ((count ?? 0) > 0) failures.push(`${count} fixture rules left behind`);

  expect(failures, `teardown left state behind: ${failures.join(" | ")}`).toEqual([]);
}, 180_000);

describe("الإنفاذ الضريبي لكل مؤسسة", () => {
  it("الإنفاذ مطفأ: السلوك القديم محفوظ بلا أي قرار مطلوب", async () => {
    // لا ربط ولا قاعدة ولا شيء — ومع ذلك يجب أن يمر كما كان يمر قبل هذا العمل
    // كله، وإلا عطّلنا 1938 مؤسسة.
    const { data, error } = await insertDue(orgOff, "2026-06-01");
    expect(error, `المطفأ يجب أن يمر: ${error?.message}`).toBeNull();
    expect(data![0].id).toBeTruthy();

    const { count } = await admin.from("tax_decisions")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOff.orgId);
    expect(count ?? 0, "ولا يُطلب قرار").toBe(0);
  });

  it("التفعيل يُرفض عند عدم الجاهزية، ويعيد قائمة النواقص لا حالة جزئية", async () => {
    const { data: gaps, error: readyErr } = await orgOn.owner.client.rpc(
      "check_tax_enforcement_readiness",
      { p_organization_id: orgOn.orgId },
    );
    expect(readyErr, `readiness failed: ${readyErr?.message}`).toBeNull();
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);
    expect(codes, "الربط ناقص").toContain("MAPPING_MISSING");

    const { error } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: true,
    });
    expect(error, "التفعيل الجزئي مرفوض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_ENFORCEMENT_NOT_READY/);
    expect(error!.message, "الرسالة تسمّي النقص").toMatch(/MAPPING_MISSING/);

    const { data: org } = await admin.from("organizations")
      .select("tax_enforcement_enabled").eq("id", orgOn.orgId).single();
    expect(org!.tax_enforcement_enabled, "لا تفعيل جزئي").toBe(false);
  });

  it("الربط وحده لا يكفي: نقص القاعدة يمنع التفعيل أيضًا", async () => {
    await approveMapping(orgOn);

    const { data: gaps } = await orgOn.owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: orgOn.orgId,
    });
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);
    expect(codes, "الربط اكتمل").not.toContain("MAPPING_MISSING");
    expect(codes, "والقاعدة ما تزال ناقصة").toContain("RULE_MISSING");

    const { error } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: true,
    });
    expect(error!.message).toMatch(/RULE_MISSING/);
  });

  it("اكتمال الجاهزية يسمح بالتفعيل، ويُسجَّل بفاعله ووقته", async () => {
    await seedRule("2026-01-01", "TAXABLE", 14, 1);

    const { data: gaps } = await orgOn.owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: orgOn.orgId,
    });
    expect((gaps as unknown as unknown[]).length, "لا نواقص").toBe(0);

    const { error } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: true, p_reason: "جاهزية مكتملة",
    });
    expect(error, `enable failed: ${error?.message}`).toBeNull();

    const { data: org } = await admin.from("organizations")
      .select("tax_enforcement_enabled, tax_enforcement_enabled_at, tax_enforcement_enabled_by")
      .eq("id", orgOn.orgId).single();
    expect(org!.tax_enforcement_enabled).toBe(true);
    expect(org!.tax_enforcement_enabled_at).not.toBeNull();
    expect(org!.tax_enforcement_enabled_by).toBe(orgOn.owner.userId);

    const { data: logs } = await admin.from("platform_audit_logs")
      .select("reason, safe_change_summary")
      .eq("organization_id", orgOn.orgId).eq("action", "tax_enforcement.enabled");
    expect(logs).toHaveLength(1);
    expect(logs![0].reason).toBe("جاهزية مكتملة");
  });

  it("الفجوة التاريخية تمنع التفعيل حتى تُقَر بعددها الصحيح", async () => {
    // مؤسسة جاهزة تمامًا لكن لديها مستحقات قائمة بلا قرار: التفعيل يعمل إلى
    // الأمام فقط، فقبوله ضمنًا يعني تمرير فجوة لم يُنظر فيها.
    await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: false, p_reason: "تهيئة اختبار الفجوة",
    });
    const { error: legacyErr } = await insertDue(orgOn, "2026-05-01", 250);
    expect(legacyErr, `legacy due insert failed: ${legacyErr?.message}`).toBeNull();

    const { data: coverage, error: covErr } = await orgOn.owner.client.rpc(
      "get_tax_decision_coverage",
      { p_organization_id: orgOn.orgId },
    );
    expect(covErr, `coverage failed: ${covErr?.message}`).toBeNull();
    const cov = (coverage as unknown as {
      dues_without_decision: number;
      undecided_amount: number;
      earliest_undecided_issue_date: string | null;
    }[])[0];
    expect(Number(cov.dues_without_decision), "المستحق القديم بلا قرار").toBeGreaterThan(0);
    expect(Number(cov.undecided_amount), "والمبلغ محسوب لا مجرد عدد").toBeGreaterThan(0);

    // بلا إقرار: مرفوض، والرسالة تحمل العدد والمدى والمبلغ.
    const { error: unack } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: true,
    });
    expect(unack, "التفعيل فوق فجوة غير مُقَرَّة مرفوض").not.toBeNull();
    expect(unack!.message).toMatch(/TAX_HISTORICAL_GAP_UNACKNOWLEDGED/);

    // وبعدد خاطئ: مرفوض أيضًا — الإقرار لا يُمرَّر بالتخمين.
    const { error: wrong } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId,
      p_enabled: true,
      p_acknowledged_undecided_dues: Number(cov.dues_without_decision) + 1,
    });
    expect(wrong!.message).toMatch(/TAX_HISTORICAL_GAP_UNACKNOWLEDGED/);

    // وبالعدد الصحيح: يُقبل، والفجوة المقبولة تُختم في السجل.
    const { error: ok } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId,
      p_enabled: true,
      p_reason: "طيار — الفجوة التاريخية مُقَرَّة",
      p_acknowledged_undecided_dues: Number(cov.dues_without_decision),
    });
    expect(ok, `acknowledged enable failed: ${ok?.message}`).toBeNull();

    const { data: logs } = await admin.from("platform_audit_logs")
      .select("safe_change_summary")
      .eq("organization_id", orgOn.orgId).eq("action", "tax_enforcement.enabled")
      .order("created_at", { ascending: false }).limit(1);
    const summary = logs![0].safe_change_summary as Record<string, unknown>;
    expect(Number(summary.historical_undecided_dues)).toBe(Number(cov.dues_without_decision));
    expect(summary.historical_undecided_from, "المدى مختوم لحظة القبول").not.toBeNull();
  });

  it("الترحيل الناجح يُظهر المستحق والقيد والقرار معًا", async () => {
    const { data, error } = await insertDue(orgOn, "2026-06-15");
    expect(error, `insert failed: ${error?.message}`).toBeNull();
    const dueId = data![0].id as string;

    const { data: due } = await admin.from("dues")
      .select("id, journal_entry_id").eq("id", dueId).single();
    expect(due!.id).toBe(dueId);
    // القيد موجود فعلًا — وهذا ما يجعل توكيد سحبه في اختبار الذرية ذا معنى.
    expect(due!.journal_entry_id, "الترحيل أنشأ قيدًا").not.toBeNull();

    const { data: decision } = await admin.from("tax_decisions")
      .select("source_id, transaction_date, tax_decision_snapshot")
      .eq("source_id", dueId).single();
    expect(decision!.transaction_date, "التاريخ من المستحق").toBe("2026-06-15");
    expect(
      (decision!.tax_decision_snapshot as Record<string, unknown>).tax_treatment,
    ).toBe("TAXABLE");
  });

  it("نقص القاعدة لتاريخ المستحق يُفشل الإنشاء: لا مستحق ولا قيد ولا قرار", async () => {
    const before = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);
    const beforeEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);

    // القاعدة تبدأ 2026-01-01؛ هذا المستحق أقدم منها.
    const { data, error } = await insertDue(orgOn, "2025-06-01");
    expect(error, "غياب قاعدة سارية يجب أن يُفشل الإنشاء").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);
    expect(data ?? [], "لا صف يعود").toEqual([]);

    const after = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);
    const afterEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);

    // هذا هو الاختبار الفعلي للذرية: القيد يُنشأ قبل القرار في نفس المعاملة،
    // ففشل القرار يجب أن يسحب القيد معه لا أن يتركه يتيمًا. والتوكيد ذو معنى
    // فقط لأن الفترة المالية مفتوحة، فالنجاح ينتج قيدًا فعليًا.
    expect(beforeEntries.count ?? 0, "لا بد من قيود سابقة وإلا كان التوكيد فارغًا")
      .toBeGreaterThan(0);
    expect(after.count, "لا مستحق").toBe(before.count);
    expect(afterEntries.count, "ولا قيد").toBe(beforeEntries.count);

    const { count: orphan } = await admin.from("tax_decisions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgOn.orgId).eq("transaction_date", "2025-06-01");
    expect(orphan ?? 0, "ولا قرار يتيم").toBe(0);
  });

  it("سحب اعتماد الربط يوقف الترحيل فورًا، ولا يُترك أثر جزئي", async () => {
    const { data: mapping } = await admin.from("due_type_revenue_natures")
      .select("id").eq("organization_id", orgOn.orgId).single();
    await orgOn.owner.client.rpc("revoke_due_type_revenue_nature_approval", {
      p_mapping_id: mapping!.id, p_reason: "مراجعة إفادة المستشار",
    });

    const beforeDues = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);

    const { error } = await insertDue(orgOn, "2026-07-01");
    expect(error, "ربط غير معتمد يوقف الترحيل").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);

    const afterDues = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOn.orgId);
    expect(afterDues.count).toBe(beforeDues.count);

    // ويُعاد الاعتماد حتى لا يورّث هذا الاختبار حالته لما بعده.
    await orgOn.owner.client.rpc("approve_due_type_revenue_nature", { p_mapping_id: mapping!.id });
  });

  it("تفعيل مؤسسة لا يمسّ غيرها", async () => {
    const { data: otherOrg } = await admin.from("organizations")
      .select("tax_enforcement_enabled").eq("id", orgOther.orgId).single();
    expect(otherOrg!.tax_enforcement_enabled, "الأخرى ما تزال مطفأة").toBe(false);

    // ومستحقاتها تمر بلا ربط ولا قاعدة رغم أن A مفعَّلة.
    const { error } = await insertDue(orgOther, "2026-06-01");
    expect(error, `الأخرى غير متأثرة: ${error?.message}`).toBeNull();

    const { count } = await admin.from("tax_decisions")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgOther.orgId);
    expect(count ?? 0).toBe(0);

    // ولا يستطيع مالكها تفعيل الإنفاذ لمؤسسة أخرى.
    const { error: crossErr } = await orgOther.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: false,
    });
    expect(crossErr, "التفعيل عبر المؤسسات مرفوض").not.toBeNull();
    expect(crossErr!.message).toMatch(/FORBIDDEN_TAX_ENFORCEMENT/);
  });

  it("الإيقاف مخرج طوارئ لا يُستعمل صامتًا: السبب إلزامي والأثر يبقى مرئيًا", async () => {
    // مخرج الطوارئ يبقى مفتوحًا، لكن استعماله بلا سبب مرفوض — الفجوة التي يفتحها
    // تُرحَّل فيها مستحقات بلا قرار ضريبي.
    const { error: noReason } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: false,
    });
    expect(noReason, "الإيقاف بلا سبب مرفوض").not.toBeNull();
    expect(noReason!.message).toMatch(/TAX_ENFORCEMENT_DISABLE_REASON_REQUIRED/);

    const { error } = await orgOn.owner.client.rpc("set_tax_enforcement", {
      p_organization_id: orgOn.orgId, p_enabled: false, p_reason: "إيقاف مؤقت",
    });
    expect(error, `disable failed: ${error?.message}`).toBeNull();

    const { data: org } = await admin.from("organizations")
      .select(
        "tax_enforcement_enabled, tax_enforcement_enabled_at, tax_enforcement_disabled_at, tax_enforcement_disabled_by, tax_enforcement_disabled_reason",
      )
      .eq("id", orgOn.orgId).single();
    expect(org!.tax_enforcement_enabled).toBe(false);
    // النسخة الأولى كانت تمسح enabled_at عند الإيقاف، فلا يبقى على الصف أثر أن
    // الإنفاذ كان مفعَّلًا يومًا — وتعمى المراقبة عن الفجوة تمامًا.
    expect(org!.tax_enforcement_enabled_at, "أثر التفعيل السابق يبقى").not.toBeNull();
    expect(org!.tax_enforcement_disabled_at).not.toBeNull();
    expect(org!.tax_enforcement_disabled_by).toBe(orgOn.owner.userId);
    expect(org!.tax_enforcement_disabled_reason).toBe("إيقاف مؤقت");

    // آخر سجل إيقاف، لا «سجل واحد»: اختبارات سابقة في هذا الملف تُوقف الإنفاذ
    // أيضًا، وتوقيع عدد ثابت يربط الاختبار بترتيب غيره.
    const { data: logs } = await admin.from("platform_audit_logs")
      .select("reason").eq("organization_id", orgOn.orgId).eq("action", "tax_enforcement.disabled")
      .order("created_at", { ascending: false }).limit(1);
    expect(logs![0].reason).toBe("إيقاف مؤقت");

    // وبعد الإيقاف يمر مستحق كان سيُرفض قبل قليل.
    const { error: passErr } = await insertDue(orgOn, "2025-06-01");
    expect(passErr, `المطفأ يمر: ${passErr?.message}`).toBeNull();
  });

  it("المراقبة تقيس أثر الفجوة لا مجرد وقوعها", async () => {
    const { data, error } = await platformAdmin.client.rpc("list_tax_enforcement_lapses");
    expect(error, `lapses failed: ${error?.message}`).toBeNull();

    const rows = data as unknown as {
      organization_id: string;
      disabled_reason: string | null;
      dues_without_decision: number;
    }[];
    const mine = rows.find((r) => r.organization_id === orgOn.orgId);
    expect(mine, "المؤسسة التي أُوقف إنفاذها تظهر").toBeTruthy();
    expect(mine!.disabled_reason).toBe("إيقاف مؤقت");

    // العدد يُقاس مقابل حساب مستقل لا مقابل رقم مكتوب باليد: الرقم الثابت يربط
    // الاختبار بترتيب ما قبله، والحساب المستقل يثبت أن الدالة تقيس فعلًا.
    const { data: org } = await admin.from("organizations")
      .select("tax_enforcement_disabled_at").eq("id", orgOn.orgId).single();
    const { data: sinceDisable } = await admin.from("dues")
      .select("id").eq("organization_id", orgOn.orgId).neq("status", "VOID")
      .gte("created_at", org!.tax_enforcement_disabled_at as string);
    const { data: decided } = await admin.from("tax_decisions")
      .select("source_id").eq("organization_id", orgOn.orgId);
    const decidedIds = new Set((decided ?? []).map((d) => d.source_id));
    const expected = (sinceDisable ?? []).filter((d) => !decidedIds.has(d.id)).length;

    expect(expected, "لا بد من فجوة فعلية وإلا كان التوكيد فارغًا").toBeGreaterThan(0);
    expect(Number(mine!.dues_without_decision), "أثر الفجوة محسوب").toBe(expected);

    // ومحجوبة عن غير مشرف المنصة.
    const { error: forbidden } = await orgOn.owner.client.rpc("list_tax_enforcement_lapses");
    expect(forbidden, "المراقبة لمشرف المنصة وحده").not.toBeNull();
    expect(forbidden!.message).toMatch(/FORBIDDEN_TAX_ENFORCEMENT/);
  });
});
