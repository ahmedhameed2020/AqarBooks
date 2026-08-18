/**
 * بروفة دفتر تشغيل الطيار — على مؤسسة اختبارية تُحذف بعدها.
 *
 * **ليست جزءًا من `npm run test:all` عمدًا.** هذه ليست تغطية اختبارية — التغطية
 * في `tax-enforcement.integration.test.ts` — بل تنفيذ للخطوات السبع **بترتيبها**
 * كما ينفّذها مشغّل حقيقي، عبر الـRPCs نفسها وبجلسات مُصادَقة لا بمفتاح الخدمة،
 * للتحقق من أن الدفتر يعمل كتسلسل لا كخطوات معزولة.
 *
 * تُشغَّل يدويًا:
 *     npx vitest run tests/pilot-rehearsal.manual.test.ts
 *
 * والتقرير يُكتب إلى `test-results/pilot-rehearsal-report.txt` لا إلى الطرفية:
 * إعداد vitest في هذا المستودع يكتم `console.log`، فتقرير يُطبع هناك لا يصل.
 *
 * وهي نفسها المسخّرة التي تُعاد عند الطيار الحقيقي بعد وصول كتلة الاعتماد،
 * باستبدال القواعد الوهمية أدناه بالقواعد المعتمدة ومعرّف مؤسسة الـsandbox.
 *
 * **القواعد المُنشأة هنا وهمية ومُعلَّمة، وتُحذف في النهاية.** جدول القواعد عالمي
 * لا يخص مؤسسة، فبقاء واحدة منه يلوّث الإنتاج — لذلك التنظيف يجمع أخطاءه
 * ويفحصها مرة واحدة بدل أن ينهار عند أولها.
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

const SCOPE = `PILOT_REHEARSAL_${Date.now()}`;
const NATURE = "REPLACEMENT_CARD_FEE";
const RULE_FROM = "2026-01-01";

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const createdRuleIds: string[] = [];

let org: {
  id: string;
  propertyId: string;
  unitId: string;
  dueTypeId: string;
  receivableId: string;
};
let owner: Actor;
let platformAdmin: Actor;
let ruleId: string;
let mappingId: string;

const report: string[] = [];
const step = (n: string, msg: string) => {
  report.push(`  [${n}] ${msg}`);
};

async function makeUser(label: string): Promise<Actor> {
  const email = `pilot-${label.toLowerCase()}-${Date.now()}-${Math.floor(
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

beforeAll(async () => {
  platformAdmin = await makeUser("PlatformAdmin");
  const { data: superRole } = await admin.from("roles")
    .select("id").eq("key", "PLATFORM_SUPER_ADMIN").is("organization_id", null).single();
  await admin.from("user_role_assignments")
    .insert({ user_id: platformAdmin.userId, role_id: superRole!.id, organization_id: null });

  const { data: orgRow, error: orgErr } = await admin.from("organizations").insert({
    name: `PILOT Rehearsal ${Date.now()}`,
    slug: `pilot-rehearsal-${Date.now()}`,
    default_currency: "EGP",
    status: "ACTIVE",
    // الهوية القانونية والاختصاص — شرطا الجاهزية، ويُسجَّلان كما يسجّلهما مشغّل.
    tax_id: "100-PILOT-001",
    tax_jurisdiction: "SA",
  } as never).select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = orgRow!.id as string;
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
  // حساب ضريبة المخرجات: التزام نشط غير تجميعي. الـfixtures تنشئ دليلها يدويًا
  // بلا استنساخ القالب، فلا يصلها الحساب القياسي 2300 تلقائيًا.
  await admin.from("chart_of_accounts").insert({
    organization_id: orgId, code: "2300", name_ar: "ضريبة مخرجات مستحقة",
    name_en: "Output Tax Payable", category: "LIABILITY", normal_balance: "CREDIT",
  } as never);

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "PILOT Property", code: `PILOT-${Date.now()}`,
    timezone: "Africa/Cairo", property_type: "building",
  } as never).select("id").single();
  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: property!.id, code: `PU-${Date.now()}`,
  } as never).select("id").single();
  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue!.id,
    name_ar: "رسوم إدارة", name_en: "Management Fee", is_active: true,
  } as never).select("id").single();

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "PILOT FY", start_date: "2025-01-01",
    end_date: "2026-12-31", status: "OPEN",
  } as never).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "PILOT Period", start_date: "2025-01-01", end_date: "2026-12-31", status: "OPEN",
  } as never);

  owner = await makeUser("Owner");
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: owner.userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: owner.userId, role_id: role!.id, organization_id: orgId });

  org = {
    id: orgId,
    propertyId: property!.id as string,
    unitId: unit!.id as string,
    dueTypeId: dueType!.id as string,
    receivableId: receivable!.id as string,
  };
}, 180_000);

afterAll(async () => {
  const failures: string[] = [];
  for (const orgId of createdOrgIds) {
    await admin.from("tax_decisions").delete().eq("organization_id", orgId)
      .not("reverses_decision_id", "is", null);
    await admin.from("tax_decisions").delete().eq("organization_id", orgId);
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("dues").delete().eq("organization_id", orgId);
    const { data: entries } = await admin.from("journal_entries")
      .select("id").eq("organization_id", orgId);
    for (const e of entries ?? []) {
      await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
    }
    await admin.from("journal_entries").delete().eq("organization_id", orgId);
    await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
    await admin.from("fiscal_years").delete().eq("organization_id", orgId);
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

  // جدول القواعد عالمي: بقاء واحدة يلوّث الإنتاج.
  const { count } = await admin.from("tax_rule_versions")
    .select("id", { count: "exact", head: true }).eq("issuer_scope", SCOPE);
  if ((count ?? 0) > 0) failures.push(`${count} rehearsal rules left behind`);

  report.push(`  [تنظيف] ${failures.length === 0 ? "لا بقايا" : failures.join(" | ")}`);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/pilot-rehearsal-report.txt",
    [
      "===== تقرير بروفة دفتر تشغيل الطيار =====",
      ...report,
      "=========================",
      "",
    ].join("\n"),
    "utf8",
  );

  expect(failures, `rehearsal left state behind: ${failures.join(" | ")}`).toEqual([]);
}, 180_000);

describe("بروفة دفتر تشغيل الطيار", () => {
  it("١) إدخال قاعدة معتمدة — مسودة ثم اعتماد، من مشرف المنصة وحده", async () => {
    const { data: draftId, error } = await platformAdmin.client.rpc("create_tax_rule_draft", {
      p_jurisdiction: "SA",
      p_revenue_nature: NATURE,
      p_tax_treatment: "TAXABLE",
      p_vat_rate: 14,
      p_effective_from: RULE_FROM,
      p_e_document_type: "BY_CUSTOMER_TYPE",
      p_issuer_scope: SCOPE,
      p_legal_reference: "بروفة — لا مرجع قانوني حقيقي",
    });
    expect(error, `draft failed: ${error?.message}`).toBeNull();
    ruleId = draftId as unknown as string;
    createdRuleIds.push(ruleId);

    const { error: approveErr } = await platformAdmin.client.rpc("approve_tax_rule", {
      p_rule_id: ruleId,
    });
    expect(approveErr, `approve failed: ${approveErr?.message}`).toBeNull();

    const { data: rule } = await admin.from("tax_rule_versions")
      .select("status, version, rule_hash, approved_by").eq("id", ruleId).single();
    expect(rule!.status).toBe("APPROVED");
    expect(rule!.rule_hash).toHaveLength(64);
    expect(rule!.approved_by).toBe(platformAdmin.userId);
    step("١", `قاعدة معتمدة: ${NATURE} / TAXABLE 14% من ${RULE_FROM} — إصدار ${rule!.version}، بصمة ${(rule!.rule_hash as string).slice(0, 12)}…`);
  });

  it("٢) فحص الجاهزية قبل الربط — يجب أن يسمّي النقص ويمنع التفعيل", async () => {
    const { data: gaps } = await owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: org.id,
    });
    const codes = (gaps as unknown as { gap_code: string }[]).map((g) => g.gap_code);
    expect(codes).toContain("MAPPING_MISSING");

    const { error } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id, p_enabled: true,
    });
    expect(error!.message).toMatch(/TAX_ENFORCEMENT_NOT_READY/);
    step("٢", `الجاهزية ترفض: ${codes.join(", ")} — والتفعيل ممنوع`);
  });

  it("٣) الربط الصريح ثم اعتماده", async () => {
    const { data: id, error } = await owner.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: org.dueTypeId,
      p_revenue_nature: NATURE,
      p_notes: "بروفة — عقد الإدارة",
      p_amount_basis: "GROSS",
    });
    expect(error, `mapping failed: ${error?.message}`).toBeNull();
    mappingId = id as unknown as string;

    const { data: beforeApproval } = await admin.from("due_type_revenue_natures")
      .select("status").eq("id", mappingId).single();
    expect(beforeApproval!.status, "الربط لا يُولد معتمدًا").toBe("REVIEW_REQUIRED");

    const { error: appErr } = await owner.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: mappingId,
    });
    expect(appErr, `approve mapping failed: ${appErr?.message}`).toBeNull();
    step("٣", "الربط أُنشئ REVIEW_REQUIRED ثم اعتُمد صراحةً");
  });

  it("٤) إعادة فحص الجاهزية — يجب أن تعود فارغة", async () => {
    const { data: gaps } = await owner.client.rpc("check_tax_enforcement_readiness", {
      p_organization_id: org.id,
    });
    expect((gaps as unknown as unknown[]).length, "لا نواقص").toBe(0);
    step("٤", "الجاهزية مكتملة — لا نواقص");
  });

  it("٤أ) تقرير أثر الفجوة التاريخية", async () => {
    // مستحق قائم قبل التفعيل — تمامًا كما لدى أي مؤسسة حقيقية.
    const { error: legacyErr } = await admin.from("dues").insert({
      organization_id: org.id, property_id: org.propertyId, unit_id: org.unitId,
      due_type_id: org.dueTypeId, receivable_account_id: org.receivableId,
      amount: 4500, issue_date: "2026-02-01", due_date: "2026-03-01",
      status: "ISSUED", description: "PILOT legacy due",
    } as never);
    expect(legacyErr, `legacy due failed: ${legacyErr?.message}`).toBeNull();

    const { data: cov, error } = await owner.client.rpc("get_tax_decision_coverage", {
      p_organization_id: org.id,
    });
    expect(error, `coverage failed: ${error?.message}`).toBeNull();
    const c = (cov as unknown as {
      total_dues: number; dues_with_decision: number; dues_without_decision: number;
      earliest_undecided_issue_date: string; undecided_amount: number;
    }[])[0];
    expect(Number(c.dues_without_decision)).toBe(1);
    expect(Number(c.undecided_amount)).toBe(4500);
    step("٤أ", `الفجوة: ${c.dues_without_decision} مستحق بلا قرار، من ${c.earliest_undecided_issue_date}، بمبلغ ${c.undecided_amount}`);
  });

  it("٥) التفعيل — مرفوض بلا إقرار وبإقرار خاطئ، مقبول بالعدد الصحيح", async () => {
    const { error: noAck } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id, p_enabled: true,
    });
    expect(noAck!.message).toMatch(/TAX_HISTORICAL_GAP_UNACKNOWLEDGED/);

    const { error: wrongAck } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id, p_enabled: true, p_acknowledged_undecided_dues: 99,
    });
    expect(wrongAck!.message).toMatch(/TAX_HISTORICAL_GAP_UNACKNOWLEDGED/);

    const { error } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id,
      p_enabled: true,
      p_reason: "بروفة الطيار — الفجوة التاريخية مُقَرَّة",
      p_acknowledged_undecided_dues: 1,
    });
    expect(error, `enable failed: ${error?.message}`).toBeNull();

    const { data: o } = await admin.from("organizations")
      .select("tax_enforcement_enabled, tax_enforcement_enabled_by").eq("id", org.id).single();
    expect(o!.tax_enforcement_enabled).toBe(true);
    expect(o!.tax_enforcement_enabled_by).toBe(owner.userId);
    step("٥", "التفعيل رُفض بلا إقرار وبإقرار خاطئ، وقُبل بالعدد الصحيح (1)");
  });

  it("٦) مستحق جديد — المستحق والقيد والقرار معًا، والسجل يوثّقها", async () => {
    const { data, error } = await admin.from("dues").insert({
      organization_id: org.id, property_id: org.propertyId, unit_id: org.unitId,
      due_type_id: org.dueTypeId, receivable_account_id: org.receivableId,
      amount: 1000, issue_date: "2026-06-15", due_date: "2026-07-15",
      status: "ISSUED", description: "PILOT enforced due",
    } as never).select("id");
    expect(error, `enforced due failed: ${error?.message}`).toBeNull();
    const dueId = data![0].id as string;

    const { data: due } = await admin.from("dues")
      .select("journal_entry_id").eq("id", dueId).single();
    expect(due!.journal_entry_id, "القيد أُنشئ").not.toBeNull();

    const { data: decision } = await admin.from("tax_decisions")
      .select("transaction_date, tax_rule_version_id, tax_decision_snapshot")
      .eq("source_id", dueId).single();
    expect(decision!.transaction_date).toBe("2026-06-15");
    expect(decision!.tax_rule_version_id).toBe(ruleId);
    const snap = decision!.tax_decision_snapshot as Record<string, unknown>;
    expect(snap.tax_treatment).toBe("TAXABLE");
    expect(Number(snap.vat_rate)).toBe(14);

    const { data: logs } = await admin.from("platform_audit_logs")
      .select("action").eq("organization_id", org.id).eq("action", "tax_decision.recorded");
    expect(logs!.length).toBeGreaterThan(0);
    step("٦", `المستحق والقيد والقرار معًا — المعالجة ${snap.tax_treatment} ${snap.vat_rate}% بتاريخ ${decision!.transaction_date}، والسجل يوثّقها`);
  });

  it("٦ب) الاسترجاع — تاريخ لا تغطيه قاعدة: لا مستحق ولا قيد ولا قرار", async () => {
    const before = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    const beforeEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    expect(beforeEntries.count ?? 0, "لا بد من قيود سابقة وإلا كان التوكيد فارغًا")
      .toBeGreaterThan(0);

    const { error } = await admin.from("dues").insert({
      organization_id: org.id, property_id: org.propertyId, unit_id: org.unitId,
      due_type_id: org.dueTypeId, receivable_account_id: org.receivableId,
      amount: 800, issue_date: "2025-05-01", due_date: "2025-06-01",
      status: "ISSUED", description: "PILOT out-of-range due",
    } as never);
    expect(error, "خارج نطاق أي قاعدة يجب أن يُرفض").not.toBeNull();
    expect(error!.message).toMatch(/TAX_REVIEW_REQUIRED/);

    const after = await admin.from("dues")
      .select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    const afterEntries = await admin.from("journal_entries")
      .select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    expect(after.count, "لا مستحق").toBe(before.count);
    expect(afterEntries.count, "ولا قيد").toBe(beforeEntries.count);
    step("٦ب", "الاسترجاع صحيح: المستحق والقيد سُحبا معًا عند فشل القرار");
  });

  it("٧) الإيقاف ومراقبة الفجوة", async () => {
    const { error: noReason } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id, p_enabled: false,
    });
    expect(noReason!.message).toMatch(/TAX_ENFORCEMENT_DISABLE_REASON_REQUIRED/);

    const { error } = await owner.client.rpc("set_tax_enforcement", {
      p_organization_id: org.id, p_enabled: false, p_reason: "انتهاء البروفة",
    });
    expect(error, `disable failed: ${error?.message}`).toBeNull();

    const { data: lapses } = await platformAdmin.client.rpc("list_tax_enforcement_lapses");
    const mine = (lapses as unknown as { organization_id: string; disabled_reason: string }[])
      .find((l) => l.organization_id === org.id);
    expect(mine, "المؤسسة تظهر في المراقبة").toBeTruthy();
    expect(mine!.disabled_reason).toBe("انتهاء البروفة");
    step("٧", "الإيقاف رُفض بلا سبب، وسُجِّل بسببه، وظهر في مراقبة الفجوات");
  });
});
