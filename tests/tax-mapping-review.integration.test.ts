/**
 * شاشة مراجعة ربط أنواع المستحقات — الطبقة الخلفية.
 *
 * ما يُثبت هنا ليس أن الشاشة تعرض، بل أن الصلاحيات والعزل والانتقالات وسجل
 * التدقيق تصمد أمام محاولة تجاوز. الشاشة قد تُخفي زرًا؛ ذلك ليس حدًا أمنيًا،
 * فكل اختبار هنا يخاطب الـRPC مباشرةً كما يفعل أي عميل غير الواجهة.
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

type Actor = { userId: string; client: ReturnType<typeof createClient<Database>> };

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

let orgA: string;
let orgB: string;
let dueTypeA: string;
let dueTypeA2: string;
let dueTypeB: string;
let ownerA: Actor;
let viewerA: Actor;
let ownerB: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `e2e-tmr-${label.toLowerCase()}-${Date.now()}-${Math.floor(
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

async function assignRole(orgId: string, actor: Actor, roleKey: string) {
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  const { data: role, error } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", roleKey)
    .single();
  expect(error, `role ${roleKey} missing: ${error?.message}`).toBeNull();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: actor.userId, role_id: role!.id, organization_id: orgId });
}

async function makeDueType(orgId: string, accountId: string, name: string) {
  const { data, error } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: accountId,
      name_ar: name,
      name_en: name,
      is_active: true,
    } as never)
    .select("id")
    .single();
  expect(error, `due_type insert failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function makeOrg(label: string) {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: `E2E TaxMapReview ${label} ${Date.now()}`,
      slug: `e2e-tmr-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
    } as never)
    .select("id")
    .single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const orgId = org!.id as string;
  createdOrgIds.push(orgId);

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

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

  return { orgId, accountId: account!.id as string };
}

beforeAll(async () => {
  const a = await makeOrg("A");
  orgA = a.orgId;
  // اسمان بلا أي دلالة ضريبية: لو اشتُقّ تصنيف من الاسم يومًا فهذا ما يكشفه.
  dueTypeA = await makeDueType(orgA, a.accountId, "Fee / x");
  dueTypeA2 = await makeDueType(orgA, a.accountId, "Dues / a");
  ownerA = await makeUser("OwnerA");
  await assignRole(orgA, ownerA, "TENANT_OWNER");
  viewerA = await makeUser("ViewerA");
  await assignRole(orgA, viewerA, "VIEWER");

  const b = await makeOrg("B");
  orgB = b.orgId;
  dueTypeB = await makeDueType(orgB, b.accountId, "Fee / y");
  ownerB = await makeUser("OwnerB");
  await assignRole(orgB, ownerB, "TENANT_OWNER");
}, 120_000);

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}, 120_000);

describe("مراجعة ربط أنواع المستحقات", () => {
  it("تُدرج الأنواع غير المربوطة صراحةً بحالة REVIEW_REQUIRED", async () => {
    const { data, error } = await ownerA.client.rpc("list_due_type_tax_mappings", {
      p_organization_id: orgA,
    });
    expect(error, `list failed: ${error?.message}`).toBeNull();

    const rows = data as unknown as { due_type_id: string; status: string; mapping_id: string | null }[];
    expect(rows).toHaveLength(2);
    // الغياب من القائمة يُقرأ «لا شيء مطلوب» — وهو عكس الحقيقة.
    for (const row of rows) {
      expect(row.status).toBe("REVIEW_REQUIRED");
      expect(row.mapping_id).toBeNull();
    }
  });

  it("تمنع الاطلاع عمّن لا يملك صلاحية، ولا تكتفي بإخفاء الشاشة", async () => {
    const { error } = await viewerA.client.rpc("list_due_type_tax_mappings", {
      p_organization_id: orgA,
    });
    expect(error, "VIEWER لا يملك finance.tax_mapping.read").not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);
  });

  it("تمنع القارئ المجرّد من الربط أو الاعتماد", async () => {
    const { error } = await viewerA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: "MANAGEMENT_FEE",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    const { count } = await admin
      .from("due_type_revenue_natures")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA);
    expect(count ?? 0, "لا يُنشأ ربط من محاولة مرفوضة").toBe(0);
  });

  it("الربط يسجّل في سجل التدقيق مع ما قبل وما بعد", async () => {
    const { data: mappingId, error } = await ownerA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: "MANAGEMENT_FEE",
      p_notes: "عقد الإدارة بند ٤",
    });
    expect(error, `set failed: ${error?.message}`).toBeNull();

    const { data: logs } = await admin
      .from("platform_audit_logs")
      .select("actor_id, action, entity_type, entity_id, safe_change_summary")
      .eq("organization_id", orgA)
      .eq("action", "tax_mapping.set");

    expect(logs).toHaveLength(1);
    expect(logs![0].actor_id, "الفاعل مسجَّل").toBe(ownerA.userId);
    expect(logs![0].entity_id).toBe(mappingId);
    const summary = logs![0].safe_change_summary as Record<string, unknown>;
    // `null` صريح لا مفتاح غائب: السجل يقول «لم يكن هناك ربط سابق»، ولا يترك
    // القارئ يخمّن هل غاب المفتاح لأن لا شيء تغيّر أم لأن السجل ناقص.
    expect(summary.revenue_nature_from, "لا شيء قبله").toBeNull();
    expect(summary.revenue_nature_to).toBe("MANAGEMENT_FEE");
    expect(summary.status_to).toBe("REVIEW_REQUIRED");
    expect(summary.approval_revoked).toBe(false);
  });

  it("الاعتماد ينقل الحالة ويسجّل الانتقال", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id")
      .eq("due_type_id", dueTypeA)
      .single();

    const { error } = await ownerA.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: mapping!.id,
    });
    expect(error, `approve failed: ${error?.message}`).toBeNull();

    const { data: row } = await admin
      .from("due_type_revenue_natures")
      .select("status, approved_by, approved_at")
      .eq("id", mapping!.id)
      .single();
    expect(row!.status).toBe("APPROVED");
    expect(row!.approved_by).toBe(ownerA.userId);
    expect(row!.approved_at).not.toBeNull();

    const { data: logs } = await admin
      .from("platform_audit_logs")
      .select("safe_change_summary")
      .eq("organization_id", orgA)
      .eq("action", "tax_mapping.approved");
    expect(logs).toHaveLength(1);
    const summary = logs![0].safe_change_summary as Record<string, unknown>;
    expect(summary.status_from).toBe("REVIEW_REQUIRED");
    expect(summary.status_to).toBe("APPROVED");
  });

  it("الاعتماد المكرر مرفوض حتى لا يُمحى مَن اعتمد أولًا", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id, approved_at")
      .eq("due_type_id", dueTypeA)
      .single();
    const firstApprovedAt = mapping!.approved_at;

    const { error } = await ownerA.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: mapping!.id,
    });
    expect(error, "الاعتماد المكرر ليس عمليةً بلا أثر").not.toBeNull();
    expect(error!.message).toMatch(/TAX_MAPPING_ALREADY_APPROVED/);

    const { data: after } = await admin
      .from("due_type_revenue_natures")
      .select("approved_at")
      .eq("id", mapping!.id)
      .single();
    expect(after!.approved_at, "تاريخ الاعتماد الأصلي لم يُستبدل").toBe(firstApprovedAt);
  });

  it("تغيير الطبيعة يُسقط الاعتماد ويسجّل أنه أُسقط", async () => {
    await ownerA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA,
      p_revenue_nature: "CLEANING_SERVICE",
    });

    const { data: row } = await admin
      .from("due_type_revenue_natures")
      .select("status, revenue_nature, approved_by, approved_at")
      .eq("due_type_id", dueTypeA)
      .single();
    expect(row!.revenue_nature).toBe("CLEANING_SERVICE");
    expect(row!.status).toBe("REVIEW_REQUIRED");
    expect(row!.approved_by).toBeNull();
    expect(row!.approved_at).toBeNull();

    const { data: logs } = await admin
      .from("platform_audit_logs")
      .select("safe_change_summary")
      .eq("organization_id", orgA)
      .eq("action", "tax_mapping.set")
      .order("created_at", { ascending: false })
      .limit(1);
    const summary = logs![0].safe_change_summary as Record<string, unknown>;
    expect(summary.revenue_nature_from).toBe("MANAGEMENT_FEE");
    expect(summary.revenue_nature_to).toBe("CLEANING_SERVICE");
    // السجل يقول إن اعتمادًا سقط، لا مجرد أن شيئًا تغيّر.
    expect(summary.approval_revoked).toBe(true);
  });

  it("سحب الاعتماد مسار صريح بسبب، لا التفاف بإعادة ضبط الطبيعة", async () => {
    const { data: mapping } = await admin
      .from("due_type_revenue_natures")
      .select("id")
      .eq("due_type_id", dueTypeA)
      .single();

    // ليس معتمدًا الآن، فالسحب مرفوض.
    const { error: notApproved } = await ownerA.client.rpc(
      "revoke_due_type_revenue_nature_approval",
      { p_mapping_id: mapping!.id },
    );
    expect(notApproved!.message).toMatch(/TAX_MAPPING_NOT_APPROVED/);

    await ownerA.client.rpc("approve_due_type_revenue_nature", { p_mapping_id: mapping!.id });

    const { error } = await ownerA.client.rpc("revoke_due_type_revenue_nature_approval", {
      p_mapping_id: mapping!.id,
      p_reason: "إفادة المستشار لم تصل",
    });
    expect(error, `revoke failed: ${error?.message}`).toBeNull();

    const { data: row } = await admin
      .from("due_type_revenue_natures")
      .select("status, revenue_nature, approved_at")
      .eq("id", mapping!.id)
      .single();
    expect(row!.status).toBe("REVIEW_REQUIRED");
    expect(row!.approved_at).toBeNull();
    // السحب لا يغيّر الطبيعة — وهذا هو الفرق عن الالتفاف السابق.
    expect(row!.revenue_nature).toBe("CLEANING_SERVICE");

    const { data: logs } = await admin
      .from("platform_audit_logs")
      .select("reason, safe_change_summary")
      .eq("organization_id", orgA)
      .eq("action", "tax_mapping.approval_revoked");
    expect(logs).toHaveLength(1);
    expect(logs![0].reason).toBe("إفادة المستشار لم تصل");
  });

  it("العزل بين المؤسسات محفوظ في القائمة والربط والاعتماد", async () => {
    const { error: listErr } = await ownerB.client.rpc("list_due_type_tax_mappings", {
      p_organization_id: orgA,
    });
    expect(listErr, "لا تُقرأ قائمة مستأجر آخر").not.toBeNull();
    expect(listErr!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    const { error: setErr } = await ownerB.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA2,
      p_revenue_nature: "MANAGEMENT_FEE",
    });
    expect(setErr!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    const { data: mappingA } = await admin
      .from("due_type_revenue_natures")
      .select("id")
      .eq("due_type_id", dueTypeA)
      .single();
    const { error: approveErr } = await ownerB.client.rpc("approve_due_type_revenue_nature", {
      p_mapping_id: mappingA!.id,
    });
    expect(approveErr!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    const { error: revokeErr } = await ownerB.client.rpc(
      "revoke_due_type_revenue_nature_approval",
      { p_mapping_id: mappingA!.id },
    );
    expect(revokeErr!.message).toMatch(/FORBIDDEN_TAX_MAPPING/);

    // ولا يظهر أي أثر لمؤسسة A في قائمة B.
    const { data: bRows } = await ownerB.client.rpc("list_due_type_tax_mappings", {
      p_organization_id: orgB,
    });
    const rows = bRows as unknown as { due_type_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].due_type_id).toBe(dueTypeB);
  });

  it("لا يُقبل ربط بطبيعة غير معروفة", async () => {
    const { error } = await ownerA.client.rpc("set_due_type_revenue_nature", {
      p_due_type_id: dueTypeA2,
      p_revenue_nature: "TOTALLY_MADE_UP",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/REVENUE_NATURE_UNKNOWN/);
  });
});
