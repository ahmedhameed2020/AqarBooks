import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const password = "Lease_Renewal_UI_2026!";

type Actor = { userId: string; email: string };
type Fixture = {
  orgId: string;
  propertyAId: string;
  propertyBId: string;
  unitAId: string;
  unitBId: string;
  leaseAId: string;
  leaseBId: string;
  tenant: Actor;
  owner: Actor;
  manager: Actor;
};

let fixture: Fixture;
let admin: SupabaseClient;

async function createUser(label: string): Promise<Actor> {
  const email = `renewal-ui-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  return { userId: data.user!.id, email };
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin.from("organizations").insert({
    name: `Renewal UI ${suffix}`,
    slug: `renewal-ui-${suffix}`,
    default_currency: "EGP",
    status: "ACTIVE",
  }).select("id").single();
  expect(orgError).toBeNull();
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  const { data: plan } = await admin.from("plans").select("id").eq("key", "PROFESSIONAL").single();
  expect((await admin.from("subscriptions").insert({ organization_id: org!.id, plan_id: plan!.id, status: "ACTIVE" })).error).toBeNull();

  const { data: properties, error: propertyError } = await admin.from("properties").insert([
    { organization_id: org!.id, name: "Renewal Property A", code: `RUA-${suffix}`, timezone: "Africa/Cairo", property_type: "resort" },
    { organization_id: org!.id, name: "Renewal Property B", code: `RUB-${suffix}`, timezone: "Asia/Qatar", property_type: "resort" },
  ]).select("id,code");
  expect(propertyError).toBeNull();
  const propertyAId = properties!.find((row) => row.code.startsWith("RUA"))!.id;
  const propertyBId = properties!.find((row) => row.code.startsWith("RUB"))!.id;
  const { data: units, error: unitError } = await admin.from("units").insert([
    { organization_id: org!.id, property_id: propertyAId, code: "RENEW-A" },
    { organization_id: org!.id, property_id: propertyBId, code: "RENEW-B" },
  ]).select("id,code");
  expect(unitError).toBeNull();
  const unitAId = units!.find((row) => row.code === "RENEW-A")!.id;
  const unitBId = units!.find((row) => row.code === "RENEW-B")!.id;

  const tenant = await createUser("tenant");
  const owner = await createUser("owner");
  const manager = await createUser("manager");
  const { data: members, error: memberError } = await admin.from("members").insert([
    { organization_id: org!.id, full_name: "Portal Tenant QA", email: tenant.email, user_id: tenant.userId },
    { organization_id: org!.id, full_name: "Portal Owner QA", email: owner.email, user_id: owner.userId },
  ]).select("id,email");
  expect(memberError).toBeNull();
  const tenantMemberId = members!.find((row) => row.email === tenant.email)!.id;
  const ownerMemberId = members!.find((row) => row.email === owner.email)!.id;
  expect((await admin.from("unit_ownerships").insert([
    { organization_id: org!.id, unit_id: unitAId, member_id: ownerMemberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: org!.id, unit_id: unitBId, member_id: ownerMemberId, share_percentage: 100, start_date: "2020-01-01" },
  ])).error).toBeNull();

  const { data: receivable } = await admin.from("chart_of_accounts").insert({
    organization_id: org!.id, code: `110-${suffix}`, name_ar: "ذمم إيجار", name_en: "Rent receivable", category: "ASSET", normal_balance: "DEBIT",
  }).select("id").single();
  const { data: revenue } = await admin.from("chart_of_accounts").insert({
    organization_id: org!.id, code: `410-${suffix}`, name_ar: "إيراد إيجار", name_en: "Rent revenue", category: "REVENUE", normal_balance: "CREDIT",
  }).select("id").single();
  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: org!.id, name_ar: "إيجار", name_en: "Rent", default_revenue_account_id: revenue!.id,
  }).select("id").single();
  const leaseBase = {
    organization_id: org!.id,
    tenant_member_id: tenantMemberId,
    due_type_id: dueType!.id,
    receivable_account_id: receivable!.id,
    status: "ACTIVE",
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    rent_amount: 12000,
    rent_frequency: "MONTHLY",
    security_deposit_amount: 1000,
    billing_recipient: "TENANT",
  };
  const { data: leases, error: leaseError } = await admin.from("unit_leases").insert([
    { ...leaseBase, property_id: propertyAId, unit_id: unitAId },
    { ...leaseBase, property_id: propertyBId, unit_id: unitBId },
  ] as never).select("id,unit_id");
  expect(leaseError).toBeNull();
  const leaseAId = leases!.find((row) => row.unit_id === unitAId)!.id;
  const leaseBId = leases!.find((row) => row.unit_id === unitBId)!.id;

  expect((await admin.from("organization_memberships").insert({ organization_id: org!.id, user_id: manager.userId, status: "active" })).error).toBeNull();
  const { data: managerRole } = await admin.from("roles").select("id").eq("organization_id", org!.id).eq("key", "PROPERTY_MANAGER").single();
  expect((await admin.from("user_role_assignments").insert({
    user_id: manager.userId, role_id: managerRole!.id, organization_id: org!.id, property_id: propertyAId,
  })).error).toBeNull();

  const tenantClient = createClient(url, anonKey, { auth: { persistSession: false } });
  await tenantClient.auth.signInWithPassword({ email: tenant.email, password });
  const { error: requestError } = await tenantClient.rpc("request_lease_renewal", {
    p_lease_id: leaseAId,
    p_proposed_starts_on: "2027-01-01",
    p_proposed_ends_on: "2027-12-31",
    p_proposed_rent_amount: 12500,
    p_proposed_rent_frequency: "MONTHLY",
    p_note: "Private tenant note for staff only",
  });
  expect(requestError).toBeNull();

  return { orgId: org!.id, propertyAId, propertyBId, unitAId, unitBId, leaseAId, leaseBId, tenant, owner, manager };
}

async function cleanup() {
  await admin.from("lease_renewal_transitions").delete().eq("organization_id", fixture.orgId);
  await admin.from("lease_renewal_requests").delete().eq("organization_id", fixture.orgId);
  await admin.from("unit_leases").delete().eq("organization_id", fixture.orgId);
  await admin.from("unit_ownerships").delete().eq("organization_id", fixture.orgId);
  await admin.from("due_types").delete().eq("organization_id", fixture.orgId);
  await admin.from("chart_of_accounts").delete().eq("organization_id", fixture.orgId);
  await admin.from("members").delete().eq("organization_id", fixture.orgId);
  await admin.from("units").delete().eq("organization_id", fixture.orgId);
  await admin.from("properties").delete().eq("organization_id", fixture.orgId);
  await admin.from("user_role_assignments").delete().eq("organization_id", fixture.orgId);
  await admin.from("organization_memberships").delete().eq("organization_id", fixture.orgId);
  await admin.from("subscriptions").delete().eq("organization_id", fixture.orgId);
  await admin.from("roles").delete().eq("organization_id", fixture.orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", fixture.orgId);
  await admin.from("organizations").delete().eq("id", fixture.orgId);
  for (const actor of [fixture.tenant, fixture.owner, fixture.manager]) await admin.auth.admin.deleteUser(actor.userId);
}

async function signInPortal(page: Page, locale: "ar" | "en", actor: Actor) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: actor.email, password });
  expect(error).toBeNull();
  const accessToken = encodeURIComponent(data.session!.access_token);
  const refreshToken = encodeURIComponent(data.session!.refresh_token);
  await page.goto(`/${locale}/portal/accept-invite?invitation=qa&t=qa#access_token=${accessToken}&refresh_token=${refreshToken}`);
  await expect(page.getByLabel(/رمز الدخول|access code/i)).toBeVisible();
  await page.goto(`/${locale}/portal`);
  await page.waitForURL(new RegExp(`/${locale}/portal$`));
}

