/**
 * إشعارات التحصيل.
 *
 * الادّعاء الأول: **لا حالة «سُلِّم» يبلغها الكود وحده.** لا يوجد في النظام ما
 * يُرسل شيئًا، فالإشعار يُرفع بحالة RAISED ويبقى. تسجيل «أُرسل» بلا إرسال أسوأ
 * من عدم الإرسال: المشغّل يظن أن المدين نُبِّه فيكفّ عن ملاحقته، والمدين لم
 * يصله شيء. والقيد في القاعدة يمنع الادّعاء لا الوثائق فقط.
 *
 * والثاني: **المستوى المستحق هو الأعلى لا الأدنى.** متأخر 90 يومًا يجب أن يبلغ
 * مستوى الـ90 مباشرة، لا أن يبدأ من الـ7 ويتدرّج شهورًا بينما الدين يشيخ.
 *
 * والثالث: المتبقي يُحسب من دفعات **مُرحَّلة** فقط. دفعة غير مرحَّلة ليست
 * تحصيلًا، واحتسابها يوقف ملاحقة دين لم يُسدَّد.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let orgId: string;
let propertyId: string;
let unitId: string;
let memberId: string;
let dueTypeId: string;
let receivableId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;

const AS_OF = "2026-06-30";

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E Dunning ${stamp}`, slug: `e2e-dunning-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    return data!.id as string;
  };
  receivableId = await acc("1200", "ASSET", "DEBIT");
  const revenue = await acc("4100", "REVENUE", "CREDIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "P", code: `DUN-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  propertyId = property!.id as string;

  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `U-${stamp}`,
  }).select("id").single();
  unitId = unit!.id as string;

  const { data: member } = await admin.from("members").insert({
    organization_id: orgId, full_name: "مالك متأخر",
    email: "late@example.test", phone: "+201000000000",
  }).select("id").single();
  memberId = member!.id as string;

  await admin.from("unit_ownerships").insert({
    organization_id: orgId, unit_id: unitId, member_id: memberId,
    share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
  });

  const { data: dt } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue,
    name_ar: "رسوم", name_en: "Fee", is_active: true,
  }).select("id").single();
  dueTypeId = dt!.id as string;

  await admin.from("dunning_policies").insert([
    { organization_id: orgId, stage: 1, name_ar: "تذكير", name_en: "Reminder", days_overdue: 7, minimum_amount: 100 },
    { organization_id: orgId, stage: 2, name_ar: "إنذار", name_en: "Warning", days_overdue: 30, minimum_amount: 100 },
    { organization_id: orgId, stage: 3, name_ar: "إنذار نهائي", name_en: "Final notice", days_overdue: 90, minimum_amount: 100 },
  ]);

  const email = `e2e-dunning-${stamp}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  userId = created!.user!.id;
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  asUser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, signInErr?.message).toBeNull();
});

afterAll(async () => {
  if (!orgId) return;
  await admin.from("dunning_notices").delete().eq("organization_id", orgId);
  await admin.from("dunning_policies").delete().eq("organization_id", orgId);
  await admin.from("payment_allocations").delete()
    .in("payment_id", ((await admin.from("payments").select("id").eq("organization_id", orgId)).data ?? []).map((p) => p.id));
  await admin.from("payments").delete().eq("organization_id", orgId);
  await admin.from("dues").delete().eq("organization_id", orgId);
  await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
  await admin.from("members").delete().eq("organization_id", orgId);
  await admin.from("units").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
  await admin.from("due_types").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function makeDue(dueDate: string, amount: number, label: string) {
  const { data, error } = await admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unitId,
    due_type_id: dueTypeId, receivable_account_id: receivableId,
    amount, issue_date: "2026-01-01", due_date: dueDate,
    status: "ISSUED", description: label,
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function candidates() {
  const { data, error } = await asUser.rpc("list_dunning_candidates", {
    p_organization_id: orgId, p_as_of: AS_OF,
  });
  expect(error, error?.message).toBeNull();
  return data as unknown as {
    due_id: string; days_overdue: number; outstanding: number;
    stage: number; member_id: string | null; member_email: string | null;
    already_raised: boolean;
  }[];
}

describe("dunning", () => {
  it("assigns the HIGHEST stage the debt has reached, not the lowest", async () => {
    const veryLate = await makeDue("2026-01-01", 1000, "very late");   // 180 days
    const midLate = await makeDue("2026-06-01", 1000, "mid late");     // 29 days
    const justLate = await makeDue("2026-06-20", 1000, "just late");   // 10 days

    const rows = await candidates();
    const byId = new Map(rows.map((r) => [r.due_id, r]));

    expect(byId.get(veryLate)!.stage, "180 days overdue must reach the final notice").toBe(3);
    expect(byId.get(midLate)!.stage).toBe(1);
    expect(byId.get(justLate)!.stage).toBe(1);
  });

  it("ignores a debt below the stage's minimum, because chasing it costs more than it collects", async () => {
    const tiny = await makeDue("2026-01-01", 50, "tiny");
    const rows = await candidates();
    expect(rows.find((r) => r.due_id === tiny), "50 is below the 100 minimum").toBeUndefined();
  });

  it("counts only POSTED payments as collection", async () => {
    const partly = await makeDue("2026-01-01", 1000, "partly paid");

    // A REVERSED payment must carry its reason and reversal stamps -- the
    // schema refuses a reversal that does not say why, which is right, so the
    // fixture supplies them rather than the test working around it.
    const mkPayment = async (status: string, amount: number) => {
      const { data: p, error } = await admin.from("payments").insert({
        organization_id: orgId, property_id: propertyId, member_id: memberId,
        unit_id: unitId, amount, method: "CASH", payment_date: "2026-02-01",
        deposit_account_id: receivableId, status, unallocated_amount: 0,
        ...(status === "REVERSED"
          ? {
              reversal_reason: "e2e reversal",
              reversed_at: new Date().toISOString(),
              reversed_by: userId,
            }
          : {}),
      }).select("id").single();
      expect(error, `payment insert failed: ${error?.message}`).toBeNull();
      const { error: allocErr } = await admin.from("payment_allocations")
        .insert({ payment_id: p!.id, due_id: partly, amount });
      expect(allocErr, allocErr?.message).toBeNull();
      return p!.id as string;
    };

    await mkPayment("POSTED", 300);
    await mkPayment("REVERSED", 500);

    const { data: outstanding } = await admin.rpc("due_outstanding", { p_due_id: partly });
    expect(Number(outstanding), "only the posted 300 reduces the debt").toBe(700);
  });

  it("raises a notice as RAISED, and there is no way for the code to claim DELIVERED", async () => {
    const { data: count, error } = await asUser.rpc("raise_dunning_notices", {
      p_organization_id: orgId, p_stage: 3, p_as_of: AS_OF,
    });
    expect(error, error?.message).toBeNull();
    expect(Number(count)).toBeGreaterThan(0);

    const { data: notices } = await admin.from("dunning_notices")
      .select("status, delivered_at, delivery_channel, outstanding_amount, days_overdue")
      .eq("organization_id", orgId).eq("stage", 3);

    expect(notices!.every((n) => n.status === "RAISED")).toBe(true);
    expect(notices!.every((n) => n.delivered_at === null)).toBe(true);
    // The amount is frozen at the moment it was raised.
    expect(Number(notices![0].outstanding_amount)).toBeGreaterThan(0);
  });

  it("REFUSES to mark a notice delivered without a time and a channel", async () => {
    const { data: notice } = await admin.from("dunning_notices")
      .select("id").eq("organization_id", orgId).limit(1).single();

    const { error } = await admin.from("dunning_notices")
      .update({ status: "DELIVERED" }).eq("id", notice!.id);
    expect(error?.message, "a delivered status must be proven, not asserted")
      .toMatch(/dunning_notices_delivery_consistent/);

    const { error: ok } = await admin.from("dunning_notices").update({
      status: "DELIVERED", delivered_at: new Date().toISOString(), delivery_channel: "EMAIL_EXTERNAL",
    }).eq("id", notice!.id);
    expect(ok, "with a real time and a channel from the allowed set it is accepted").toBeNull();
  });

  it("rejects a delivery channel outside the allowed set (a bare 'EMAIL' is not one)", async () => {
    // The database allows PRINTED, HAND_DELIVERED, PHONE, EMAIL_EXTERNAL, WHATSAPP_EXTERNAL, POST
    // (dunning_notices_channel_check) and the UI offers the same values. This test used to send
    // "EMAIL", which has never been valid; that was a wrong expectation, not a product defect.
    const { data: raised } = await admin.from("dunning_notices")
      .select("id").eq("organization_id", orgId).eq("status", "RAISED").limit(1);
    let noticeId = raised?.[0]?.id as string | undefined;
    if (!noticeId) {
      await asUser.rpc("raise_dunning_notices", { p_organization_id: orgId, p_stage: 2, p_as_of: AS_OF });
      const { data: again } = await admin.from("dunning_notices")
        .select("id").eq("organization_id", orgId).eq("status", "RAISED").limit(1);
      noticeId = again?.[0]?.id as string | undefined;
    }
    expect(noticeId, "a RAISED notice is needed to exercise delivery").toBeTruthy();
    const bad = await asUser.rpc("record_dunning_delivery", { p_notice_id: noticeId!, p_channel: "EMAIL" });
    expect(bad.error?.message).toMatch(/dunning_notices_channel_check/);
    const { data: still } = await admin.from("dunning_notices").select("status").eq("id", noticeId!).single();
    expect(still!.status).toBe("RAISED");
  });

  it("records delivery through record_dunning_delivery as an authorized user: state, audit row, no ledger effect, not repeatable", async () => {
    const { data: raised } = await admin.from("dunning_notices")
      .select("id").eq("organization_id", orgId).eq("status", "RAISED").limit(1);
    const noticeId = raised?.[0]?.id as string;
    expect(noticeId).toBeTruthy();
    const entriesBefore = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", orgId);

    const ok = await asUser.rpc("record_dunning_delivery", { p_notice_id: noticeId, p_channel: "EMAIL_EXTERNAL", p_reference: "msg-123" });
    expect(ok.error, ok.error?.message).toBeNull();

    const { data: notice } = await admin.from("dunning_notices")
      .select("status, delivered_at, delivery_channel, delivery_reference").eq("id", noticeId).single();
    expect(notice).toMatchObject({ status: "DELIVERED", delivery_channel: "EMAIL_EXTERNAL", delivery_reference: "msg-123" });
    expect(notice!.delivered_at).not.toBeNull();

    // Delivery is audited in platform_audit_logs (it is not a financial-ledger event), by the acting user.
    const { data: audit } = await admin.from("platform_audit_logs")
      .select("actor_id, organization_id, action").eq("entity_id", noticeId).eq("action", "dunning_notice.delivered");
    expect(audit).toEqual([{ actor_id: userId, organization_id: orgId, action: "dunning_notice.delivered" }]);

    // A reminder moves no money: no journal entry and no financial-audit-chain row is produced.
    const entriesAfter = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(entriesAfter.count).toBe(entriesBefore.count);

    const again = await asUser.rpc("record_dunning_delivery", { p_notice_id: noticeId, p_channel: "EMAIL_EXTERNAL" });
    expect(again.error?.message).toContain("DUNNING_NOTICE_ALREADY_DELIVERED");
  });

  it("does not raise the same stage twice for the same due", async () => {
    const before = await admin.from("dunning_notices")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("stage", 3);

    const { data: count } = await asUser.rpc("raise_dunning_notices", {
      p_organization_id: orgId, p_stage: 3, p_as_of: AS_OF,
    });
    expect(Number(count), "a second run raises nothing").toBe(0);

    const after = await admin.from("dunning_notices")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("stage", 3);
    expect(after.count).toBe(before.count);
  });

  it("refuses an unknown stage rather than silently raising nothing", async () => {
    const { error } = await asUser.rpc("raise_dunning_notices", {
      p_organization_id: orgId, p_stage: 9, p_as_of: AS_OF,
    });
    expect(error?.message).toMatch(/DUNNING_STAGE_NOT_FOUND/);
  });

  it("still lists a due whose unit has no owner, rather than hiding a data gap", async () => {
    const { data: orphanUnit } = await admin.from("units").insert({
      organization_id: orgId, property_id: propertyId, code: `ORPH-${Date.now()}`,
    }).select("id").single();
    const { data: orphanDue } = await admin.from("dues").insert({
      organization_id: orgId, property_id: propertyId, unit_id: orphanUnit!.id,
      due_type_id: dueTypeId, receivable_account_id: receivableId,
      amount: 900, issue_date: "2026-01-01", due_date: "2026-01-01",
      status: "ISSUED", description: "ownerless",
    }).select("id").single();

    const rows = await candidates();
    const row = rows.find((r) => r.due_id === orphanDue!.id);
    expect(row, "an ownerless due is a data problem to SEE, not a row to hide").toBeDefined();
    expect(row!.member_id).toBeNull();

    await admin.from("dues").delete().eq("id", orphanDue!.id);
    await admin.from("units").delete().eq("id", orphanUnit!.id);
  });
});
