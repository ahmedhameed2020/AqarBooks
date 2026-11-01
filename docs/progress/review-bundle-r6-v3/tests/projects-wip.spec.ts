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
import { createOpenFiscalYear } from "../helpers/fiscal-calendar";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

  f.email = await makeUser(admin, f, "TENANT_OWNER", "owner");

  // Fiscal calendar through the product RPCs as the signed-in owner (the guard refuses direct writes).
  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: f.email, password: STAFF_PASSWORD });
  expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
  await createOpenFiscalYear(admin, ownerClient, {
    orgId: f.orgId, name: "FY", startDate: "2026-01-01", endDate: "2026-12-31",
  });
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
  // fiscal_years / fiscal_periods are removed by the organization cascade (open rows only; see the guard).
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

    // 1. Saved WITHOUT accounts: the accounts are optional at creation, so the save succeeds.
    await page.getByRole("button", { name: /New Project/i }).click();
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("برج الاختبار");
    await page.locator("#prj-en").fill("Test Tower");
    await page.locator("#prj-budget").fill("1000000");
    await page.getByRole("button", { name: /Save project/i }).click();

    const row = page.getByRole("row").filter({ hasText: code });
    await expect(row).toBeVisible({ timeout: 40_000 });

    // 1b. Capitalising without both accounts is refused by the server, and leaves no partial effect.
    const { data: prj, error: prjErr } = await admin
      .from("projects").select("id").eq("organization_id", f.orgId).eq("code", code).single();
    expect(prjErr, `saved project lookup failed: ${prjErr?.message}`).toBeNull();
    const { data: credit } = await admin
      .from("chart_of_accounts").select("id").eq("organization_id", f.orgId).eq("code", "2100").single();
    const { count: entriesBefore } = await admin
      .from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", f.orgId);
    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signErr } = await ownerClient.auth.signInWithPassword({ email: f.email, password: STAFF_PASSWORD });
    expect(signErr, `owner sign-in failed: ${signErr?.message}`).toBeNull();
    const { error: capErr } = await ownerClient.rpc("capitalise_project_cost", {
      p_project_id: prj!.id as string,
      p_amount: 1000,
      p_credit_account_id: credit!.id as string,
      p_entry_date: "2026-06-01",
      p_description: "must be refused without both accounts",
    });
    expect(capErr?.message ?? "", "capitalising without both accounts must be refused").toMatch(/PROJECT_ACCOUNTS_NOT_SET/);
    const { count: entriesAfter } = await admin
      .from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", f.orgId);
    expect(entriesAfter, "a refused capitalisation must post no journal entry").toBe(entriesBefore);

    // 2. Set both accounts on the same code -- an edit, not a second project.
    // The explicit edit path: the row's Edit control. Re-submitting the create dialog is refused, not an edit.
    await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: /^Edit$/ }).click();
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("برج الاختبار");
    await page.locator("#prj-en").fill("Test Tower");
    await page.locator("#prj-budget").fill("1000000");
    await page.locator("#prj-wip").selectOption({ label: "1300 — Work in Progress" });
    await page.locator("#prj-cos").selectOption({ label: "5600 — Cost of Sales" });
    await page.getByRole("button", { name: /Save project/i }).click();

    // The saved values, read back from the database: both accounts are set on the one project.
    await expect.poll(async () => {
      const { data } = await admin.from("projects")
        .select("wip_account_id, cost_of_sales_account_id").eq("organization_id", f.orgId).eq("code", code).single();
      return Boolean(data?.wip_account_id && data?.cost_of_sales_account_id);
    }, { timeout: 40_000 }).toBe(true);
    const { count: sameCode } = await admin.from("projects")
      .select("id", { count: "exact", head: true }).eq("organization_id", f.orgId).eq("code", code);
    expect(sameCode, "editing must not create a second project").toBe(1);

    // 3. Capitalise 400,000 -- it becomes an ASSET, not an expense.
    await page.getByRole("button", { name: /Capitalise WIP/i }).click();
    const capProject = await page.locator("#cap-project option").filter({ hasText: code }).first().getAttribute("value");
    await page.locator("#cap-project").selectOption(capProject!);
    await page.locator("#cap-amount").fill("400000");
    await page.locator("#cap-credit").selectOption({ label: "2100 — Accounts Payable" });
    await page.locator("#cap-date").fill("2026-03-01");
    await page.locator("#cap-desc").fill("concrete");
    await page.getByRole("dialog").getByRole("button", { name: /^Capitalise Cost$/i }).click();

    // The value the screen shows for this project's capitalised cost.
    await expect(page.getByRole("row").filter({ hasText: code }))
      .toContainText("400,000.00", { timeout: 40_000 });

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
    await page.getByRole("button", { name: /^Release Cost$/i }).click();
    const relProject = await page.locator("#rel-project option").filter({ hasText: code }).first().getAttribute("value");
    await page.locator("#rel-project").selectOption(relProject!);
    await page.locator("#rel-amount").fill("500000");
    await page.locator("#rel-date").fill("2026-04-01");
    await page.getByRole("dialog").getByRole("button", { name: /^Release Cost$/i }).click();

    const refusal = page.getByRole("alert").filter({ hasText: /exceeds what has accumulated/i });
    await expect(refusal).toBeVisible({ timeout: 40_000 });
    await expect(refusal).toContainText(/500000/);
    await expect(refusal).toContainText(/400000/);

    // 5. A valid release moves WIP down by exactly that much.
    await page.locator("#rel-amount").fill("150000");
    await page.locator("#rel-date").fill("2026-04-01");
    await page.locator("#rel-desc").fill("10 units sold");
    await page.getByRole("dialog").getByRole("button", { name: /^Release Cost$/i }).click();

    await expect(page.getByRole("row").filter({ hasText: code }))
      .toContainText("250,000.00", { timeout: 40_000 });

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
    await expect(page.getByRole("button", { name: /Capitalise WIP/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Release Cost$/i })).toHaveCount(0);

    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a project form that names another organization is refused and writes nothing", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);
  // An organization the signed-in owner does not belong to.
  const { data: other, error: otherErr } = await admin.from("organizations").insert({
    name: "Foreign Org", slug: `foreign-prj-${Date.now()}`, default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(otherErr, `foreign org insert failed: ${otherErr?.message}`).toBeNull();

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/projects");
    await expect(page.getByRole("heading", { name: /Projects & Work in Progress/i })).toBeVisible();
    await page.getByRole("button", { name: /New Project/i }).click();

    const code = `TWR-X${String(Date.now()).slice(-6)}`;
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("برج مرفوض");
    await page.locator("#prj-en").fill("Refused Tower");
    await page.locator("#prj-budget").fill("1000000");
    // The form requires both ledger accounts, so select them for the request to reach the server.
    await page.locator("#prj-wip").selectOption({ label: "1300 — Work in Progress" });
    await page.locator("#prj-cos").selectOption({ label: "5600 — Cost of Sales" });

    // Tamper: the hidden field now names the foreign organization.
    await page.locator('input[name="organizationId"]').evaluate((el, v) => {
      (el as HTMLInputElement).value = v;
    }, other!.id as string);
    await page.getByRole("button", { name: /Save project/i }).click();

    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible({ timeout: 40_000 });
    const { data: written } = await admin.from("projects").select("id").eq("code", code);
    expect(written, "a refused request must leave no project row behind").toHaveLength(0);
    await ctx.close();
  } finally {
    await admin.from("organizations").delete().eq("id", other!.id as string);
    await cleanUp(admin, f);
  }
});

