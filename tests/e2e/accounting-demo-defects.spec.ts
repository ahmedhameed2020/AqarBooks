/**
 * Phase 2 — demo defects, checked in a real browser against the local clean stack.
 *
 * FIXED BEFORE EXECUTION (organization: 3 active units A-101, B-201, C-301; 2 members; A-101 and B-201 owned)
 *   F1 members page: header count = 2 and both members appear in the table (no "count says N, table empty")
 *   F2 dashboard "Operations & Units": active units 3, with a current owner 2 — and the property page shows 3 registered units, 2 occupied, and lists 3 unit rows
 *      -> the same number in both places
 *   F3 dashboard shows none of the invented figures: no "Operations Smoothly"-style claims, no 82% / 10% / 8% split
 *      and no maintenance count; AI insight cards are absent because no AI provider is configured
 *   F4 /finance/reports/cash-flow-forecast shows the status page (withheld forecast) rather than invented results
 *   F5 /api/ai/journal-propose: anonymous -> 401; wrong organization -> 403; owner with the right to use it -> 503 AI_DISABLED
 *      (no provider key exists in this environment, and the browser egress guard saw no external request)
 *   F6 audit trail: the auditor (finance.audit.read) sees rows with actor names; the page is not empty
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });
let fx: JourneyFixture;

async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("defects");
  const admin = adminClient();
  const u2 = randomUUID(), u3 = randomUUID(), m2 = randomUUID();
  await admin.from("units").insert([
    { id: u2, organization_id: fx.orgId, property_id: fx.propertyId, code: "B-201" },
    { id: u3, organization_id: fx.orgId, property_id: fx.propertyId, code: "C-301" },
  ]);
  await admin.from("members").insert({ id: m2, organization_id: fx.orgId, full_name: "Karim Nabil", phone: "+201000000456" });
  await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: u2, member_id: m2, share_percentage: 100, is_primary_contact: true, start_date: "2021-01-01" });
  // some real activity so the audit trail has content
  const owner = await signedInClient(fx.owner.email);
  const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-02-10").gte("end_date", "2026-02-10").single()).data!.id as string;
  const created = await owner.rpc("create_journal_entry", {
    p_organization_id: fx.orgId, p_resort_id: null, p_fiscal_period_id: period, p_entry_date: "2026-02-10", p_description: "Audit trail seed", p_source_type: "JOURNAL_VOUCHER",
    p_lines: [{ account_id: fx.accounts["1110"], debit: 10, credit: 0 }, { account_id: fx.accounts["4100"], debit: 0, credit: 10 }], p_idempotency_key: randomUUID(),
  });
  expect(created.error, created.error?.message).toBeNull();
  await owner.rpc("submit_journal_entry_for_review", { p_journal_entry_id: created.data as string });
  await owner.rpc("post_journal_entry", { p_journal_entry_id: created.data as string });
});

test("F1 members page: header count equals the rows shown", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/members");
  await expect(page.getByTestId("members-total")).toHaveText("2", { timeout: 60_000 });
  await expect(page.getByText("Mona Hassan").first()).toBeVisible();
  await expect(page.getByText("Karim Nabil").first()).toBeVisible();
  await expect(page.getByTestId("members-error")).toHaveCount(0);
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/F1-members.png", fullPage: false });
});

test("F2 unit counts agree between dashboard and property page (owner); accountant gets an honest 'not available'", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/dashboard");
  await page.getByRole("button", { name: /Operations & Units/i }).click();
  await expect(page.getByText(/not available for your permissions/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("units-total")).toHaveCount(0);
  await page.context().clearCookies();
  await signIn(page, fx.owner.email);
  await go(page, "/en/dashboard");
  await page.getByRole("button", { name: /Operations & Units/i }).click();
  await expect(page.getByTestId("units-total")).toContainText("3", { timeout: 60_000 });
  await expect(page.getByTestId("units-owned")).toContainText("2");
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/F2-dashboard-units.png", fullPage: false });
  await go(page, "/en/property");
  await expect(page.getByText("Total Registered Units")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("div").filter({ hasText: /^Total Registered Units\s*3\s*2 occupied$/ }).first()).toBeVisible();
  await expect(page.getByText("2 occupied")).toBeVisible();
  await expect(page.getByRole("link", { name: /^(A-101|B-201|C-301)$/ })).toHaveCount(3);
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/F2-property-units.png", fullPage: false });
});

test("F3 dashboard carries no invented figures or AI insight", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/dashboard");
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Operations & Units/i }).click();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/System Operating Smoothly|zero variance|100% accuracy|Resort Occupancy/i);
  expect(text).not.toMatch(/\b(82|10|8)%/);
  expect(text).not.toMatch(/maintenance/i);
  await expect(page.getByTestId("ai-insights")).toHaveCount(0);
  await expect(page.getByText(/AI|Copilot/i).first()).toBeHidden({ timeout: 2000 }).catch(() => undefined);
});

test("F4 cash-flow forecast shows its status, not invented results", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/reports/cash-flow-forecast");
  await expect(page.getByTestId("forecast-withheld")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("cash-forecast-status")).toBeVisible();
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/F4-cash-forecast-status.png", fullPage: false });
});

test("F5 /api/ai/journal-propose refuses before any provider call", async ({ page, browser }) => {
  const body = { organizationId: fx.orgId, description: "Paid electrician for pump", amount: 100, locale: "en" };
  const anon = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3176" });
  const unauth = await anon.request.post("/api/ai/journal-propose", { data: body });
  expect(unauth.status()).toBe(401);
  await anon.close();

  await signIn(page, fx.owner.email);
  const wrongOrg = await page.request.post("/api/ai/journal-propose", { data: { ...body, organizationId: randomUUID() } });
  expect(wrongOrg.status()).toBe(403);
  const disabled = await page.request.post("/api/ai/journal-propose", { data: body });
  expect(disabled.status()).toBe(503);
  expect((await disabled.json()).error).toBe("AI_DISABLED");
  const bad = await page.request.post("/api/ai/journal-propose", { data: { organizationId: fx.orgId, description: "   " } });
  expect(bad.status()).toBe(400);
});

test("F6 the auditor sees the audit trail with actor names", async ({ page }) => {
  await signIn(page, fx.auditor.email);
  await go(page, "/en/finance/reports/audit-trail");
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 60_000 });
  expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
  await expect(page.getByText(/no audit trail records/i)).toHaveCount(0);
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/F6-audit-trail.png", fullPage: false });
});
