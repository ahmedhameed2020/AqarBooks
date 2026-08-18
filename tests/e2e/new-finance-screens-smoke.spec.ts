/**
 * Smoke test for the screens added across the phase 1 and 2 finance work.
 *
 * Everything those features do was verified against the database directly --
 * allocation arithmetic, ledger postings, the guards. What was NOT verified is
 * that the pages themselves render, and that is a genuinely different failure
 * mode: a Server Component importing a value from a "use client" module gets
 * `undefined` silently, type-checks, builds, and only explodes when the page
 * actually renders with data. This repo has been bitten by exactly that before.
 *
 * So this asserts the minimum that a build cannot: each page reaches the browser
 * as itself, with its own heading, and no Next.js error overlay.
 *
 * Fixture conventions follow tests/e2e/chart-of-accounts-permission-gate.spec.ts:
 * service-role admin client for setup, a genuinely authenticated staff session
 * for the permission-gated pages. TENANT_OWNER because these screens sit behind
 * several different permissions and the point here is rendering, not gating --
 * the gates have their own dedicated specs.
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
let unitId: string;
let propertyId: string;

/** Pages under test, with a string that must appear if the page truly rendered. */
const SCREENS: { path: string; expect: RegExp }[] = [
  { path: "/en/finance/service-charges", expect: /Service Charges/i },
  { path: "/en/finance/commissions", expect: /Broker Commissions/i },
  { path: "/en/finance/banks/reconciliation", expect: /Bank Reconciliation/i },
  { path: "/en/finance/budgets", expect: /Budgets/i },
  { path: "/en/finance/reports/cash-flow", expect: /Cash Flow Statement/i },
  { path: "/en/finance/reports/budget-vs-actual", expect: /Budget vs Actual/i },
  { path: "/en/admin/finance/periods", expect: /Fiscal years|periods/i },
];

test.beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E Screens Smoke ${stamp}`,
      slug: `e2e-screens-smoke-${stamp}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  orgId = org!.id as string;

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
    p_organization_id: orgId,
  });
  expect(cloneErr, `clone_tenant_role_templates failed: ${cloneErr?.message}`).toBeNull();

  staffEmail = `e2e-screens-smoke-${stamp}@aqarbooks-test.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(createErr, `createUser failed: ${createErr?.message}`).toBeNull();
  userId = created!.user!.id;

  const { error: memErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: userId, status: "active" });
  expect(memErr, `membership insert failed: ${memErr?.message}`).toBeNull();

  const { data: role, error: roleErr } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(roleErr, `role lookup failed: ${roleErr?.message}`).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });
  expect(assignErr, `role assignment failed: ${assignErr?.message}`).toBeNull();

  // A unit is needed for the unit detail page, which carries the two newest
  // client panels (security deposits and handover) and is therefore the single
  // riskiest page in this set for a server/client boundary mistake.
  const { data: property, error: propErr } = await admin
    .from("properties")
    .insert({ organization_id: orgId, name: "E2E Smoke Property", code: `SMK-${stamp}` })
    .select("id")
    .single();
  expect(propErr, `property insert failed: ${propErr?.message}`).toBeNull();
  propertyId = property!.id as string;

  // A service charge levy needs a revenue account (via its due type) and a
  // receivable account, so the workflow test below has something to select.
  const { data: accounts, error: acctErr } = await admin
    .from("chart_of_accounts")
    .insert([
      { organization_id: orgId, code: "1130", name_ar: "ذمم", name_en: "Receivables", category: "ASSET", normal_balance: "DEBIT", is_group: false },
      { organization_id: orgId, code: "4100", name_ar: "إيراد", name_en: "Service Revenue", category: "REVENUE", normal_balance: "CREDIT", is_group: false },
    ])
    .select("id, category");
  expect(acctErr, `coa insert failed: ${acctErr?.message}`).toBeNull();
  const revenueId = accounts!.find((a) => a.category === "REVENUE")!.id;

  const { error: dueTypeErr } = await admin.from("due_types").insert({
    organization_id: orgId,
    name_ar: "رسوم خدمة",
    name_en: "Service Charge",
    default_revenue_account_id: revenueId,
  });
  expect(dueTypeErr, `due_type insert failed: ${dueTypeErr?.message}`).toBeNull();

  const { data: unit, error: unitErr } = await admin
    .from("units")
    .insert({
      organization_id: orgId,
      property_id: property!.id,
      code: "SMK-A-1",
      unit_type: "APARTMENT",
      area: 120,
    })
    .select("id")
    .single();
  expect(unitErr, `unit insert failed: ${unitErr?.message}`).toBeNull();
  unitId = unit!.id as string;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (!orgId) return;

  // Deleting the organization does NOT cascade everything, and the first
  // version of this teardown silently left a fixture behind because of it.
  // Two blockers, both deliberate in the schema:
  //   - platform_audit_logs has no cascade, because an audit trail is supposed
  //     to outlive the thing it describes.
  //   - service_charge_levies references chart_of_accounts and due_types, which
  //     the org cascade tries to remove first.
  // So the fixture unwinds explicitly, and the delete is checked rather than
  // fired and forgotten -- a teardown that fails quietly is how a test database
  // fills up with debris nobody can attribute.
  await admin
    .from("service_charge_allocations")
    .delete()
    .in(
      "levy_id",
      ((await admin.from("service_charge_levies").select("id").eq("organization_id", orgId)).data ?? [])
        .map((l) => l.id as string),
    );
  await admin.from("service_charge_levies").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);

  const { error: orgDeleteErr } = await admin.from("organizations").delete().eq("id", orgId);
  expect(orgDeleteErr, `fixture org was left behind: ${orgDeleteErr?.message}`).toBeNull();
});

async function signIn(page: Page) {
  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });
}

test("every new finance screen renders for an authorised user", async ({ page }) => {
  const failures: string[] = [];

  // Console errors are collected across the whole run: a hydration mismatch or
  // an undefined component surfaces here even when the page still paints.
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await signIn(page);

  // The unit page is only addressable once the fixture has created a unit, so
  // it joins the list here rather than in the static table above.
  const screens = [
    ...SCREENS,
    { path: `/en/property/${unitId}`, expect: /SMK-A-1/i },
  ];

  for (const screen of screens) {
    const response = await page.goto(screen.path, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;

    if (status >= 500) {
      failures.push(`${screen.path} returned HTTP ${status}`);
      continue;
    }
    // Next's dev error overlay, and the production error boundary.
    const body = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(body)) {
      failures.push(`${screen.path} rendered an error boundary`);
      continue;
    }
    if (!screen.expect.test(body)) {
      failures.push(
        `${screen.path} rendered without its heading (${screen.expect}); first 200 chars: ${body.slice(0, 200).replace(/\s+/g, " ")}`,
      );
    }
  }

  expect(failures, `screens failed to render:\n${failures.join("\n")}`).toEqual([]);
  expect(consoleErrors, `uncaught page errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});