test("a duplicate project code is refused, and the existing project is left unchanged", async ({ browser }) => {
  test.setTimeout(220_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/projects");
    await expect(page.getByRole("heading", { name: /Projects & Work in Progress/i })).toBeVisible();

    const code = `TWR-D${String(Date.now()).slice(-6)}`;
    await page.getByRole("button", { name: /New Project/i }).click();
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("أصلي");
    await page.locator("#prj-en").fill("Original Tower");
    await page.locator("#prj-budget").fill("500000");
    await page.getByRole("button", { name: /Save project/i }).click();
    await expect(page.getByRole("row").filter({ hasText: code })).toBeVisible({ timeout: 40_000 });

    // The same code again, with different values: the create must be refused, not an overwrite.
    await page.getByRole("button", { name: /New Project/i }).click();
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("بديل");
    await page.locator("#prj-en").fill("Replacement Tower");
    await page.locator("#prj-budget").fill("1");
    await page.getByRole("button", { name: /Save project/i }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/already in use in this organization/i, {
      timeout: 40_000,
    });

    const { data: rows } = await admin
      .from("projects").select("name_en, budget_amount").eq("organization_id", f.orgId).eq("code", code);
    expect(rows, "the duplicate must not create or replace a row").toHaveLength(1);
    expect(rows![0].name_en).toBe("Original Tower");
    expect(Number(rows![0].budget_amount)).toBe(500000);
    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("an explicit edit by a manager changes the name, budget and accounts of a project without postings", async ({
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

    // Created without accounts, then completed through the edit path.
    const code = `TWR-E${String(Date.now()).slice(-6)}`;
    await page.getByRole("button", { name: /New Project/i }).click();
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-ar").fill("قبل التعديل");
    await page.locator("#prj-en").fill("Before Edit");
    await page.locator("#prj-budget").fill("500000");
    await page.getByRole("button", { name: /Save project/i }).click();
    await expect(page.getByRole("row").filter({ hasText: code })).toBeVisible({ timeout: 40_000 });

    await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: /^Edit$/ }).click();
    await page.locator("#prj-en").fill("Renamed Tower");
    await page.locator("#prj-budget").fill("750000");
    await page.locator("#prj-wip").selectOption({ label: "1300 — Work in Progress" });
    await page.locator("#prj-cos").selectOption({ label: "5600 — Cost of Sales" });
    await page.getByRole("button", { name: /Save project/i }).click();

    await expect.poll(async () => {
      const { data } = await admin.from("projects")
        .select("name_en, budget_amount, wip_account_id, cost_of_sales_account_id")
        .eq("organization_id", f.orgId).eq("code", code).single();
      return data?.name_en === "Renamed Tower" && Number(data?.budget_amount) === 750000
        && Boolean(data?.wip_account_id) && Boolean(data?.cost_of_sales_account_id);
    }, { timeout: 40_000 }).toBe(true);
    const { count } = await admin.from("projects")
      .select("id", { count: "exact", head: true }).eq("organization_id", f.orgId).eq("code", code);
    expect(count, "the edit must not create a second project").toBe(1);
    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a project with posted entries refuses a locked change, and a name change still goes through", async ({
  browser,
}) => {
  test.setTimeout(220_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const f = await setUp(admin);
  try {
    const { data: wip } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "1300").single();
    const { data: cos } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "5600").single();
    const { data: credit } = await admin.from("chart_of_accounts")
      .select("id").eq("organization_id", f.orgId).eq("code", "2100").single();
    const code = `TWR-P${String(Date.now()).slice(-6)}`;
    const { data: prj, error: prjErr } = await admin.from("projects").insert({
      organization_id: f.orgId, code, name_ar: "مرسمل", name_en: "Posted Tower",
      wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id, budget_amount: 1000000,
    }).select("id").single();
    expect(prjErr, `project insert failed: ${prjErr?.message}`).toBeNull();

    // Post a real capitalisation through the product RPC as the owner.
    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signErr } = await ownerClient.auth.signInWithPassword({ email: f.email, password: STAFF_PASSWORD });
    expect(signErr, `owner sign-in failed: ${signErr?.message}`).toBeNull();
    const { error: capErr } = await ownerClient.rpc("capitalise_project_cost", {
      p_project_id: prj!.id as string, p_amount: 1000, p_credit_account_id: credit!.id as string,
      p_entry_date: "2026-03-01", p_description: "posted before the edit",
    });
    expect(capErr, `capitalise failed: ${capErr?.message}`).toBeNull();
    const { count: entriesBefore } = await admin
      .from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", f.orgId);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, f.email);
    await page.goto("/en/finance/projects");
    await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: /^Edit$/ }).click();

    // Locked: the code cannot change once the project has postings.
    await page.locator("#prj-code").fill(`${code}-X`);
    await page.getByRole("button", { name: /Save project/i }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/already has posted entries/i, {
      timeout: 40_000,
    });
    const { data: afterLock } = await admin.from("projects").select("code").eq("id", prj!.id as string).single();
    expect(afterLock!.code, "a refused edit must leave the code unchanged").toBe(code);

    // Permitted: the name still changes after postings.
    await page.locator("#prj-code").fill(code);
    await page.locator("#prj-en").fill("Renamed After Posting");
    await page.getByRole("button", { name: /Save project/i }).click();
    await expect.poll(async () => {
      const { data } = await admin.from("projects").select("name_en").eq("id", prj!.id as string).single();
      return data?.name_en;
    }, { timeout: 40_000 }).toBe("Renamed After Posting");

    const { count: entriesAfter } = await admin
      .from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", f.orgId);
    expect(entriesAfter, "editing a project must not change its postings").toBe(entriesBefore);
    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});

