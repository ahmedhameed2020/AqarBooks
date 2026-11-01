# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: asset-disposal.spec.ts >> disposal is refused until the accounts are designated, then succeeds and closes the asset
- Location: tests\e2e\asset-disposal.spec.ts:117:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-asset="FA-20694207"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-asset="FA-20694207"]')

```

```yaml
- banner:
  - link "AqarBooks ERP Smart Real Estate Accounting":
    - /url: /en
  - text: Live Cloud Sync
  - button "Search accounts, units, reports... ⌘K"
  - button "Quick Action"
  - button "Notifications"
  - link "العربية":
    - /url: /ar/finance/assets
- complementary:
  - button "Collapse Sidebar"
  - textbox "Search..."
  - text: ⌘K
  - navigation:
    - link "Dashboard":
      - /url: /en/dashboard
    - button "Pin to top"
    - button "Properties & Operations"
    - link "Entities & Resorts":
      - /url: /en/admin/resorts
    - button "Pin to top"
    - link "Units Management":
      - /url: /en/property
    - button "Pin to top"
    - button "Expand"
    - link "All Units":
      - /url: /en/property
    - link "Rent Roll Schedule":
      - /url: /en/finance/reports/rent-roll
    - link "Lease Expirations":
      - /url: /en/finance/reports/lease-expirations
    - link "Bulk Import":
      - /url: /en/import
    - link "Members & Owners":
      - /url: /en/members
    - button "Pin to top"
    - button "Expand"
    - link "Members Directory":
      - /url: /en/members
    - link "Owner Statements":
      - /url: /en/finance/reports/owner-statement
    - link "Maintenance Operations":
      - /url: /en/operations/maintenance
    - button "Pin to top"
    - button "Expand"
    - link "Maintenance Requests":
      - /url: /en/operations/maintenance
    - link "Work Orders":
      - /url: /en/operations/maintenance/work-orders
    - link "Operations Dashboard":
      - /url: /en/operations
    - button "Pin to top"
    - link "Access / Visitors":
      - /url: /en/operations/visitors
    - button "Pin to top"
    - button "Expand"
    - link "Visitor Passes":
      - /url: /en/operations/visitors
    - link "Gate Scanner":
      - /url: /en/operations/gate
    - link "Gate Management":
      - /url: /en/operations/gates
    - link "Access Event Ledger":
      - /url: /en/operations/access-events
    - link "Live Visitor Occupancy":
      - /url: /en/operations/gate/occupancy
    - button "Pin to top"
    - link "Vehicle Registry":
      - /url: /en/operations/vehicles
    - button "Pin to top"
    - link "Amenities & Bookings":
      - /url: /en/operations/amenities
    - button "Pin to top"
    - button "Finance & Accounting"
    - link "Chart of Accounts":
      - /url: /en/finance/accounts
    - button "Pin to top"
    - button "Collapse"
    - link "Accounts Tree":
      - /url: /en/finance/accounts
    - link "Journal Entries":
      - /url: /en/finance/journals
    - link "Fiscal Periods":
      - /url: /en/admin/finance/periods
    - link "Fiscal Budgets":
      - /url: /en/finance/budgets
    - link "Fixed Assets":
      - /url: /en/finance/assets
    - link "Projects & WIP":
      - /url: /en/finance/projects
    - link "Exchange Rates":
      - /url: /en/finance/exchange-rates
    - link "Designated Accounts":
      - /url: /en/admin/finance/accounting-accounts
    - link "General Ledger":
      - /url: /en/finance/reports/general-ledger
    - link "Receivables & Billing":
      - /url: /en/finance/dues
    - button "Pin to top"
    - button "Expand"
    - link "Dues & Invoices":
      - /url: /en/finance/dues
    - link "Receipt Vouchers":
      - /url: /en/finance/payments
    - link "Service Charges":
      - /url: /en/finance/service-charges
    - link "Collections":
      - /url: /en/finance/dunning
    - link "CAM Allocation":
      - /url: /en/finance/reports/cam-allocation
    - link "AR Aging":
      - /url: /en/finance/reports/aging
    - link "Treasury & Banking":
      - /url: /en/finance/cashier
    - button "Pin to top"
    - button "Expand"
    - link "Cashier":
      - /url: /en/finance/cashier
    - link "Bank Accounts":
      - /url: /en/finance/banks
    - link "PDC Register":
      - /url: /en/finance/reports/pdc
    - link "Cash Runway Forecast":
      - /url: /en/finance/reports/cash-flow-forecast
    - link "Bank Reconciliation":
      - /url: /en/finance/banks/reconciliation
    - link "Purchasing & Payables":
      - /url: /en/finance/suppliers
    - button "Pin to top"
    - button "Expand"
    - link "Vendors & Suppliers":
      - /url: /en/finance/suppliers
    - link "Expense Vouchers":
      - /url: /en/finance/expenses
    - link "AP Aging":
      - /url: /en/finance/reports/ap-aging
    - link "CAPEX vs OPEX":
      - /url: /en/finance/reports/capex-opex
    - link "Broker Commissions":
      - /url: /en/finance/commissions
    - button "Financial Reports"
    - link "Reports Hub (19 Reports)":
      - /url: /en/finance/reports
    - button "Pin to top"
    - button "Expand"
    - link "Trial Balance":
      - /url: /en/finance/reports/trial-balance
    - link "Income Statement":
      - /url: /en/finance/reports/income-statement
    - link "Balance Sheet":
      - /url: /en/finance/reports/balance-sheet
    - link "Cash Flow Statement":
      - /url: /en/finance/reports/cash-flow
    - link "Property-Level P&L":
      - /url: /en/finance/reports/property-pnl
    - link "Fixed Assets & NBV":
      - /url: /en/finance/reports/fixed-assets
    - link "Budget vs Actual":
      - /url: /en/finance/reports/budget-vs-actual
    - link "Audit Trail & Logs":
      - /url: /en/finance/reports/audit-trail
    - button "Tax & Compliance"
    - link "E-Invoicing & VAT":
      - /url: /en/finance/einvoice
    - button "Pin to top"
    - button "Expand"
    - link "Tax Invoices Log":
      - /url: /en/finance/einvoice
    - link "VAT Return Statement":
      - /url: /en/finance/reports/vat-return
    - link "Tax Mapping":
      - /url: /en/finance/tax-mapping
    - link "GS1 / EGS Item Codes":
      - /url: /en/finance/einvoice-items
    - button "Settings & Account"
    - link "My Account & Security":
      - /url: /en/account
    - button "Pin to top"
    - button "Expand"
    - link "Profile & Password":
      - /url: /en/account
    - link "Notification Center":
      - /url: /en/notifications
    - link "Organization Profile":
      - /url: /en/admin
    - link "Team & Users":
      - /url: /en/admin/users
    - link "Roles & Permissions":
      - /url: /en/admin/roles
    - link "AI Governance & Pilot":
      - /url: /en/admin/ai-governance
    - link "Payment Gateways":
      - /url: /en/finance/payment-providers
  - link "E E2E Disp UI 1793220694207 e2e-disp-owner-1793220694207@aqarbooks-test.local Tenant Owner • E2E Disp UI 1793220694207":
    - /url: /en/account
    - text: E
    - paragraph: E2E Disp UI 1793220694207
    - paragraph: e2e-disp-owner-1793220694207@aqarbooks-test.local
    - text: Tenant Owner • E2E Disp UI 1793220694207
  - link "Account":
    - /url: /en/account
  - button "Sign Out"
