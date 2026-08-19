/**
 * شاشة المشاريع — عرض حي.
 *
 * ما يُختبر هنا الرحلة كما يعيشها المشغّل: يُنشئ مشروعًا **بلا حسابين**، فيراه
 * معلَّمًا «بلا حسابات — لا رسملة» ولا يُعرض عليه زر رسملة أصلًا. ثم يضبط
 * الحسابين، فيصير قابلًا للرسملة، فيرسمل، فيحرّر، وتنخفض قيمة تحت التنفيذ على
 * الشاشة.
 *
 * ويُثبت أن **تجاوز الرصيد يُرفض برقمين** لا برسالة عامة.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

type Fixture = { orgId: string; email: string; userIds: string[] };

async function makeUser(admin: SupabaseClient, f: Fixture, roleKey: string, tag: string) {
  const email = `e2e-prj-${tag}-${Date.now()}@aqarbooks-test.local`;
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
    name: `E2E PrjUI ${stamp}`, slug: `e2e-prjui-${stamp}`,
    default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(error, `org insert failed: ${error?.message}`).toBeNull();
  const f: Fixture = { orgId: org!.id as string, email: "", userIds: [] };
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: f.orgId });

  const acc = async (code: string, nameEn: string, cat: string, bal: string) => {
    const { data, error: e } = await admin.from("chart_of_accounts").insert({
      organization_id: f.orgId, code, name_ar: nameEn, name_en: nameEn,
      category: cat, normal_balance: bal, is_group: false, is_active: true,
    }).select("id").single();
    expect(e, e?.message).toBeNull();
    return data!.id as string;
  };
  await acc("1300", "Work in Progress", "ASSET", "DEBIT");
  await acc("2100", "Accounts Payable", "LIABILITY", "CREDIT");
  await acc("5600", "Cost of Sales", "EXPENSE", "DEBIT");

  const { data: fy } = await admin.from("fiscal_years").insert({
    organization_id: f.orgId, name: "FY", start_date: "2026-01-01",
    end_date: "2026-12-31", status: "OPEN",
  }).select("id").single();
  await admin.from("fiscal_periods").insert({
    organization_id: f.orgId, fiscal_year_id: fy!.id, period_number: 1,
    name: "P1", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN",
  });

  f.email = await makeUser(admin, f, "TENANT_OWNER", "owner");
  return f;
}

async function cleanUp(admin: SupabaseClient, f: Fixture) {
  const id = f.orgId;
  const { data: entries } = await admin.from("journal_entries").select("id").eq("organization_id", id);
  for (const e of entries ?? []) {
    await admin.from("journal_entry_lines").delete().eq("journal_entry_id", e.id);
  }
  await admin.from("journal_entries").delete().eq("organization_id", id);
  await admin.from("projects").delete().eq("organization_id", id);
  await admin.from("fiscal_periods").delete().eq("organization_id", id);
  await admin.from("fiscal_years").delete().eq("organization_id", id);
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

test("a project without accounts cannot capitalise, and once set the cost flows to WIP then to cost of sales", async ({
  browser,
}) => {
  test.setTimeout(220_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/projects");

    await expect(page.getByRole("heading", { name: /Projects & Work in Progress/i })).toBeVisible();

    const code = `TWR-${String(Date.now()).slice(-8)}`;

    // 1. Saved WITHOUT accounts: allowed, but marked and not capitalisable.
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("برج الاختبار");
    await page.locator("#prj-en").fill("Test Tower");
    await page.locator("#prj-budget").fill("1000000");
    await page.getByRole("button", { name: /Save project/i }).click();

    const row = page.locator(`[data-project="${code}"]`);
    await expect(row).toBeVisible({ timeout: 40_000 });
    await expect(row).toHaveAttribute("data-accounts-set", "no");
    await expect(row).toContainText(/cannot capitalise/i);
    await expect(
      page.getByRole("button", { name: /Capitalise cost/i }),
      "no capitalise control exists while no project can take a cost",
    ).toHaveCount(0);

    // 2. Set both accounts on the same code -- an edit, not a second project.
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("برج الاختبار");
    await page.locator("#prj-en").fill("Test Tower");
    await page.locator("#prj-budget").fill("1000000");
    await page.locator("#prj-wip").selectOption({ label: "1300 — Work in Progress" });
    await page.locator("#prj-cos").selectOption({ label: "5600 — Cost of Sales" });
    await page.getByRole("button", { name: /Save project/i }).click();

    await expect(page.locator(`[data-project="${code}"]`))
      .toHaveAttribute("data-accounts-set", "yes", { timeout: 40_000 });
    await expect(page.locator("[data-project]"), "editing must not create a second project")
      .toHaveCount(1);

    // 3. Capitalise 400,000 -- it becomes an ASSET, not an expense.
    await page.locator("#cap-amount").fill("400000");
    await page.locator("#cap-credit").selectOption({ label: "2100 — Accounts Payable" });
    await page.locator("#cap-date").fill("2026-03-01");
    await page.locator("#cap-desc").fill("concrete");
    await page.getByRole("button", { name: /Capitalise cost/i }).click();

    await expect(page.locator(`[data-project="${code}"]`))
      .toHaveAttribute("data-wip", "400000", { timeout: 40_000 });

    const { data: wipAcc } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "1300").single();
    // Scoped to this fixture's entries: an unfiltered read of every line in the
    // database hits the row cap and finds nothing, which reads as a posting
    // failure when the posting was fine.
    const orgEntryIds = (
      (await admin.from("journal_entries").select("id").eq("organization_id", f.orgId)).data ?? []
    ).map((e) => e.id);
    const { data: capLines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, project_id").in("journal_entry_id", orgEntryIds);
    const wipDebit = capLines!.find(
      (l) => l.account_id === wipAcc!.id && Number(l.debit) === 400000,
    );
    expect(wipDebit, "construction spend must land on the asset").toBeDefined();
    expect(wipDebit!.project_id, "and carry the project tag").not.toBeNull();

    // 4. Releasing more than accumulated is refused, WITH both numbers.
    await page.locator("#rel-amount").fill("500000");
    await page.locator("#rel-date").fill("2026-04-01");
    await page.getByRole("button", { name: /Release to cost of sales/i }).click();

    const refusal = page.getByRole("alert").filter({ hasText: /exceeds what has accumulated/i });
    await expect(refusal).toBeVisible({ timeout: 40_000 });
    await expect(refusal).toContainText(/500000/);
    await expect(refusal).toContainText(/400000/);

    // 5. A valid release moves WIP down by exactly that much.
    await page.locator("#rel-amount").fill("150000");
    await page.locator("#rel-date").fill("2026-04-01");
    await page.locator("#rel-desc").fill("10 units sold");
    await page.getByRole("button", { name: /Release to cost of sales/i }).click();

    await expect(page.locator(`[data-project="${code}"]`))
      .toHaveAttribute("data-wip", "250000", { timeout: 40_000 });

    // The ledger agrees: cost of sales debited, WIP credited.
    const { data: cosAcc } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "5600").single();
    const relEntryIds = (
      (await admin.from("journal_entries").select("id").eq("organization_id", f.orgId)).data ?? []
    ).map((e) => e.id);
    const { data: relLines } = await admin.from("journal_entry_lines")
      .select("account_id, debit, credit").in("journal_entry_id", relEntryIds);
    const cosDebit = relLines!.find(
      (l) => l.account_id === cosAcc!.id && Number(l.debit) === 150000,
    );
    expect(cosDebit, "the expense appears only on release").toBeDefined();

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a member without finance.accounts.manage sees the projects but no controls", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);

  try {
    const { data: wip } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "1300").single();
    const { data: cos } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "5600").single();
    await admin.from("projects").insert({
      organization_id: f.orgId, code: `RO-${Date.now()}`,
      name_ar: "مشروع", name_en: "Read Only Tower",
      wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id,
    });

    // CASHIER is an org member (so the register is readable) but holds no
    // finance.accounts.manage.
    const cashier = await makeUser(admin, f, "CASHIER", "cashier");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, cashier);
    await page.goto("/en/finance/projects");

    await expect(page.getByText("Read Only Tower")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("button", { name: /Save project/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Capitalise cost/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Release to cost of sales/i })).toHaveCount(0);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
