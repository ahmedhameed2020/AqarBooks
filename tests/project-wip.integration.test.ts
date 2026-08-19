/**
 * تكلفة المشاريع والأعمال تحت التنفيذ.
 *
 * الادّعاء الأول: **الإنفاق يُرسمل أصلًا لا يُصرّف مصروفًا.** المطوّر الذي يُصرّف
 * إنفاقه فور وقوعه يظهر خاسرًا طوال سنوات البناء ثم رابحًا فجأة عند البيع —
 * تشويه للنتيجة لا خطأ عرض. فالقيد يُفحص طرفًا طرفًا: مدين WIP لا مدين مصروف.
 *
 * والثاني: **الرصيد يُشتق من الدفاتر لا يُخزَّن.** الاختبار يُدخل قيدًا يدويًا
 * موسومًا بالمشروع مباشرةً — بلا مرور بأي دالة — ويتوقع أن يظهر في الرصيد. رقم
 * مخزَّن كان سيتجاهله وينحرف عن الأستاذ صامتًا.
 *
 * والثالث: **لا يُحرَّر أكثر من المتراكم.** تجاوزه اعتراف بتكلفة لم تُنفق ويجعل
 * رصيد الأصل سالبًا.
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
let periodId: string;
let userId: string;
let asUser: ReturnType<typeof createClient>;
let wipAcc: string, cosAcc: string, payableAcc: string, expenseAcc: string;
let projectId: string;
let barelyProjectId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E WIP ${stamp}`, slug: `e2e-wip-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, error?.message).toBeNull();
  orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data, error: e } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  wipAcc = await acc("1300", "ASSET", "DEBIT");
  cosAcc = await acc("5600", "EXPENSE", "DEBIT");
  payableAcc = await acc("2100", "LIABILITY", "CREDIT");
  expenseAcc = await acc("5200", "EXPENSE", "DEBIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "P", code: `WIP-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  propertyId = property!.id as string;

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  const { data: period } = await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  periodId = period!.id as string;

  const mkProject = async (code: string, withAccounts: boolean) => {
    const { data, error: e } = await admin.from("projects").insert({
      organization_id: orgId, property_id: propertyId, code,
      name_ar: "مشروع", name_en: "Tower",
      ...(withAccounts
        ? { wip_account_id: wipAcc, cost_of_sales_account_id: cosAcc }
        : {}),
      budget_amount: 1000000,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  projectId = await mkProject(`TOWER-${stamp}`, true);
  barelyProjectId = await mkProject(`BARE-${stamp}`, false);

  const email = `e2e-wip-${stamp}@aqarbooks-test.local`;
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
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", orgId);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", orgId);
  await admin.from("projects").delete().eq("organization_id", orgId);
  await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
  await admin.from("fiscal_years").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("properties").delete().eq("organization_id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function summary(id: string) {
  const { data, error } = await asUser.rpc("project_wip_summary", { p_project_id: id });
  expect(error, error?.message).toBeNull();
  const row = (data as unknown as {
    capitalised: number; released: number; wip_balance: number;
  }[])[0];
  return {
    capitalised: Number(row.capitalised),
    released: Number(row.released),
    balance: Number(row.wip_balance),
  };
}

describe("project WIP costing", () => {
  it("REFUSES to capitalise onto a project whose accounts are not set", async () => {
    const { error } = await asUser.rpc("capitalise_project_cost", {
      p_project_id: barelyProjectId, p_amount: 1000,
      p_credit_account_id: payableAcc, p_entry_date: "2026-03-01",
      p_description: "no accounts",
    });
    expect(error?.message).toMatch(/PROJECT_ACCOUNTS_NOT_SET/);
  });

  it("capitalises to the ASSET, not to an expense", async () => {
    const { data: entryId, error } = await asUser.rpc("capitalise_project_cost", {
      p_project_id: projectId, p_amount: 400000,
      p_credit_account_id: payableAcc, p_entry_date: "2026-03-01",
      p_description: "concrete",
    });
    expect(error, error?.message).toBeNull();

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit, project_id").eq("journal_entry_id", entryId as string);

    const debit = lines!.find((l) => Number(l.debit) > 0)!;
    expect(debit.account_id, "construction spend is an asset while building").toBe(wipAcc);
    expect(debit.account_id).not.toBe(expenseAcc);
    expect(Number(debit.debit)).toBe(400000);

    // Both legs carry the project tag, so the dimension is complete.
    expect(lines!.every((l) => l.project_id === projectId)).toBe(true);

    const s = await summary(projectId);
    expect(s.capitalised).toBe(400000);
    expect(s.balance).toBe(400000);
  });

  it("counts a MANUAL journal line tagged with the project, because the balance comes from the ledger", async () => {
    const { data: entry } = await admin.from("journal_entries").insert({
      organization_id: orgId, property_id: propertyId, fiscal_period_id: periodId,
      entry_date: "2026-03-15", description: "manual site cost",
      source_type: "JOURNAL_VOUCHER", status: "POSTED",
    }).select("id").single();
    await admin.from("journal_entry_lines").insert([
      { journal_entry_id: entry!.id, line_number: 1, account_id: wipAcc, debit: 100000, credit: 0, project_id: projectId },
      { journal_entry_id: entry!.id, line_number: 2, account_id: payableAcc, debit: 0, credit: 100000, project_id: projectId },
    ]);

    const s = await summary(projectId);
    expect(s.capitalised, "a hand-written entry must reach the project total").toBe(500000);
    expect(s.balance).toBe(500000);
  });

  it("refuses to release more than has accumulated", async () => {
    const { error } = await asUser.rpc("release_project_wip", {
      p_project_id: projectId, p_amount: 500001, p_entry_date: "2026-04-01",
    });
    expect(error?.message).toMatch(/PROJECT_RELEASE_EXCEEDS_WIP/);
  });

  it("releases to cost of sales and reduces the balance by exactly that much", async () => {
    const { data: entryId, error } = await asUser.rpc("release_project_wip", {
      p_project_id: projectId, p_amount: 200000, p_entry_date: "2026-04-01",
      p_description: "10 units sold",
    });
    expect(error, error?.message).toBeNull();

    const { data: lines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit").eq("journal_entry_id", entryId as string);
    const debit = lines!.find((l) => Number(l.debit) > 0)!;
    const credit = lines!.find((l) => Number(l.credit) > 0)!;
    expect(debit.account_id, "the expense appears only when units sell").toBe(cosAcc);
    expect(credit.account_id).toBe(wipAcc);

    const s = await summary(projectId);
    expect(s.capitalised).toBe(500000);
    expect(s.released).toBe(200000);
    expect(s.balance).toBe(300000);
  });

  it("reports budget variance as null when there is no budget, not zero", async () => {
    const { data: noBudget } = await admin.from("projects").insert({
      organization_id: orgId, property_id: propertyId, code: `NOBUD-${Date.now()}`,
      name_ar: "بلا موازنة", name_en: "No budget",
      wip_account_id: wipAcc, cost_of_sales_account_id: cosAcc,
    }).select("id").single();

    const { data: rows } = await asUser.rpc("list_projects", { p_organization_id: orgId });
    const list = rows as unknown as {
      id: string; budget_variance: number | null; accounts_set: boolean; wip_balance: number;
    }[];

    const row = list.find((r) => r.id === noBudget!.id)!;
    expect(row.budget_variance, "no budget is not the same claim as being exactly on budget")
      .toBeNull();

    const tower = list.find((r) => r.id === projectId)!;
    expect(Number(tower.budget_variance), "1,000,000 budget minus 500,000 spent").toBe(500000);
    expect(tower.accounts_set).toBe(true);

    const bare = list.find((r) => r.id === barelyProjectId)!;
    expect(bare.accounts_set, "a project without accounts is shown as such, not hidden").toBe(false);
  });

  it("refuses to capitalise onto a completed project", async () => {
    await admin.from("projects").update({ status: "COMPLETED" }).eq("id", projectId);
    const { error } = await asUser.rpc("capitalise_project_cost", {
      p_project_id: projectId, p_amount: 1000,
      p_credit_account_id: payableAcc, p_entry_date: "2026-05-01",
      p_description: "late cost",
    });
    expect(error?.message).toMatch(/PROJECT_NOT_OPEN/);
    await admin.from("projects").update({ status: "ACTIVE" }).eq("id", projectId);
  });

  it("refuses a CASHIER", async () => {
    const stamp = Date.now();
    const email = `e2e-wip-cashier-${stamp}@aqarbooks-test.local`;
    const { data: created } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    await admin.from("organization_memberships")
      .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
    const { data: role } = await admin.from("roles")
      .select("id").eq("organization_id", orgId).eq("key", "CASHIER").single();
    await admin.from("user_role_assignments")
      .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });

    const cashier = createClient(url, anonKey, { auth: { persistSession: false } });
    await cashier.auth.signInWithPassword({ email, password: PASSWORD });
    const { error } = await cashier.rpc("capitalise_project_cost", {
      p_project_id: projectId, p_amount: 100,
      p_credit_account_id: payableAcc, p_entry_date: "2026-03-01",
      p_description: "nope",
    });
    expect(error?.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);

    await admin.from("user_role_assignments").delete().eq("user_id", created!.user!.id);
    await admin.from("organization_memberships").delete().eq("user_id", created!.user!.id);
    await admin.auth.admin.deleteUser(created!.user!.id);
  });
});
