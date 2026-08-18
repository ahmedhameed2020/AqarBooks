/**
 * Portal account statement — the one screen from the phase 1/2 work that the
 * staff-session smoke spec could not reach, because the portal authenticates a
 * MEMBER rather than staff.
 *
 * A statement is the document an owner takes to a bank or an association takes
 * to court, so the things worth asserting are not "does it paint" but: does it
 * show this owner's movements and nobody else's, does the balance follow from
 * them, does it behave when there is nothing to show, and is it reachable only
 * by someone entitled to it.
 *
 * Fixture conventions follow tests/e2e/owner-portal-isolation.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const OWNER_PASSWORD = "E2E_Owner_P@ssw0rd_2026!";

type Owner = {
  orgId: string;
  email: string;
  unitCode: string;
  memberId: string;
  duesTotal: number;
  paidTotal: number;
};

/**
 * @param withActivity false produces an owner whose statement is legitimately
 * empty — the case that most often renders as a crash or a misleading zero.
 */
async function setUpOwner(
  admin: SupabaseClient,
  label: string,
  withActivity: boolean,
): Promise<Owner> {
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E Statement ${label} ${stamp}`,
      slug: `e2e-statement-${label.toLowerCase()}-${stamp}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const email = `e2e-statement-${label.toLowerCase()}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  expect(userErr, `createUser failed: ${userErr?.message}`).toBeNull();

  const { data: property, error: propErr } = await admin
    .from("properties")
    .insert({ organization_id: orgId, name: `Prop ${label}`, code: `P${label}${stamp}` })
    .select("id")
    .single();
  expect(propErr, `property insert failed: ${propErr?.message}`).toBeNull();

  const unitCode = `STMT-${label}`;
  const { data: unit, error: unitErr } = await admin
    .from("units")
    .insert({ organization_id: orgId, property_id: property!.id, code: unitCode, unit_type: "VILLA" })
    .select("id")
    .single();
  expect(unitErr, `unit insert failed: ${unitErr?.message}`).toBeNull();

  const { data: member, error: memberErr } = await admin
    .from("members")
    .insert({ organization_id: orgId, full_name: `Owner ${label}`, email, user_id: created!.user!.id })
    .select("id")
    .single();
  expect(memberErr, `member insert failed: ${memberErr?.message}`).toBeNull();

  const { error: ownErr } = await admin
    .from("unit_ownerships")
    .insert({ organization_id: orgId, unit_id: unit!.id, member_id: member!.id, is_primary_contact: true });
  expect(ownErr, `ownership insert failed: ${ownErr?.message}`).toBeNull();

  let duesTotal = 0;
  let paidTotal = 0;

  if (withActivity) {
    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .insert([
        { organization_id: orgId, code: "1130", name_ar: "ذمم", name_en: "Receivables", category: "ASSET", normal_balance: "DEBIT", is_group: false },
        { organization_id: orgId, code: "4100", name_ar: "إيراد", name_en: "Revenue", category: "REVENUE", normal_balance: "CREDIT", is_group: false },
      ])
      .select("id, category");
    const receivableId = accounts!.find((a) => a.category === "ASSET")!.id;
    const revenueId = accounts!.find((a) => a.category === "REVENUE")!.id;

    const { data: dueType } = await admin
      .from("due_types")
      .insert({
        organization_id: orgId,
        name_ar: "رسوم صيانة",
        name_en: "Maintenance",
        default_revenue_account_id: revenueId,
      })
      .select("id")
      .single();

    // Two charges and one payment: enough that the closing balance is a real
    // subtraction rather than a single figure echoed back.
    const { error: duesErr } = await admin.from("dues").insert([
      {
        organization_id: orgId,
        property_id: property!.id,
        unit_id: unit!.id,
        due_type_id: dueType!.id,
        receivable_account_id: receivableId,
        amount: 3000,
        issue_date: "2026-02-01",
        due_date: "2026-02-15",
        description: "Statement charge one",
        status: "ISSUED",
      },
      {
        organization_id: orgId,
        property_id: property!.id,
        unit_id: unit!.id,
        due_type_id: dueType!.id,
        receivable_account_id: receivableId,
        amount: 1500,
        issue_date: "2026-03-01",
        due_date: "2026-03-15",
        description: "Statement charge two",
        status: "ISSUED",
      },
    ] as never);
    expect(duesErr, `dues insert failed: ${duesErr?.message}`).toBeNull();
    duesTotal = 4500;

    const { error: payErr } = await admin.from("payments").insert({
      organization_id: orgId,
      property_id: property!.id,
      member_id: member!.id,
      amount: 1000,
      payment_date: "2026-03-10",
      method: "CASH",
      status: "POSTED",
      receipt_no: "REC-STMT-1",
    } as never);
    expect(payErr, `payment insert failed: ${payErr?.message}`).toBeNull();
    paidTotal = 1000;
  }

  return { orgId, email, unitCode, memberId: member!.id as string, duesTotal, paidTotal };
}

/**
 * Deletes the fixture rather than archiving it.
 *
 * owner-portal-isolation.spec.ts archives instead, which leaves every run's
 * organizations behind forever; ten had accumulated from this spec alone before
 * this was tightened. Deleting needs an explicit unwind because the org cascade
 * does not cover everything: platform_audit_logs has no cascade by design, and
 * dues reference due_types and chart_of_accounts, which the cascade tries to
 * remove first.
 */
async function cleanUp(admin: SupabaseClient, orgId: string) {
  const { data: payments } = await admin.from("payments").select("id").eq("organization_id", orgId);
  const paymentIds = (payments ?? []).map((p) => p.id as string);
  if (paymentIds.length) {
    await admin.from("payment_allocations").delete().in("payment_id", paymentIds);
  }
  await admin.from("payments").delete().eq("organization_id", orgId);
  await admin.from("dues").delete().eq("organization_id", orgId);
  await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
  await admin.from("members").delete().eq("organization_id", orgId);
  await admin.from("due_types").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);

  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
}

test("an owner's statement shows their own movements, and never another owner's", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const ownerA = await setUpOwner(admin, "A", true);
  const ownerB = await setUpOwner(admin, "B", true);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto("/ar/portal/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(ownerA.email);
  await page.getByLabel(/كلمة المرور|Password/).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await page.waitForURL(/\/portal$/, { timeout: 20_000 });

  await page.goto("/ar/portal/statement");
  const body = await page.locator("body").innerText();

  // Own charges present.
  expect(body).toContain("Statement charge one");
  expect(body).toContain("Statement charge two");
  // Own unit, and crucially not the other owner's.
  expect(body).toContain(ownerA.unitCode);
  expect(body, "another owner's unit must never appear").not.toContain(ownerB.unitCode);
  // The balance is the arithmetic consequence, not a repeated figure:
  // 4,500 charged less 1,000 paid = 3,500.
  expect(body).toMatch(/4,?500/);
  expect(body).toMatch(/1,?000/);
  expect(body).toMatch(/3,?500/);

  await ctx.close();
  await cleanUp(admin, ownerA.orgId);
  await cleanUp(admin, ownerB.orgId);
});

test("an owner with no activity gets an empty statement, not a crash or a wrong zero", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const owner = await setUpOwner(admin, "Empty", false);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/ar/portal/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(owner.email);
  await page.getByLabel(/كلمة المرور|Password/).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await page.waitForURL(/\/portal$/, { timeout: 20_000 });

  await page.goto("/ar/portal/statement");
  const body = await page.locator("body").innerText();

  expect(body).toMatch(/لا توجد حركات|No movements/);
  expect(pageErrors, `empty statement raised errors:\n${pageErrors.join("\n")}`).toEqual([]);

  // Printing nothing is not a feature: the control must be disabled rather than
  // producing a blank official-looking document.
  const printButton = page.getByRole("button", { name: /طباعة كشف الحساب|Print statement/ });
  await expect(printButton).toBeDisabled();

  await ctx.close();
  await cleanUp(admin, owner.orgId);
});

test("the statement renders right-to-left in Arabic and left-to-right in English", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const owner = await setUpOwner(admin, "Dir", true);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/ar/portal/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(owner.email);
  await page.getByLabel(/كلمة المرور|Password/).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await page.waitForURL(/\/portal$/, { timeout: 20_000 });

  await page.goto("/ar/portal/statement");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /كشف الحساب/ })).toBeVisible();

  await page.goto("/en/portal/statement");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: /Account Statement/i })).toBeVisible();

  // With activity present the print control is available in both directions.
  await expect(page.getByRole("button", { name: /Print statement/i })).toBeEnabled();

  await ctx.close();
  await cleanUp(admin, owner.orgId);
});

test("the statement is unreachable without a portal session", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto("/ar/portal/statement");
  // Redirected to the portal's own login, not the staff one.
  await expect(page).toHaveURL(/\/portal\/login/, { timeout: 15_000 });
  const body = await page.locator("body").innerText();
  expect(body, "no statement content may leak to an anonymous visitor").not.toMatch(
    /Statement charge|كشف الحساب الخاص/,
  );

  await ctx.close();
});