/**
 * Rendering proves the page loads; it does not prove the buttons work. This
 * drives one real workflow end to end through the browser -- form submission,
 * server action, RPC, allocation arithmetic, and the result rendered back --
 * because a form that paints but whose action fails is still a broken screen.
 *
 * The service charge levy is chosen deliberately: it is the most intricate of
 * the new flows, and its allocation is the one piece of arithmetic where being
 * off by a piastre is a real defect rather than a cosmetic one.
 */
test("a service charge levy can be created and allocated from the browser", async ({ page }) => {
  await signIn(page);
  await page.goto("/en/finance/service-charges");

  await page.locator("#name").fill("E2E Smoke Levy");
  await page.locator("#periodStart").fill("2026-01-01");
  await page.locator("#periodEnd").fill("2026-03-31");
  // 1000.01 over a single unit still exercises the largest-remainder path:
  // the whole amount must land on that unit, to the piastre.
  await page.locator("#totalAmount").fill("1000.01");
  await page.locator("#allocationBasis").selectOption("EQUAL");
  await page.locator("#issueDate").fill("2026-08-18");
  await page.locator("#dueDate").fill("2026-09-15");
  await page.getByRole("button", { name: /Create as draft/i }).click();

  // The action revalidates rather than navigating, so the levy appears in the
  // list below the form.
  const levyLink = page.getByRole("link", { name: "E2E Smoke Levy" });
  await expect(levyLink).toBeVisible({ timeout: 15_000 });
  await levyLink.click();

  await expect(page.getByRole("button", { name: /Compute allocation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Compute allocation/i }).click();

  // The proof: the unit is billed, the total ties exactly, and the page says so.
  await expect(page.getByText("SMK-A-1")).toBeVisible({ timeout: 15_000 });
  const body = await page.locator("body").innerText();
  expect(body, "allocation should tie to the levy total").toMatch(/1,?000\.01/);
  expect(body, "page should confirm the split balances").toMatch(/Balanced|sum to the levy total/i);
});