- main:
  - heading "Fixed Assets & Depreciation" [level=1]
  - text: Straight-Line
  - paragraph: Fixed assets register, automated straight-line depreciation, journal postings, and disposal tracking.
  - text: Total Acquisition Cost 10,000.00 EGP
  - paragraph: 1 total assets
  - text: Accumulated Depreciation 0.00 EGP 0.0% Net Book Value 10,000.00 EGP
  - paragraph: Current asset balance
  - text: Asset Status 1 Active 0 Disposed
  - textbox "Search by asset code or name..."
  - combobox:
    - option "All Statuses" [selected]
    - option "Active"
    - option "Disposed"
  - button "Print / PDF"
  - button "Export Excel"
  - button "Run Depreciation"
  - button "New Asset"
  - table:
    - rowgroup:
      - row "Code Asset Acquired Cost Accumulated Book Value Status Actions":
        - columnheader "Code"
        - columnheader "Asset"
        - columnheader "Acquired"
        - columnheader "Cost"
        - columnheader "Accumulated"
        - columnheader "Book Value"
        - columnheader "Status"
        - columnheader "Actions"
    - rowgroup:
      - row "FA-20694207 Building مبنى 2026-01-01 10,000.00 EGP 0.00 EGP 0 periods 10,000.00 EGP Active Dispose":
        - cell "FA-20694207"
        - cell "Building مبنى"
        - cell "2026-01-01"
        - cell "10,000.00 EGP"
        - cell "0.00 EGP 0 periods"
        - cell "10,000.00 EGP"
        - cell "Active"
        - cell "Dispose":
          - button "Dispose"
