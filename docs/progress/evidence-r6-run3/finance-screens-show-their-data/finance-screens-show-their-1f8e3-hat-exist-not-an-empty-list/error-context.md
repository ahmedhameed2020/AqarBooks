# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: finance-screens-show-their-data.spec.ts >> the finance screens show the rows that exist, not an empty list
- Location: tests\e2e\finance-screens-show-their-data.spec.ts:194:5

# Error details

```
TypeError: Cannot read properties of null (reading 'id')
```

# Test source

```ts
  24  | 
  25  | const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  26  | 
  27  | let orgId: string;
  28  | let userId: string;
  29  | let staffEmail: string;
  30  | const stamp = Date.now();
  31  | 
  32  | /** Markers seeded below; each must appear on its own screen. */
  33  | const CHEQUE_NUMBER = `CHQ${String(stamp).slice(-8)}`;
  34  | const RECEIPT_NUMBER = Number(String(stamp).slice(-8));
  35  | const DUE_DESCRIPTION = `E2E-DUE-${stamp}`;
  36  | const ENTRY_DESCRIPTION = `E2E-JV-${stamp}`;
  37  | 
  38  | test.beforeAll(async () => {
  39  |   const { data: org, error: orgErr } = await admin
  40  |     .from("organizations")
  41  |     .insert({
  42  |       name: `E2E Data Shown ${stamp}`, slug: `e2e-data-shown-${stamp}`,
  43  |       default_currency: "EGP", status: "ACTIVE",
  44  |     })
  45  |     .select("id").single();
  46  |   expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  47  |   orgId = org!.id;
  48  | 
  49  |   await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  50  | 
  51  |   staffEmail = `e2e-data-shown-${stamp}@aqarbooks-test.local`;
  52  |   const { data: created, error: userErr } = await admin.auth.admin.createUser({
  53  |     email: staffEmail, password: STAFF_PASSWORD, email_confirm: true,
  54  |   });
  55  |   expect(userErr, `user create failed: ${userErr?.message}`).toBeNull();
  56  |   userId = created!.user!.id;
  57  |   await admin.from("organization_memberships")
  58  |     .insert({ organization_id: orgId, user_id: userId, status: "active" });
  59  |   const { data: role } = await admin.from("roles")
  60  |     .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  61  |   await admin.from("user_role_assignments")
  62  |     .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });
  63  | 
  64  |   const acc = async (code: string, cat: string, bal: string) => {
  65  |     const { data } = await admin.from("chart_of_accounts").insert({
  66  |       organization_id: orgId, code, name_ar: code, name_en: code,
  67  |       category: cat, normal_balance: bal,
  68  |     }).select("id").single();
  69  |     return data!.id as string;
  70  |   };
  71  |   const cashAccount = await acc("1010", "ASSET", "DEBIT");
  72  |   const receivable = await acc("1200", "ASSET", "DEBIT");
  73  |   const revenue = await acc("4100", "REVENUE", "CREDIT");
  74  | 
  75  |   const { data: property } = await admin.from("properties").insert({
  76  |     organization_id: orgId, name: "Data Shown P", code: `E2E-DS-${stamp}`,
  77  |     timezone: "Africa/Cairo", property_type: "building",
  78  |   }).select("id").single();
  79  |   const propertyId = property!.id as string;
  80  | 
  81  |   const { data: unit } = await admin.from("units").insert({
  82  |     organization_id: orgId, property_id: propertyId, code: `DS-${stamp}`,
  83  |   }).select("id").single();
  84  | 
  85  |   const { data: member } = await admin.from("members").insert({
  86  |     organization_id: orgId, full_name: "دافع الاختبار", is_company: false,
  87  |   }).select("id").single();
  88  | 
  89  |   // Fiscal calendar through the product RPCs as the signed-in owner (the guard refuses direct writes).
  90  |   // The journal entry below is dated 2026-06-15, so its period is the monthly period containing that date.
  91  |   const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  92  |   const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: staffEmail, password: STAFF_PASSWORD });
  93  |   expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
  94  |   await createOpenFiscalYear(admin, ownerClient, {
  95  |     orgId, name: "FY", startDate: "2026-01-01", endDate: "2026-12-31",
  96  |   });
  97  |   const { data: period, error: periodErr } = await admin.from("fiscal_periods").select("id")
  98  |     .eq("organization_id", orgId).lte("start_date", "2026-06-15").gte("end_date", "2026-06-15").single();
  99  |   expect(periodErr, `period lookup failed: ${periodErr?.message}`).toBeNull();
  100 | 
  101 |   // --- the four markers ---
  102 | 
  103 |   const { data: dueType } = await admin.from("due_types").insert({
  104 |     organization_id: orgId, default_revenue_account_id: revenue,
  105 |     name_ar: "مستحق", name_en: "Due", is_active: true,
  106 |   }).select("id").single();
  107 |   const { error: dueErr } = await admin.from("dues").insert({
  108 |     organization_id: orgId, property_id: propertyId, unit_id: unit!.id,
  109 |     due_type_id: dueType!.id, receivable_account_id: receivable,
  110 |     amount: 500, issue_date: "2026-06-01", due_date: "2026-07-01",
  111 |     status: "ISSUED", description: DUE_DESCRIPTION,
  112 |   });
  113 |   expect(dueErr, `due seed failed: ${dueErr?.message}`).toBeNull();
  114 | 
  115 |   const { data: bank } = await admin.from("banks").insert({
  116 |     organization_id: orgId, name_ar: "بنك الاختبار", name_en: "Test Bank",
  117 |   }).select("id").single();
  118 |   const { data: bankAccount } = await admin.from("bank_accounts").insert({
  119 |     organization_id: orgId, property_id: propertyId, bank_id: bank!.id,
  120 |     account_name: "Main", account_number: `ACC-${stamp}`, gl_account_id: cashAccount,
  121 |   }).select("id").single();
  122 |   const { error: chequeErr } = await admin.from("cheques").insert({
  123 |     organization_id: orgId, property_id: propertyId,
> 124 |     bank_account_id: bankAccount!.id, direction: "INCOMING",
      |                                   ^ TypeError: Cannot read properties of null (reading 'id')
  125 |     cheque_number: CHEQUE_NUMBER, amount: 750, member_id: member!.id,
  126 |     cheque_date: "2026-06-05", due_date: "2026-07-05", status: "RECEIVED",
  127 |   });
  128 |   expect(chequeErr, `cheque seed failed: ${chequeErr?.message}`).toBeNull();
  129 | 
  130 |   const { error: paymentErr } = await admin.from("payments").insert({
  131 |     organization_id: orgId, property_id: propertyId, member_id: member!.id,
  132 |     unit_id: unit!.id, amount: 300, method: "CASH", payment_date: "2026-06-10",
  133 |     receipt_number: RECEIPT_NUMBER, deposit_account_id: cashAccount,
  134 |     status: "POSTED", unallocated_amount: 300,
  135 |   });
  136 |   expect(paymentErr, `payment seed failed: ${paymentErr?.message}`).toBeNull();
  137 | 
  138 |   const { data: entry, error: entryErr } = await admin.from("journal_entries").insert({
  139 |     organization_id: orgId, property_id: propertyId, fiscal_period_id: period!.id as string,
  140 |     entry_date: "2026-06-15", description: ENTRY_DESCRIPTION,
  141 |     source_type: "JOURNAL_VOUCHER", status: "POSTED",
  142 |   }).select("id").single();
  143 |   expect(entryErr, `entry seed failed: ${entryErr?.message}`).toBeNull();
  144 |   // Two lines, so the journals page must show a non-zero debit total -- the
  145 |   // symptom of the broken lines query was entries listed with every total zero.
  146 |   const { error: lineErr } = await admin.from("journal_entry_lines").insert([
  147 |     { journal_entry_id: entry!.id, line_number: 1, account_id: cashAccount, debit: 1234, credit: 0 },
  148 |     { journal_entry_id: entry!.id, line_number: 2, account_id: revenue, debit: 0, credit: 1234 },
  149 |   ]);
  150 |   expect(lineErr, `lines seed failed: ${lineErr?.message}`).toBeNull();
  151 | });
  152 | 
  153 | test.afterAll(async () => {
  154 |   const failures: string[] = [];
  155 |   const del = async (table: string, column = "organization_id") => {
  156 |     const { error } = await admin.from(table).delete().eq(column, orgId);
  157 |     if (error) failures.push(`${table}: ${error.message}`);
  158 |   };
  159 |   const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", orgId);
  160 |   for (const e of entries ?? []) {
  161 |     await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  162 |   }
  163 |   // Audit rows reference both the organization and the property, so they have
  164 |   // to go before either can be deleted.
  165 |   await del("platform_audit_logs");
  166 |   await del("cheques");
  167 |   await del("payments");
  168 |   await del("dues");
  169 |   await del("journal_entries");
  170 |   await del("bank_accounts");
  171 |   await del("banks");
  172 |   await del("members");
  173 |   await del("units");
  174 |   await del("properties");
  175 |   await del("due_types");
  176 |   await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  177 |   await del("chart_of_accounts");
  178 |   await del("user_role_assignments");
  179 |   await del("organization_memberships");
  180 |   const { error } = await admin.from("organizations").delete().eq("id", orgId);
  181 |   if (error) failures.push(`organizations: ${error.message}`);
  182 |   if (userId) await admin.auth.admin.deleteUser(userId);
  183 |   expect(failures, `fixture left behind:\n${failures.join("\n")}`).toEqual([]);
  184 | });
  185 | 
  186 | async function signIn(page: Page) {
  187 |   await page.goto("/en/login");
  188 |   await page.locator("#email").fill(staffEmail);
  189 |   await page.locator("#password").fill(STAFF_PASSWORD);
  190 |   await page.getByRole("button", { name: /Sign In/i }).click();
  191 |   await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 20_000 });
  192 | }
  193 | 
  194 | test("the finance screens show the rows that exist, not an empty list", async ({ page }) => {
  195 |   test.setTimeout(180_000);
  196 |   await signIn(page);
  197 | 
  198 |   const checks: { path: string; must: string; what: string }[] = [
  199 |     { path: "/en/finance/banks", must: CHEQUE_NUMBER, what: "the seeded cheque" },
  200 |     { path: "/en/finance/cashier", must: DUE_DESCRIPTION, what: "the collectable due" },
  201 |     { path: "/en/finance/payments", must: String(RECEIPT_NUMBER), what: "the posted payment" },
  202 |     { path: "/en/finance/journals", must: "1,234", what: "the entry's debit total" },
  203 |   ];
  204 | 
  205 |   const failures: string[] = [];
  206 |   for (const check of checks) {
  207 |     await page.goto(check.path, { waitUntil: "domcontentloaded" });
  208 |     // Visible text AND the serialized RSC payload. Some of these rows are only
  209 |     // painted behind a tab (cheques) or inside a dialog that needs an open
  210 |     // cashier session (dues), so they are legitimately not on screen -- but they
  211 |     // are passed as props from the server component, so they ARE in the payload.
  212 |     // The defect being guarded against makes the prop an EMPTY ARRAY, which this
  213 |     // catches either way; requiring visibility would only add setup that has
  214 |     // nothing to do with the bug.
  215 |     const body = await page
  216 |       .locator("body")
  217 |       .innerText({ timeout: 20_000 })
  218 |       .catch(() => "");
  219 |     const haystack = body + (await page.content());
  220 |     if (!haystack.includes(check.must)) {
  221 |       failures.push(
  222 |         `${check.path} did not show ${check.what} (${check.must}) -- ` +
  223 |           `the query behind it probably failed and the page rendered empty`,
  224 |       );
```