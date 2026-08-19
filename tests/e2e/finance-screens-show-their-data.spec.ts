/**
 * الشاشات المالية تعرض بياناتها فعلًا.
 *
 * أربع شاشات كانت تطلب أعمدة غير موجودة (`cheques.note`، `dues.member_id`,
 * `payments.reference`، و`organization_id` على `journal_entry_lines`).
 * PostgREST يرفض الطلب كله بـ400، والصفحات **لا تقرأ `error`** — تقرأ `data`
 * فقط، فتصير `null`، ثم `?? []`. فالنتيجة ليست صفحة معطّلة بل صفحة **تكذب**:
 * تُفتح بعنوانها كاملًا وتقول «لا شيء هنا».
 *
 * ولذلك لا يكفي أن نؤكد أن الصفحة تُعرض — `new-finance-screens-smoke` يفعل ذلك
 * وكان يمرّ طوال فترة العطل. الاختبار الوحيد الذي كان سيكشفها هو أن نزرع صفًا
 * ونطالب برؤيته.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let orgId: string;
let userId: string;
let staffEmail: string;
const stamp = Date.now();

/** Markers seeded below; each must appear on its own screen. */
const CHEQUE_NUMBER = `CHQ${String(stamp).slice(-8)}`;
const RECEIPT_NUMBER = Number(String(stamp).slice(-8));
const DUE_DESCRIPTION = `E2E-DUE-${stamp}`;
const ENTRY_DESCRIPTION = `E2E-JV-${stamp}`;

test.beforeAll(async () => {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E Data Shown ${stamp}`, slug: `e2e-data-shown-${stamp}`,
      default_currency: "EGP", status: "ACTIVE",
    })
    .select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  orgId = org!.id;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  staffEmail = `e2e-data-shown-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: staffEmail, password: STAFF_PASSWORD, email_confirm: true,
  });
  expect(userErr, `user create failed: ${userErr?.message}`).toBeNull();
  userId = created!.user!.id;
  await admin.from("organization_memberships")
    .insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles")
    .select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  const acc = async (code: string, cat: string, bal: string) => {
    const { data } = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code, name_ar: code, name_en: code,
      category: cat, normal_balance: bal,
    }).select("id").single();
    return data!.id as string;
  };
  const cashAccount = await acc("1010", "ASSET", "DEBIT");
  const receivable = await acc("1200", "ASSET", "DEBIT");
  const revenue = await acc("4100", "REVENUE", "CREDIT");

  const { data: property } = await admin.from("properties").insert({
    organization_id: orgId, name: "Data Shown P", code: `E2E-DS-${stamp}`,
    timezone: "Africa/Cairo", property_type: "building",
  }).select("id").single();
  const propertyId = property!.id as string;

  const { data: unit } = await admin.from("units").insert({
    organization_id: orgId, property_id: propertyId, code: `DS-${stamp}`,
  }).select("id").single();

  const { data: member } = await admin.from("members").insert({
    organization_id: orgId, full_name: "دافع الاختبار", is_company: false,
  }).select("id").single();

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  const { data: period } = await admin.from("fiscal_periods").insert({
    organization_id: orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();

  // --- the four markers ---

  const { data: dueType } = await admin.from("due_types").insert({
    organization_id: orgId, default_revenue_account_id: revenue,
    name_ar: "مستحق", name_en: "Due", is_active: true,
  }).select("id").single();
  const { error: dueErr } = await admin.from("dues").insert({
    organization_id: orgId, property_id: propertyId, unit_id: unit!.id,
    due_type_id: dueType!.id, receivable_account_id: receivable,
    amount: 500, issue_date: "2026-06-01", due_date: "2026-07-01",
    status: "ISSUED", description: DUE_DESCRIPTION,
  });
  expect(dueErr, `due seed failed: ${dueErr?.message}`).toBeNull();

  const { data: bank } = await admin.from("banks").insert({
    organization_id: orgId, name_ar: "بنك الاختبار", name_en: "Test Bank",
  }).select("id").single();
  const { data: bankAccount } = await admin.from("bank_accounts").insert({
    organization_id: orgId, property_id: propertyId, bank_id: bank!.id,
    account_name: "Main", account_number: `ACC-${stamp}`, gl_account_id: cashAccount,
  }).select("id").single();
  const { error: chequeErr } = await admin.from("cheques").insert({
    organization_id: orgId, property_id: propertyId,
    bank_account_id: bankAccount!.id, direction: "INCOMING",
    cheque_number: CHEQUE_NUMBER, amount: 750, member_id: member!.id,
    cheque_date: "2026-06-05", due_date: "2026-07-05", status: "RECEIVED",
  });
  expect(chequeErr, `cheque seed failed: ${chequeErr?.message}`).toBeNull();

  const { error: paymentErr } = await admin.from("payments").insert({
    organization_id: orgId, property_id: propertyId, member_id: member!.id,
    unit_id: unit!.id, amount: 300, method: "CASH", payment_date: "2026-06-10",
    receipt_number: RECEIPT_NUMBER, deposit_account_id: cashAccount,
    status: "POSTED", unallocated_amount: 300,
  });
  expect(paymentErr, `payment seed failed: ${paymentErr?.message}`).toBeNull();

  const { data: entry, error: entryErr } = await admin.from("journal_entries").insert({
    organization_id: orgId, property_id: propertyId, fiscal_period_id: period!.id,
    entry_date: "2026-06-15", description: ENTRY_DESCRIPTION,
    source_type: "JOURNAL_VOUCHER", status: "POSTED",
  }).select("id").single();
  expect(entryErr, `entry seed failed: ${entryErr?.message}`).toBeNull();
  // Two lines, so the journals page must show a non-zero debit total -- the
  // symptom of the broken lines query was entries listed with every total zero.
  const { error: lineErr } = await admin.from("journal_entry_lines").insert([
    { journal_entry_id: entry!.id, line_number: 1, account_id: cashAccount, debit: 1234, credit: 0 },
    { journal_entry_id: entry!.id, line_number: 2, account_id: revenue, debit: 0, credit: 1234 },
  ]);
  expect(lineErr, `lines seed failed: ${lineErr?.message}`).toBeNull();
});

