/**
 * شاشة مراجعة التصنيف الضريبي — عرض حي.
 *
 * الاختبارات التكاملية أثبتت الحواجز في القاعدة. ما لا تثبته هو أن الصفحة تُعرض
 * أصلًا: مكوّن خادم يستورد من ملف "use client" يمكن أن يفشل صامتًا بطريقة لا
 * يلتقطها `tsc` ولا البناء، وقد حدث ذلك في هذا المستودع من قبل. فهذه الاختبارات
 * تفتح الصفحة فعلًا وتقودها.
 *
 * وتُثبت أمرين لا يظهران إلا في الواجهة: أن النوع غير المربوط **يظهر** بدل أن
 * يغيب، وأن الطبيعة المشتقة معروضة معطَّلة لا محذوفة.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; dueTypeId: string; dueTypeName: string };

async function setUpOrg(
  admin: SupabaseClient,
  label: string,
  roleKey: string,
): Promise<Fixture> {
  const stamp = `${Date.now()}-${label}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E TaxMap UI ${stamp}`,
      slug: `e2e-taxmap-ui-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: account } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId,
      code: "4100",
      name_ar: "إيراد اختبار",
      name_en: "Test Revenue",
      category: "REVENUE",
      normal_balance: "CREDIT",
    })
    .select("id")
    .single();

  // اسم بلا دلالة ضريبية، ومميَّز حتى يمكن تعقّبه في الصفحة.
  const dueTypeName = `Fee / x ${label} ${Date.now()}`;
  const { data: dueType, error: dtErr } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: account!.id,
      name_ar: dueTypeName,
      name_en: dueTypeName,
      is_active: true,
    })
    .select("id")
    .single();
  expect(dtErr, `due_type insert failed: ${dtErr?.message}`).toBeNull();

  const email = `e2e-taxmap-ui-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", roleKey)
    .single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });

  return { orgId, email, dueTypeId: dueType!.id as string, dueTypeName };
}

async function cleanUp(admin: SupabaseClient, orgId: string) {
  await admin.from("due_type_revenue_natures").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
}

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 20_000 });
}

test("an unmapped due type is shown as review-required, then mapped and approved", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Owner", "TENANT_OWNER");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/tax-mapping");

  // The page renders at all. A server component importing from a "use client"
  // module can fail in ways tsc and the build both accept.
  await expect(page.getByRole("heading", { name: /Revenue Tax Classification/i })).toBeVisible();

  const card = page.locator(`[data-due-type="${org.dueTypeId}"]`);
  await expect(card).toHaveAttribute("data-status", "REVIEW_REQUIRED");
  // Absent from the screen would read as "nothing to do", which is the opposite
  // of the truth for an unmapped type.
  await expect(card).toContainText(org.dueTypeName);
  await expect(card).toContainText(/Not mapped yet/i);

  const select = card.locator(`#nature-${org.dueTypeId}`);
  // A derived nature is offered but disabled: hiding it would read as an
  // oversight, showing it disabled says the type exists and this is not its route.
  await expect(select.locator('option[value="SALE_INSTALLMENT"]')).toBeDisabled();
  await expect(select.locator('option[value="MANAGEMENT_FEE"]')).toBeEnabled();

  await select.selectOption("MANAGEMENT_FEE");
  await card.locator(`#notes-${org.dueTypeId}`).fill("Management contract clause 4");
  await card.getByRole("button", { name: /Save mapping/i }).click();

  // Still review-required after saving: saving is not approving.
  const afterSave = page.locator(`[data-due-type="${org.dueTypeId}"]`);
  await expect(afterSave).toHaveAttribute("data-status", "REVIEW_REQUIRED", { timeout: 15_000 });
  await expect(afterSave).toContainText(/Proposed: Management Fee/i);

  const { data: saved } = await admin
    .from("due_type_revenue_natures")
    .select("status, revenue_nature, approved_at")
    .eq("due_type_id", org.dueTypeId)
    .single();
  expect(saved!.status).toBe("REVIEW_REQUIRED");
  expect(saved!.revenue_nature).toBe("MANAGEMENT_FEE");
  expect(saved!.approved_at).toBeNull();

  await afterSave.getByRole("button", { name: /Approve mapping/i }).click();

  const approvedCard = page.locator(`[data-due-type="${org.dueTypeId}"]`);
  await expect(approvedCard).toHaveAttribute("data-status", "APPROVED", { timeout: 15_000 });

  const { data: approved } = await admin
    .from("due_type_revenue_natures")
    .select("status, approved_by, approved_at")
    .eq("due_type_id", org.dueTypeId)
    .single();
  expect(approved!.status).toBe("APPROVED");
  expect(approved!.approved_at).not.toBeNull();

  // And the approval is auditable from the screen's own action.
  const { data: logs } = await admin
    .from("platform_audit_logs")
    .select("action")
    .eq("organization_id", org.orgId)
    .eq("action", "tax_mapping.approved");
  expect(logs).toHaveLength(1);

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("a user without the permission is told so, and gets no controls", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // CASHIER holds no finance.tax_mapping.* permission.
  const org = await setUpOrg(admin, "NoPerm", "CASHIER");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/tax-mapping");

  const body = await page.locator("body").innerText();
  expect(body).toMatch(/don't have permission/i);
  // The refusal is stated rather than the screen being blank or hidden.
  expect(body, "internal detail must not leak").not.toContain(org.dueTypeName);
  await expect(page.getByRole("button", { name: /Save mapping/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve mapping/i })).toHaveCount(0);

  await ctx.close();
  await cleanUp(admin, org.orgId);
});
