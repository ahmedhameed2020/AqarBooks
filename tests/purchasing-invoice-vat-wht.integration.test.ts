/**
 * deferred_purchasing_vat_wht_baseline: proves post_supplier_invoice's live
 * signature (confirmed via pg_get_function_identity_arguments -- 15
 * positional args: p_organization_id, p_resort_id, p_supplier_id,
 * p_purchase_order_id, p_invoice_number, p_expense_account_id,
 * p_net_amount, p_discount_amount, p_vat_rate, p_vat_account_id,
 * p_wht_rate, p_wht_account_id, p_invoice_date, p_due_date,
 * p_fiscal_period_id) works end to end with real VAT/WHT rates, called
 * with the exact same named-argument shape lib/actions/purchasing.ts's
 * postSupplierInvoiceAction now sends (previously it sent a stale
 * p_amount that doesn't exist in this signature at all -- a real
 * tsc/build failure, not just a missing-feature gap).
 *
 * No existing test in this repo exercised VAT/WHT rates at all
 * (supabase/tests/phase6_purchasing_integrity.sql always passes 0/null
 * for them) -- this closes that real coverage gap too.
 *
 * Fixture conventions match tests/payments/resolve-credentials.test.ts:
 * real Supabase, no mocks, a genuinely authenticated TENANT_OWNER staff
 * session (service-role has no auth.uid() and cannot pass the
 * has_financial_permission()-gated RPC under test).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

describe("post_supplier_invoice VAT/WHT (real Supabase, no mocks)", () => {
  let admin: SupabaseClient;
  let staffClient: SupabaseClient;
  let orgId: string;
  let resortId: string;
  let supplierId: string;
  let expenseAccountId: string;
  let vatAccountId: string;
  let whtAccountId: string;
  let payableAccountId: string;
  let periodId: string;
  const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: "Purchasing VAT/WHT Test Org", slug: `pvw-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
      .select("id")
      .single();
    expect(orgErr, orgErr?.message).toBeNull();
    orgId = org!.id;

    const { data: resort, error: resortErr } = await admin
      .from("properties")
      .insert({ organization_id: orgId, name: "PVW Resort", code: `PVW-${runSuffix}`, timezone: "Africa/Cairo", property_type: "resort" })
      .select("id")
      .single();
    expect(resortErr, resortErr?.message).toBeNull();
    resortId = resort!.id;

    // Staff session set up early: clone_chart_of_accounts_template,
    // create_fiscal_year, and set_fiscal_period_status all require a real
    // auth.uid() (has_permission-gated) -- the service-role client has
    // none, same lesson already captured in
    // tests/pgtap.integration.test.ts's own fixtures.
    const { error: cloneRolesErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
    expect(cloneRolesErr, cloneRolesErr?.message).toBeNull();

    const { data: ownerRole, error: ownerRoleErr } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRoleErr, ownerRoleErr?.message).toBeNull();

    const staffEmail = `pvw-staff-${runSuffix}@aqarbooks-test.local`;
    const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(staffCreateErr, staffCreateErr?.message).toBeNull();

    const { error: membershipErr } = await admin
      .from("organization_memberships")
      .insert({ organization_id: orgId, user_id: staffCreated!.user!.id, status: "active" });
    expect(membershipErr, membershipErr?.message).toBeNull();

    const { error: assignErr } = await admin
      .from("user_role_assignments")
      .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: orgId });
    expect(assignErr, assignErr?.message).toBeNull();

    staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: TEST_PASSWORD });
    expect(signInErr, signInErr?.message).toBeNull();

    const { error: cloneCoaErr } = await staffClient.rpc("clone_chart_of_accounts_template", {
      p_organization_id: orgId,
      p_template_key: "RESORT_STANDARD",
    });
    expect(cloneCoaErr, cloneCoaErr?.message).toBeNull();

    const { data: expenseAcc } = await admin
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", "5200")
      .single();
    expenseAccountId = expenseAcc!.id;

    const { data: payableAcc } = await admin
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", "2100")
      .single();
    payableAccountId = payableAcc!.id;

    // Two dedicated liability accounts for VAT/WHT -- mirrors what a real
    // organization's chart of accounts would have (not part of the seeded
    // RESORT_STANDARD template, so created directly here).
    const { data: vatAcc, error: vatAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
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
    vatAccountId = vatAcc!.id;

    const { data: whtAcc, error: whtAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `2210-${runSuffix}`,
        name_ar: "خصم تحت حساب الضريبة مستحق",
        name_en: "WHT Payable",
        category: "LIABILITY",
        normal_balance: "CREDIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();
    expect(whtAccErr, whtAccErr?.message).toBeNull();
    whtAccountId = whtAcc!.id;

    const { data: supplier, error: supplierErr } = await admin
      .from("suppliers")
      .insert({ organization_id: orgId, name: "PVW Test Supplier", payable_account_id: payableAccountId })
      .select("id")
      .single();
    expect(supplierErr, supplierErr?.message).toBeNull();
    supplierId = supplier!.id;

    const { data: yearId, error: yearErr } = await staffClient.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "PVW Test Year",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });
    expect(yearErr, yearErr?.message).toBeNull();

    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId as string)
      .eq("period_number", 1)
      .single();
    expect(periodErr, periodErr?.message).toBeNull();
    periodId = period!.id;

    const { error: openErr } = await staffClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodId,
      p_status: "OPEN",
      p_reason: "test setup",
    });
    expect(openErr, openErr?.message).toBeNull();
  }, 60000);

  afterAll(async () => {
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("posts an invoice with VAT + WHT, matching the exact argument names postSupplierInvoiceAction sends, with correct computed amounts", async () => {
    // Same p_* argument names/order as lib/actions/purchasing.ts's RPC call
    // after the fix -- net 1000, 5% discount... no discount here (0), 14%
    // VAT, 5% WHT.
    const { data: invoiceId, error } = await staffClient.rpc("post_supplier_invoice", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_supplier_id: supplierId,
      p_purchase_order_id: null,
      p_invoice_number: `PVW-INV-${runSuffix}`,
      p_expense_account_id: expenseAccountId,
      p_net_amount: 1000,
      p_discount_amount: 0,
      p_vat_rate: 14,
      p_vat_account_id: vatAccountId,
      p_wht_rate: 5,
      p_wht_account_id: whtAccountId,
      p_invoice_date: "2026-01-10",
      p_due_date: "2026-02-10",
      p_fiscal_period_id: periodId,
    });
    expect(error, error?.message).toBeNull();
    expect(invoiceId).toBeTruthy();

    const { data: invoice, error: readErr } = await admin
      .from("supplier_invoices")
      .select("net_amount, discount_amount, vat_rate, vat_amount, vat_account_id, wht_rate, wht_amount, wht_account_id, amount, journal_entry_id")
      .eq("id", invoiceId as string)
      .single();
    expect(readErr, readErr?.message).toBeNull();

    expect(Number(invoice!.net_amount)).toBe(1000);
    expect(Number(invoice!.discount_amount)).toBe(0);
    expect(Number(invoice!.vat_rate)).toBe(14);
    // 1000 * 14% = 140
    expect(Number(invoice!.vat_amount)).toBe(140);
    expect(invoice!.vat_account_id).toBe(vatAccountId);
    expect(Number(invoice!.wht_rate)).toBe(5);
    // 1000 * 5% = 50 -- tracked on the invoice, even though (as documented
    // in the RPC's own journal-entry construction) WHT does not currently
    // reduce the payable/journal amounts -- that is a separate, real
    // accounting question, out of scope for this fix (which only closes
    // the tsc/build gap and adds real VAT/WHT input collection).
    expect(Number(invoice!.wht_amount)).toBe(50);
    expect(invoice!.wht_account_id).toBe(whtAccountId);
    // gross = net - discount + VAT = 1000 - 0 + 140 = 1140
    expect(Number(invoice!.amount)).toBe(1140);

    // Journal entry balances: expense 1000 + VAT 140 debited, payable 1140
    // credited.
    const { data: lines, error: linesErr } = await admin
      .from("journal_entry_lines")
      .select("account_id, debit, credit")
      .eq("journal_entry_id", invoice!.journal_entry_id as string);
    expect(linesErr, linesErr?.message).toBeNull();
    const debitTotal = (lines ?? []).reduce((s, l) => s + Number(l.debit), 0);
    const creditTotal = (lines ?? []).reduce((s, l) => s + Number(l.credit), 0);
    expect(debitTotal).toBe(1140);
    expect(creditTotal).toBe(1140);

    const vatLine = (lines ?? []).find((l) => l.account_id === vatAccountId);
    expect(Number(vatLine?.debit)).toBe(140);
  });

  it("rejects a VAT rate above zero without a VAT account -- proves the account-required validation this form's optional VAT account field must respect", async () => {
    const { error } = await staffClient.rpc("post_supplier_invoice", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_supplier_id: supplierId,
      p_purchase_order_id: null,
      p_invoice_number: `PVW-INV-NOVAT-${runSuffix}`,
      p_expense_account_id: expenseAccountId,
      p_net_amount: 500,
      p_discount_amount: 0,
      p_vat_rate: 14,
      p_vat_account_id: null,
      p_wht_rate: 0,
      p_wht_account_id: null,
      p_invoice_date: "2026-01-10",
      p_due_date: "2026-02-10",
      p_fiscal_period_id: periodId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("VAT account is required");
  });

  it("posts a zero-VAT/zero-WHT invoice exactly as before (no accounts required) -- proves the fix does not break the plain no-tax case", async () => {
    const { data: invoiceId, error } = await staffClient.rpc("post_supplier_invoice", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_supplier_id: supplierId,
      p_purchase_order_id: null,
      p_invoice_number: `PVW-INV-PLAIN-${runSuffix}`,
      p_expense_account_id: expenseAccountId,
      p_net_amount: 300,
      p_discount_amount: 0,
      p_vat_rate: 0,
      p_vat_account_id: null,
      p_wht_rate: 0,
      p_wht_account_id: null,
      p_invoice_date: "2026-01-10",
      p_due_date: "2026-02-10",
      p_fiscal_period_id: periodId,
    });
    expect(error, error?.message).toBeNull();
    const { data: invoice } = await admin.from("supplier_invoices").select("amount").eq("id", invoiceId as string).single();
    expect(Number(invoice!.amount)).toBe(300);
  });
});