test.afterAll(async () => {
  const failures: string[] = [];
  const del = async (table: string, column = "organization_id") => {
    const { error } = await admin.from(table).delete().eq(column, orgId);
    if (error) failures.push(`${table}: ${error.message}`);
  };
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", orgId);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  // Audit rows reference both the organization and the property, so they have
  // to go before either can be deleted.
  await del("platform_audit_logs");
  await del("cheques");
  await del("payments");
  await del("dues");
  await del("journal_entries");
  await del("fiscal_periods");
  await del("fiscal_years");
  await del("bank_accounts");
  await del("banks");
  await del("members");
  await del("units");
  await del("properties");
  await del("due_types");
  await admin.from("chart_of_accounts").update({ is_used: false }).eq("organization_id", orgId);
  await del("chart_of_accounts");
  await del("user_role_assignments");
  await del("organization_memberships");
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  if (error) failures.push(`organizations: ${error.message}`);
  if (userId) await admin.auth.admin.deleteUser(userId);
  expect(failures, `fixture left behind:\n${failures.join("\n")}`).toEqual([]);
});

async function signIn(page: Page) {
  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 20_000 });
}

test("the finance screens show the rows that exist, not an empty list", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);

  const checks: { path: string; must: string; what: string }[] = [
    { path: "/en/finance/banks", must: CHEQUE_NUMBER, what: "the seeded cheque" },
    { path: "/en/finance/cashier", must: DUE_DESCRIPTION, what: "the collectable due" },
    { path: "/en/finance/payments", must: String(RECEIPT_NUMBER), what: "the posted payment" },
    { path: "/en/finance/journals", must: "1,234", what: "the entry's debit total" },
  ];

  const failures: string[] = [];
  for (const check of checks) {
    await page.goto(check.path, { waitUntil: "domcontentloaded" });
    // Visible text AND the serialized RSC payload. Some of these rows are only
    // painted behind a tab (cheques) or inside a dialog that needs an open
    // cashier session (dues), so they are legitimately not on screen -- but they
    // are passed as props from the server component, so they ARE in the payload.
    // The defect being guarded against makes the prop an EMPTY ARRAY, which this
    // catches either way; requiring visibility would only add setup that has
    // nothing to do with the bug.
    const body = await page
      .locator("body")
      .innerText({ timeout: 20_000 })
      .catch(() => "");
    const haystack = body + (await page.content());
    if (!haystack.includes(check.must)) {
      failures.push(
        `${check.path} did not show ${check.what} (${check.must}) -- ` +
          `the query behind it probably failed and the page rendered empty`,
      );
    }
  }

  expect(failures, `screens rendered without their data:\n${failures.join("\n")}`).toEqual([]);
});