- alert
- region "Notifications"
```

# Test source

```ts
  31  | 
  32  |   const acc = async (code: string, nameEn: string, cat: string, bal: string) => {
  33  |     const { data, error: e } = await admin.from("chart_of_accounts").insert({
  34  |       organization_id: f.orgId, code, name_ar: nameEn, name_en: nameEn,
  35  |       category: cat, normal_balance: bal, is_group: false, is_active: true,
  36  |     }).select("id").single();
  37  |     expect(e, e?.message).toBeNull();
  38  |     return data!.id as string;
  39  |   };
  40  |   const assetAcc = await acc("1210", "Buildings", "ASSET", "DEBIT");
  41  |   const accumAcc = await acc("1220", "Accumulated Depreciation", "ASSET", "DEBIT");
  42  |   const expenseAcc = await acc("5500", "Depreciation Expense", "EXPENSE", "DEBIT");
  43  |   await acc("1010", "Cash", "ASSET", "DEBIT");
  44  |   await acc("5910", "Loss on Disposal", "EXPENSE", "DEBIT");
  45  |   await acc("4910", "Gain on Disposal", "REVENUE", "CREDIT");
  46  | 
  47  |   const { data: property } = await admin.from("properties").insert({
  48  |     organization_id: f.orgId, name: "P", code: `DU-${stamp}`,
  49  |     timezone: "Africa/Cairo", property_type: "building",
  50  |   }).select("id").single();
  51  | 
  52  |   await admin.from("fixed_assets").insert({
  53  |     organization_id: f.orgId, property_id: property!.id, code: f.assetCode,
  54  |     name_ar: "مبنى", name_en: "Building",
  55  |     asset_account_id: assetAcc,
  56  |     accumulated_depreciation_account_id: accumAcc,
  57  |     depreciation_expense_account_id: expenseAcc,
  58  |     acquisition_date: "2026-01-01",
  59  |     acquisition_cost: 10000, salvage_value: 0, useful_life_months: 10,
  60  |   });
  61  | 
  62  |   const email = `e2e-disp-owner-${stamp}@aqarbooks-test.local`;
  63  |   const { data: created } = await admin.auth.admin.createUser({
  64  |     email, password: STAFF_PASSWORD, email_confirm: true,
  65  |   });
  66  |   f.userIds.push(created!.user!.id);
  67  |   await admin.from("organization_memberships")
  68  |     .insert({ organization_id: f.orgId, user_id: created!.user!.id, status: "active" });
  69  |   const { data: role } = await admin.from("roles")
  70  |     .select("id").eq("organization_id", f.orgId).eq("key", "TENANT_OWNER").single();
  71  |   await admin.from("user_role_assignments")
  72  |     .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: f.orgId });
  73  |   f.email = email;
  74  | 
  75  |   // Fiscal calendar through the product RPCs as the signed-in owner (the guard refuses direct writes).
  76  |   const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  77  |   const { error: signInErr } = await ownerClient.auth.signInWithPassword({ email, password: STAFF_PASSWORD });
  78  |   expect(signInErr, `owner sign-in failed: ${signInErr?.message}`).toBeNull();
  79  |   await createOpenFiscalYear(admin, ownerClient, {
  80  |     orgId: f.orgId, name: "FY", startDate: "2026-01-01", endDate: "2026-12-31",
  81  |   });
  82  |   return f;
  83  | }
  84  | 
  85  | async function cleanUp(admin: SupabaseClient, f: Fixture) {
  86  |   const id = f.orgId;
  87  |   const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", id);
  88  |   await admin.from("fixed_asset_depreciation").delete().eq("organization_id", id);
  89  |   await admin.from("fixed_assets").delete().eq("organization_id", id);
  90  |   for (const e of entries ?? []) {
  91  |     await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  92  |   }
  93  |   await admin.from("journal_entries").delete().eq("organization_id", id);
  94  |   // fiscal_years / fiscal_periods are removed by the organization cascade (open rows only; see the guard).
  95  |   await admin.from("platform_audit_logs").delete().eq("organization_id", id);
  96  |   await admin.from("properties").delete().eq("organization_id", id);
  97  |   await admin.from("organizations").update({
  98  |     asset_disposal_gain_account_id: null, asset_disposal_loss_account_id: null,
  99  |   }).eq("id", id);
  100 |   await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", id);
  101 |   await admin.from("chart_of_accounts").delete().eq("organization_id", id);
  102 |   await admin.from("user_role_assignments").delete().eq("organization_id", id);
  103 |   await admin.from("organization_memberships").delete().eq("organization_id", id);
  104 |   const { error } = await admin.from("organizations").delete().eq("id", id);
  105 |   expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
  106 |   for (const u of f.userIds) await admin.auth.admin.deleteUser(u);
  107 | }
  108 | 
  109 | async function signIn(page: Page, email: string) {
  110 |   await page.goto("/en/login");
  111 |   await page.locator("#email").fill(email);
  112 |   await page.locator("#password").fill(STAFF_PASSWORD);
  113 |   await page.getByRole("button", { name: /Sign In/i }).click();
  114 |   await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 40_000 });
  115 | }
  116 | 
  117 | test("disposal is refused until the accounts are designated, then succeeds and closes the asset", async ({
  118 |   browser,
  119 | }) => {
  120 |   test.setTimeout(180_000);
  121 |   const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  122 |   const f = await setUp(admin);
  123 | 
  124 |   try {
  125 |     const ctx = await browser.newContext();
  126 |     const page = await ctx.newPage();
  127 |     await signIn(page, f.email);
  128 | 
  129 |     // 1. Try to dispose with nothing designated.
  130 |     await page.goto("/en/finance/assets");
> 131 |     await expect(page.locator(`[data-asset="${f.assetCode}"]`)).toBeVisible();
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  132 | 
  133 |     await page.locator("#dispose-proceeds").fill("7000");
  134 |     await page.locator("#dispose-account").selectOption({ label: "1010 — Cash" });
  135 |     await page.locator("#dispose-date").fill("2026-06-01");
  136 |     await page.getByRole("button", { name: /^Dispose$/i }).click();
  137 | 
  138 |     // The refusal must say where to fix it, not merely that it failed.
  139 |     const refusal = page.locator("form").getByRole("alert");
  140 |     await expect(refusal).toContainText(/Designate the disposal gain and loss accounts first/i, {
  141 |       timeout: 40_000,
  142 |     });
  143 |     await expect(refusal).toContainText(/Designated Accounts/i);
  144 | 
  145 |     // 2. Go and designate them.
  146 |     await page.goto("/en/admin/finance/accounting-accounts");
  147 |     const disposal = page.locator('[data-designation="disposal"]');
  148 |     await expect(disposal).toHaveAttribute("data-ready", "no");
  149 | 
  150 |     await disposal.locator("#disposal-gain").selectOption({ label: "4910 — Gain on Disposal" });
  151 |     await disposal.locator("#disposal-loss").selectOption({ label: "5910 — Loss on Disposal" });
  152 |     await disposal.getByRole("button", { name: /^Save$/i }).click();
  153 | 
  154 |     await expect(page.locator('[data-designation="disposal"]')).toHaveAttribute(
  155 |       "data-ready", "yes", { timeout: 40_000 },
  156 |     );
  157 | 
  158 |     // 3. Now the disposal goes through.
  159 |     await page.goto("/en/finance/assets");
  160 |     await page.locator("#dispose-proceeds").fill("7000");
  161 |     await page.locator("#dispose-account").selectOption({ label: "1010 — Cash" });
  162 |     await page.locator("#dispose-date").fill("2026-06-01");
  163 |     await page.locator("#dispose-reason").fill("sold");
  164 |     await page.getByRole("button", { name: /^Dispose$/i }).click();
  165 | 
  166 |     await expect(page.locator(`[data-asset="${f.assetCode}"]`)).toHaveAttribute(
  167 |       "data-status", "DISPOSED", { timeout: 40_000 },
  168 |     );
  169 | 
  170 |     // 4. The ledger agrees: cost out in full, loss = book value - proceeds.
  171 |     // No depreciation was posted, so book value is the full 10,000 and selling
  172 |     // for 7,000 is a 3,000 loss.
  173 |     const { data: entry } = await admin
  174 |       .from("journal_entries").select("id")
  175 |       .eq("organization_id", f.orgId).eq("source_type", "JOURNAL_VOUCHER").single();
  176 |     const { data: lines } = await admin
  177 |       .from("journal_entry_lines").select("account_id, debit, credit")
  178 |       .eq("journal_entry_id", entry!.id);
  179 | 
  180 |     const debit = lines!.reduce((s, l) => s + Number(l.debit), 0);
  181 |     const credit = lines!.reduce((s, l) => s + Number(l.credit), 0);
  182 |     expect(debit, "the disposal entry balances").toBe(credit);
  183 |     expect(credit, "the asset leaves at its full original cost").toBe(10000);
  184 | 
  185 |     const { data: lossAcc } = await admin.from("chart_of_accounts")
  186 |       .select("id").eq("organization_id", f.orgId).eq("code", "5910").single();
  187 |     const lossLine = lines!.find((l) => l.account_id === lossAcc!.id);
  188 |     expect(Number(lossLine!.debit), "loss = 10,000 book value - 7,000 proceeds").toBe(3000);
  189 | 
  190 |     await ctx.close();
  191 |   } finally {
  192 |     await cleanUp(admin, f);
  193 |   }
  194 | });
  195 | 
```