async function signInStaff(page: Page, locale: "ar" | "en", actor: Actor) {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(actor.email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /تسجيل الدخول|Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|property)/, { timeout: 20_000 });
}

function observe(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Playwright's input instrumentation adds this inline caret style before
    // React hydrates. It is the only attribute in the resulting warning.
    if (text.includes("hydrated") && text.includes('caret-color:"transparent"')) return;
    errors.push(text);
  });
  return errors;
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test.describe.serial("lease renewal product experience", () => {
  test.setTimeout(120_000);
  test.beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    fixture = await setupFixture();
  });

  test.afterAll(async () => cleanup());

  test("tenant sees only supported renewal actions in English desktop and Arabic mobile", async ({ browser }) => {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const desktopErrors = observe(desktop);
    await signInPortal(desktop, "en", fixture.tenant);
    await desktop.goto("/en/portal/leases");
    await expect(desktop.getByRole("heading", { name: "Leases & renewals" })).toBeVisible();
    await expect(desktop.getByRole("link", { name: "View renewal status" })).toHaveCount(2);
    await expect(desktop.locator(`a[href$="/portal/leases/${fixture.leaseAId}/renewal"]`)).toBeVisible();
    await expect(desktop.locator(`a[href$="/portal/leases/${fixture.leaseBId}/renewal"]`)).toBeVisible();
    await desktop.screenshot({ path: "test-results/lease-renewal-tenant-en-desktop.png", fullPage: true });
    await desktop.goto(`/en/portal/leases/${fixture.leaseBId}/renewal`);
    await expect(desktop.getByRole("heading", { name: "Renewal status" })).toBeVisible();
    await expect(desktop.getByRole("button", { name: "Submit renewal request" })).toBeVisible();
    await expect(desktop.getByRole("button", { name: /activate|cancel/i })).toHaveCount(0);
    await expectNoOverflow(desktop);
    expect(desktopErrors).toEqual([]);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const mobileErrors = observe(mobile);
    await signInPortal(mobile, "ar", fixture.tenant);
    await mobile.goto(`/ar/portal/leases/${fixture.leaseAId}/renewal`);
    await expect(mobile.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(mobile.getByRole("heading", { name: "حالة التجديد" })).toBeVisible();
    await expect(mobile.getByText("قيد المراجعة")).toBeVisible();
    await mobile.screenshot({ path: "test-results/lease-renewal-tenant-ar-mobile.png", fullPage: true });
    await expectNoOverflow(mobile);
    expect(mobileErrors).toEqual([]);
  });

  test("current owner receives the narrow status projection", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = observe(page);
    await signInPortal(page, "en", fixture.owner);
    await page.goto("/en/portal/leases");
    await expect(page.getByText("Current owner — status only").first()).toBeVisible();
    await page.locator(`a[href$="/portal/leases/${fixture.leaseAId}/renewal"]`).click();
    await expect(page.getByRole("heading", { name: "Renewal status" })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toContain("A narrow renewal-status view");
    expect(body).not.toContain("Portal Tenant QA");
    expect(body).not.toContain("Private tenant note");
    expect(body).not.toContain("12,500");
    await expect(page.getByRole("button", { name: /submit|approve|reject|cancel|activate/i })).toHaveCount(0);
    await page.screenshot({ path: "test-results/lease-renewal-owner-en-desktop.png", fullPage: true });
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });

  test("property-scoped staff manages property A without renewal access in property B", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = observe(page);
    await signInStaff(page, "en", fixture.manager);
    await page.goto(`/en/property/${fixture.unitAId}?tab=lease`);
    await expect(page.getByRole("heading", { name: "Lease renewal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    await page.screenshot({ path: "test-results/lease-renewal-staff-en-desktop.png", fullPage: true });
    await page.goto(`/en/property/${fixture.unitBId}?tab=lease`);
    await expect(page.getByRole("heading", { name: "Lease renewal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Create request|Approve|Reject/ })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ar/property/${fixture.unitAId}?tab=lease`);
    await expect(page.getByRole("heading", { name: "تجديد العقد" })).toBeVisible();
    await page.screenshot({ path: "test-results/lease-renewal-staff-ar-mobile.png", fullPage: true });
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });
});
