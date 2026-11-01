/**
 * شاشة التحصيل — عرض حي.
 *
 * ما يُختبر هنا ليس الحساب (مُختبَر تكامليًا) بل **الصدق**: أن الشاشة تقول
 * صراحة إنها ترفع الإشعارات ولا ترسلها، وأن الإشعار يبقى «لم يُسلَّم» حتى
 * يُسجّل إنسان أنه سلّمه وبأي وسيلة.
 *
 * ويُختبر أيضًا أن المستحق **بلا مالك يُعرض** لا يُخفى — إخفاؤه يعني أن دينًا
 * لا يُلاحَق أبدًا بصمت، وفي القاعدة 420 مستحقًا كهذا.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = {
  orgId: string;
  email: string;
  userIds: string[];
  lateDescription: string;
  orphanDescription: string;
};

async function makeUser(admin: SupabaseClient, f: Fixture, roleKey: string, tag: string) {
  const email = `e2e-dun-${tag}-${Date.now()}@aqarbooks-test.local`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: STAFF_PASSWORD, email_confirm: true,
  });
  expect(error, error?.message).toBeNull();
  f.userIds.push(created!.user!.id);
  await admin.from("organization_memberships")
    .insert({ organization_id: f.orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", f.orgId).eq("key", roleKey).single();
  expect(role, `role ${roleKey} missing`).not.toBeNull();
  await admin.from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: f.orgId });
  return email;
}

async function setUp(admin: SupabaseClient): Promise<Fixture> {
  const stamp = Date.now();
  const { data: org, error } = await admin.from("organizations").insert({
    name: `E2E DunUI ${stamp}`, slug: `e2e-dunui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const f: Fixture = {
    orgId: org!.id as string, email: "", userIds: [],
    lateDescription: `LATE-${stamp}`, orphanDescription: `ORPHAN-${stamp}`,
  };
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data } = await admin.from("chart_of_accounts").insert({
      organization_id: f.orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    return data!.id as string;
  };
  const receivable = await acc("1200", "ASSET", "DEBIT");
  const revenue = await acc("4100", "REVENUE", "CREDIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: f.orgId, name: "P", code: `DUI-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();

  const { data: ownedUnit } = await admin.from("units").insert({
    organization_id: f.orgId, property_id: property!.id, code: `OWNED-${stamp}`,
  }).select("id").single();
  const { data: orphanUnit } = await admin.from("units").insert({
    organization_id: f.orgId, property_id: property!.id, code: `ORPH-${stamp}`,
  }).select("id").single();

  const { data: member } = await admin.from("members").insert({
    organization_id: f.orgId, full_name: "المالك المتأخر", email: "late@example.test",
  }).select("id").single();
  await admin.from("unit_ownerships").insert({
    organization_id: f.orgId, unit_id: ownedUnit!.id, member_id: member!.id,
    share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01",
  });

  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: f.orgId, default_revenue_account_id: revenue,
    name_ar: "رسوم", name_en: "Fee", is_active: true,
  }).select("id").single();

  const mkDue = async (unitId: string, description: string) => {
    const { error: e } = await admin.from("dues").insert({
      organization_id: f.orgId, property_id: property!.id, unit_id: unitId,
      due_type_id: dueType!.id, receivable_account_id: receivable,
      amount: 5000, issue_date: "2020-01-01", due_date: "2020-06-01",
      status: "ISSUED", description,
    });
    expect(e, e?.message).toBeNull();
  };
  await mkDue(ownedUnit!.id, f.lateDescription);
  await mkDue(orphanUnit!.id, f.orphanDescription);

  f.email = await makeUser(admin, f, "TENANT_OWNER", "owner");
  return f;
}

async function cleanUp(admin: SupabaseClient, f: Fixture) {
  const id = f.orgId;
  await admin.from("dunning_notices").delete().eq("organization_id", id);
  await admin.from("dunning_policies").delete().eq("organization_id", id);
  await admin.from("dues").delete().eq("organization_id", id);
  await admin.from("unit_ownerships").delete().eq("organization_id", id);
  await admin.from("members").delete().eq("organization_id", id);
  await admin.from("units").delete().eq("organization_id", id);
  await admin.from("properties").delete().eq("organization_id", id);
  await admin.from("due_types").delete().eq("organization_id", id);
  await admin.from("platform_audit_logs").delete().eq("organization_id", id);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", id);
  await admin.from("chart_of_accounts").delete().eq("organization_id", id);
  await admin.from("user_role_assignments").delete().eq("organization_id", id);
  await admin.from("organization_memberships").delete().eq("organization_id", id);
  const { error } = await admin.from("organizations").delete().eq("id", id);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  for (const u of f.userIds) await admin.auth.admin.deleteUser(u);
}

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 40_000 });
}

test("a stage is defined, notices are raised, and one is only DELIVERED once a human records it", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/dunning");

    // The screen must state its own limit before anything else.
    await expect(
      page.getByText(/RAISES notices; it does not send them/i),
      "the screen must not let an operator assume the debtor was contacted",
    ).toBeVisible();

    // Nothing is flagged until a stage exists -- and the screen says so.
    await expect(page.getByText(/Nothing will be flagged until at least one stage exists/i)).toBeVisible();

    // Define stage 1 through the policy dialog (the form lives in a modal).
    await page.getByRole("button", { name: /Dunning Policies/i }).click();
    await page.getByRole("button", { name: /New Policy Stage/i }).click();
    await page.locator("#pol-stage").fill("1");
    await page.locator("#pol-ar").fill("إنذار نهائي");
    await page.locator("#pol-en").fill("Final notice");
    await page.locator("#pol-days").fill("90");
    await page.locator("#pol-min").fill("100");
    await page.getByRole("dialog").getByRole("button", { name: /Save Stage/i }).click();
    await expect(page.getByText("Final notice").first()).toBeVisible({ timeout: 40_000 });

    // Both debts are eligible -- including the one whose unit has no owner.
    await page.getByRole("button", { name: /Eligible Overdue/i }).click();
    await expect(page.getByText(f.lateDescription)).toBeVisible({ timeout: 40_000 });
    await expect(
      page.getByText(f.orphanDescription),
      "an ownerless debt must be visible, not hidden until the data is fixed",
    ).toBeVisible();
    await expect(page.getByText(/No member/i).first()).toBeVisible();

    // Raise stage notices through the raise dialog, and prove it in the database.
    await page.getByRole("button", { name: /Raise Stage Notices/i }).click();
    await page.locator("#raise-stage").selectOption("1");
    await page.getByRole("dialog").getByRole("button", { name: /Raise Notices/i }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("dunning_notices").select("id").eq("organization_id", f.orgId);
        return data?.length ?? 0;
      }, { timeout: 40_000 })
      .toBe(2);

    // The raise dialog may stay open after a successful raise; close it before
    // interacting with the tabs behind it.
    if (await page.getByRole("dialog").count()) {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    // Raised, and NOT delivered.
    await page.getByRole("button", { name: /Notice Register/i }).click();
    await expect(page.getByText("Raised", { exact: true }).first()).toBeVisible({ timeout: 40_000 });

    const { data: rows } = await admin
      .from("dunning_notices").select("status, delivered_at, delivery_channel")
      .eq("organization_id", f.orgId);
    expect(rows).toHaveLength(2);
    expect(rows!.every((r) => r.status === "RAISED" && r.delivered_at === null)).toBe(true);

    // Now a human records that they actually delivered it.
    await page.getByRole("button", { name: /^Deliver$/i }).first().click();
    await page.locator("#del-channel").selectOption("HAND_DELIVERED");
    await page.locator("#del-reference").fill("receipt 123");
    await page.getByRole("dialog").getByRole("button", { name: /Confirm Delivery/i }).click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("dunning_notices").select("status")
          .eq("organization_id", f.orgId).eq("status", "DELIVERED");
        return data?.length ?? 0;
      }, { timeout: 40_000 })
      .toBe(1);

    const { data: delivered } = await admin
      .from("dunning_notices").select("delivery_channel, delivery_reference, delivered_at")
      .eq("organization_id", f.orgId).eq("status", "DELIVERED").single();
    expect(delivered!.delivery_channel).toBe("HAND_DELIVERED");
    expect(delivered!.delivery_reference).toBe("receipt 123");
    expect(delivered!.delivered_at, "a delivery without a time is not a delivery").not.toBeNull();

    // Re-running the same stage raises nothing rather than nagging twice.
    await page.reload();
    await page.getByRole("button", { name: /Raise Stage Notices/i }).click();
    await page.locator("#raise-stage").selectOption("1");
    await page.getByRole("dialog").getByRole("button", { name: /Raise Notices/i }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("dunning_notices").select("id").eq("organization_id", f.orgId);
        return data?.length ?? 0;
      }, { timeout: 40_000 })
      .toBe(2);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a reader sees the collections work without the controls", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    await admin.from("dunning_policies").insert({
      organization_id: f.orgId, stage: 1, name_ar: "إنذار", name_en: "Notice",
      days_overdue: 30, minimum_amount: 0,
    });

    // ACCOUNTANT reads collections but cannot raise or record.
    const reader = await makeUser(admin, f, "ACCOUNTANT", "reader");
    const readCtx = await browser.newContext();
    const readPage = await readCtx.newPage();
    await signIn(readPage, reader);
    await readPage.goto("/en/finance/dunning");

    await expect(readPage.getByText(f.lateDescription)).toBeVisible({ timeout: 40_000 });
    await expect(readPage.getByRole("button", { name: /Raise Stage Notices/i })).toHaveCount(0);
    await expect(readPage.getByRole("button", { name: /New Policy Stage/i })).toHaveCount(0);
    await readCtx.close();

    const storekeeper = await makeUser(admin, f, "STOREKEEPER", "store");
    const denyCtx = await browser.newContext();
    const denyPage = await denyCtx.newPage();
    await signIn(denyPage, storekeeper);
    await denyPage.goto("/en/finance/dunning");

    await expect(
      denyPage.getByText(/do not have permission to view collections/i),
    ).toBeVisible();
    await expect(denyPage.getByRole("button", { name: /Raise Stage Notices/i })).toHaveCount(0);
    await denyCtx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
