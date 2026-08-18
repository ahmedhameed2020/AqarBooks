/**
 * شاشة أصناف المستندات الإلكترونية — عرض حي.
 *
 * كل ما بُني في هذه المرحلة كان RPCs بلا سطح: لا سبيل لمشغّل أن يربط صنفًا أو
 * يضيف كودًا. هذه الشاشة تفتح ذلك، والاختبار يقودها كما يقودها مشغّل.
 *
 * ويُثبت أيضًا ما لا يظهر إلا في الواجهة: أن **الناقص يظهر** — نوع مستحق بلا
 * صنف، وصنف بلا كود — بدل أن يمر صامتًا ثم تُرفض الفاتورة عند السلطة.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; dueTypeId: string; dueTypeName: string };

async function setUpOrg(admin: SupabaseClient, label: string, roleKey: string): Promise<Fixture> {
  const stamp = `${Date.now()}-${label}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E Items ${stamp}`,
      slug: `e2e-items-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_id: "100-ITEMS-001",
      tax_jurisdiction: "EG",
    })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const { data: revenue } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId, code: "4100", name_ar: "إيراد", name_en: "Revenue",
      category: "REVENUE", normal_balance: "CREDIT",
    })
    .select("id")
    .single();

  const dueTypeName = `نوع بلا صنف ${label} ${Date.now()}`;
  const { data: dueType, error: dtErr } = await admin
    .from("due_types")
    .insert({
      organization_id: orgId,
      default_revenue_account_id: revenue!.id,
      name_ar: dueTypeName,
      name_en: dueTypeName,
      is_active: true,
    })
    .select("id")
    .single();
  expect(dtErr, `due_type insert failed: ${dtErr?.message}`).toBeNull();

  const email = `e2e-items-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email, password: STAFF_PASSWORD, email_confirm: true,
  });
  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin
    .from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });

  return { orgId, email, dueTypeId: dueType!.id as string, dueTypeName };
}

async function cleanUp(admin: SupabaseClient, orgId: string) {
  await admin.from("due_types").delete().eq("organization_id", orgId);
  await admin.from("catalogue_items").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
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

test("an item is created, linked, and the gap disappears", async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Owner", "TENANT_OWNER");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice-items");

  // The page renders at all: a server component importing from a "use client"
  // module can fail in ways tsc and the build both accept.
  await expect(page.getByRole("heading", { name: /E-Document Items/i })).toBeVisible();

  // The unlinked type is SHOWN. Absent from the screen would read as "nothing to
  // do", which is the opposite of the truth.
  const card = page.locator(`[data-due-type="${org.dueTypeId}"]`);
  await expect(card).toHaveAttribute("data-linked", "unlinked");
  await expect(page.locator('[data-gap="ITEM_LINK_MISSING"]').first()).toBeVisible();

  // An invalid GS1 is refused with an explanation rather than a raw constraint.
  await page.locator("#code-new").fill("SVC-1");
  await page.locator("#ar-new").fill("خدمة");
  await page.locator("#en-new").fill("Service");
  await page.locator("#type-new").selectOption("GS1");
  await page.locator("#itemcode-new").fill("12345");
  await page.getByRole("button", { name: /Save item/i }).click();
  await expect(page.getByText(/digits only, of length/i)).toBeVisible({ timeout: 15_000 });

  // A valid one is accepted.
  await page.locator("#code-new").fill("SVC-1");
  await page.locator("#ar-new").fill("خدمة");
  await page.locator("#en-new").fill("Service");
  await page.locator("#type-new").selectOption("GS1");
  await page.locator("#itemcode-new").fill("6221033010113");
  await page.getByRole("button", { name: /Save item/i }).click();
  await expect(page.locator('[data-item-code="SVC-1"]')).toBeVisible({ timeout: 15_000 });

  // Link it, and the type moves out of the gap list.
  const linkCard = page.locator(`[data-due-type="${org.dueTypeId}"]`);
  // selectOption by label takes a string, not a regex.
  await linkCard.locator(`#item-${org.dueTypeId}`).selectOption({ label: "Service · SVC-1" });
  await linkCard.getByRole("button", { name: /^Link$/i }).click();

  await expect(page.locator(`[data-due-type="${org.dueTypeId}"]`))
    .toHaveAttribute("data-linked", "coded", { timeout: 15_000 });
  await expect(page.locator('[data-gap="ITEM_LINK_MISSING"]')).toHaveCount(0);

  const { data: dueType } = await admin
    .from("due_types").select("catalogue_item_id").eq("id", org.dueTypeId).single();
  expect(dueType!.catalogue_item_id, "the link is real, not just rendered").not.toBeNull();

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("a user without the permission is told so, and gets no controls", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // CASHIER holds no finance.einvoice.* permission.
  const org = await setUpOrg(admin, "NoPerm", "CASHIER");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice-items");

  const body = await page.locator("body").innerText();
  expect(body).toMatch(/don't have permission/i);
  expect(body, "internal detail must not leak").not.toContain(org.dueTypeName);
  await expect(page.getByRole("button", { name: /Save item/i })).toHaveCount(0);

  await ctx.close();
  await cleanUp(admin, org.orgId);
});