test("a member without the accounts permission sees no edit control and cannot change a project", async ({
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
    const code = `TWR-R${String(Date.now()).slice(-6)}`;
    const { data: prj, error: prjErr } = await admin.from("projects").insert({
      organization_id: f.orgId, code, name_ar: "محمي", name_en: "Protected Tower",
      wip_account_id: wip!.id, cost_of_sales_account_id: cos!.id,
    }).select("id").single();
    expect(prjErr, `project insert failed: ${prjErr?.message}`).toBeNull();

    const cashier = await makeUser(admin, f, "CASHIER", "cashier");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, cashier);
    await page.goto("/en/finance/projects");
    await expect(page.getByText("Protected Tower")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("button", { name: /^Edit$/ }), "no edit control without the permission").toHaveCount(0);

    // The database refuses the write too: an update on the caller's session reaches no row.
    const cashierClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signErr } = await cashierClient.auth.signInWithPassword({ email: cashier, password: STAFF_PASSWORD });
    expect(signErr, `cashier sign-in failed: ${signErr?.message}`).toBeNull();
    const { data: changed } = await cashierClient.from("projects")
      .update({ name_en: "Hijacked" }).eq("id", prj!.id as string).select("id");
    expect(changed ?? [], "a member without the permission must update no row").toHaveLength(0);
    const { data: still } = await admin.from("projects").select("name_en").eq("id", prj!.id as string).single();
    expect(still!.name_en).toBe("Protected Tower");
    await ctx.close();
  } finally {
    await cleanUp(admin, f);
  }
});
