/**
 * deferred_purchasing_vat_wht_baseline: proves the real /finance/suppliers
 * PostInvoiceForm's field names (name="netAmount"/"discountAmount"/
 * "vatRate"/"vatAccountId"/"whtRate"/"whtAccountId") actually wire up to
 * postSupplierInvoiceAction's zod schema keys correctly -- the exact class
 * of bug that broke silently before (a stale p_amount the live RPC no
 * longer accepts at all). tests/purchasing-invoice-vat-wht.integration.test.ts
 * already proves the RPC itself is correct when called with the right
 * argument names; this proves the browser form actually sends them.
 *
 * Fixture conventions match tests/e2e/payment-provider-settings.spec.ts /
 * tests/e2e/aging-report-permission-gate.spec.ts: service-role admin
 * client for setup, a genuinely authenticated TENANT_OWNER staff browser
 * session for the has_financial_permission-gated page/action.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

test("staff posts a supplier invoice with VAT + WHT through the real form, and the correct gross amount appears in the list", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const runSuffix = `${Date.now()}`;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: "E2E Invoice VAT Org", slug: `e2e-inv-vat-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgErr, orgErr?.message).toBeNull();

  const { data: resort, error: resortErr } = await admin
    .from("properties")
    .insert({ organization_id: org!.id, name: "E2E Invoice Resort", code: `EIV-${runSuffix}`, timezone: "Africa/Cairo", property_type: "resort" })
    .select("id")
    .single();
  expect(resortErr, resortErr?.message).toBeNull();

  const { error: cloneRolesErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneRolesErr).toBeNull();

  const { data: ownerRole, error: ownerRoleErr } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(ownerRoleErr, ownerRoleErr?.message).toBeNull();

  const staffEmail = `e2e-inv-vat-staff-${runSuffix}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr, staffCreateErr?.message).toBeNull();

  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr, membershipErr?.message).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: org!.id });
  expect(assignErr, assignErr?.message).toBeNull();

  const staffClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: STAFF_PASSWORD });
  expect(signInErr, signInErr?.message).toBeNull();

  const { error: cloneCoaErr } = await staffClient.rpc("clone_chart_of_accounts_template", {
    p_organization_id: org!.id,
    p_template_key: "RESORT_STANDARD",
  });
  expect(cloneCoaErr, cloneCoaErr?.message).toBeNull();

  const { data: payableAcc } = await admin
    .from("chart_of_accounts")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("code", "2100")
    .single();

  const { data: vatAcc, error: vatAccErr } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: org!.id,
      code: `2200-${runSuffix}`,
      name_ar: "ضريبة القيمة المضافة مستحقة",
      name_en: "VAT Payable",
      category: "LIABILITY",
      normal_balance: "CREDIT",
      is_group: false,
      is_active: true,
    })
    .select("id")
    .single();
  expect(vatAccErr, vatAccErr?.message).toBeNull();

  const { error: supplierErr } = await admin
    .from("suppliers")
    .insert({ organization_id: org!.id, name: "E2E Invoice Supplier", payable_account_id: payableAcc!.id });
  expect(supplierErr, supplierErr?.message).toBeNull();

  const { data: yearId, error: yearErr } = await staffClient.rpc("create_fiscal_year", {
    p_organization_id: org!.id,
    p_name: "E2E Invoice Year",
    p_start_date: "2026-01-01",
    p_end_date: "2026-12-31",
  });
  expect(yearErr, yearErr?.message).toBeNull();

  const { data: period } = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("fiscal_year_id", yearId as string)
    .eq("period_number", 1)
    .single();

  const { error: openErr } = await staffClient.rpc("set_fiscal_period_status", {
    p_fiscal_period_id: period!.id,
    p_status: "OPEN",
    p_reason: "e2e setup",
  });
  expect(openErr, openErr?.message).toBeNull();

  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/suppliers");

  // Scope everything to PostInvoiceForm specifically -- this page also
  // renders CreateSupplierForm/CreateRequestForm/CreateOrderForm above it,
  // each with their own comboboxes, so unscoped nth()/getByRole() selectors
  // would be ambiguous.
  const form = page.locator("form").filter({ has: page.locator('input[name="netAmount"]') });

  const invoiceNumber = `E2E-INV-${runSuffix}`;
  await form.locator('input[name="invoiceNumber"]').fill(invoiceNumber);
  await form.locator('input[name="netAmount"]').fill("1000");
  await form.locator('input[name="vatRate"]').fill("14");
  await form.locator('input[name="invoiceDate"]').fill("2026-01-15");
  await form.locator('input[name="dueDate"]').fill("2026-02-15");

  // Supplier/expense-account/fiscal-period/VAT-account are @base-ui Select
  // comboboxes -- each one renders BOTH a hidden native <select> (for real
  // form-field semantics/FormData submission) and the visible custom
  // popover UI, so an unscoped getByRole("option") can resolve to the
  // hidden native <option> instead of the real, clickable one. Scope to
  // the visible listbox popup that opens after clicking the trigger.
  async function pickOption(comboboxIndex: number, optionName?: string | RegExp) {
    await form.getByRole("combobox").nth(comboboxIndex).click();
    const listbox = page.getByRole("listbox");
    await listbox.waitFor({ state: "visible" });
    const option = optionName ? listbox.getByRole("option", { name: optionName }) : listbox.getByRole("option").first();
    await option.click();
  }

  // In this form's own DOM order: supplier, expense account, fiscal
  // period, VAT account, WHT account.
  await pickOption(0, "E2E Invoice Supplier");
  await pickOption(1);
  await pickOption(2);
  await pickOption(3, /VAT Payable/);

  await form.getByRole("button", { name: "Post supplier invoice" }).click();

  // Gross = net 1000 + VAT (14% of 1000) 140 = 1140.
  const row = page.locator("tr", { hasText: invoiceNumber });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("1140.00");

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});
