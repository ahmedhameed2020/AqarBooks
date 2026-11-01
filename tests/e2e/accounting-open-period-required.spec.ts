/**
 * Phase 2d — no due and no opening balance without its journal entry.
 *
 * FIXED BEFORE EXECUTION (organization with fiscal years 2025 and 2026 fully OPEN, then:
 *   - 2026-04 is CLOSED through the product's own RPC,
 *   - fiscal year 2024 is created and left PLANNED (the product creates periods PLANNED),
 *   - 2023 is not defined at all)
 *   O1 control: opening balance 100 as of 2026-01-15 and a due 200 issued 2026-02-01 succeed and EACH carries a POSTED
 *      journal entry (journal_entry_id set) - the ledger and the customer balance agree.
 *   O2 a date covered by NO period (2023-06-15), by a PLANNED period (2024-03-10; opening balances cannot be future-dated) and by a CLOSED period (2026-04-10) is
 *      refused for BOTH operations, through the RPC and (for one case each) through the UI, with a message that names the
 *      cause (FISCAL_PERIOD_MISSING / FISCAL_PERIOD_NOT_OPEN, status shown).
 *   O3 the refusal is atomic: no due, no journal entry, no financial-audit row, no due type and no equity account created
 *      by the failed attempt (the opening-balance function creates those first, and they must roll back too), and a batch
 *      issue over several units creates none of them.
 *   O4 after the period is opened the same operation succeeds, with its entry.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
let secondUnit = "";
let member2 = ""; // owns the second unit and has NO opening balance yet (the "already recorded" guard fires before the period check)
const dialogScope = (page: Page) => page.locator('[data-slot="dialog-content"][data-open]');

async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
async function choose(page: Page, scope: ReturnType<Page["locator"]>, index: number, option: RegExp | string) {
  await scope.getByRole("combobox").nth(index).click();
  await page.getByRole("option", { name: option }).first().click();
}
const snapshot = async () => {
  const admin = adminClient();
  const c = async (t: string) => (await admin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId)).count ?? 0;
  return {
    dues: await c("dues"), entries: await c("journal_entries"), audit: await c("financial_audit_logs"),
    dueTypes: await c("due_types"), accounts: await c("chart_of_accounts"),
  };
};
const issue = (c: Awaited<ReturnType<typeof signedInClient>>, date: string, units: string[], note: string) =>
  c.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: units, p_due_type_id: dueTypeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 200, p_issue_date: date, p_due_date: date, p_description: note });
const opening = (c: Awaited<ReturnType<typeof signedInClient>>, date: string) =>
  c.rpc("record_member_opening_balance", { p_organization_id: fx.orgId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 100, p_as_of_date: date });
let dueTypeId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);
  fx = await createJourneyFixture("period", { approveReceivable: true });
  const admin = adminClient();
  dueTypeId = (await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  secondUnit = randomUUID();
  await admin.from("units").insert({ id: secondUnit, organization_id: fx.orgId, property_id: fx.propertyId, code: "B-202" });
  member2 = randomUUID();
  await admin.from("members").insert({ id: member2, organization_id: fx.orgId, full_name: "Karim Nabil", phone: "+201000000456" });
  await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: secondUnit, member_id: member2, share_percentage: 100, is_primary_contact: true, start_date: "2021-01-01" });
  const owner = await signedInClient(fx.owner.email);
  const closed = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-04-10").gte("end_date", "2026-04-10").single()).data!.id as string;
  const r = await owner.rpc("set_fiscal_period_status", { p_fiscal_period_id: closed, p_status: "CLOSED", p_reason: "period test" });
  expect(r.error, r.error?.message).toBeNull();
  const y = await owner.rpc("create_fiscal_year", { p_organization_id: fx.orgId, p_name: "2024", p_start_date: "2024-01-01", p_end_date: "2024-12-31" });
  expect(y.error, y.error?.message).toBeNull();
});

test("O0 the FIRST opening balance of an organization, refused: the due type and the equity account it would create are rolled back too", async () => {
  const session = await signedInClient(fx.accountant.email);
  const before = await snapshot();
  const res = await opening(session, "2023-06-15");
  expect(res.error?.message).toMatch(/FISCAL_PERIOD_MISSING/);
  expect(await snapshot()).toEqual(before); // no "opening balance" due type, no 3900 account, no due, no entry
});

test("O1 control: with an OPEN period both operations post their journal entry", async () => {
  const session = await signedInClient(fx.accountant.email);
  const ob = await opening(session, "2026-01-15");
  expect(ob.error, ob.error?.message).toBeNull();
  const due = await issue(session, "2026-02-01", [fx.unit.id], "O1 control due");
  expect(due.error, due.error?.message).toBeNull();
  const admin = adminClient();
  const dues = (await admin.from("dues").select("id,journal_entry_id").eq("organization_id", fx.orgId)).data!;
  expect(dues).toHaveLength(2);
  expect(dues.every((d) => d.journal_entry_id)).toBe(true);
  const entries = (await admin.from("journal_entries").select("status").eq("organization_id", fx.orgId)).data!;
  expect(entries.every((e) => e.status === "POSTED")).toBe(true);
});

const CASES: Array<[string, string, RegExp]> = [
  ["no period covers the date", "2023-06-15", /FISCAL_PERIOD_MISSING/],
  ["the period is PLANNED", "2024-03-10", /FISCAL_PERIOD_NOT_OPEN.*PLANNED/],
  ["the period is CLOSED", "2026-04-10", /FISCAL_PERIOD_NOT_OPEN.*CLOSED/],
];

test("O2/O3 an opening balance is refused atomically for a missing, planned and closed period", async () => {
  const session = await signedInClient(fx.accountant.email);
  for (const [why, date, re] of CASES) {
    const before = await snapshot();
    const res = await session.rpc("record_member_opening_balance", { p_organization_id: fx.orgId, p_member_id: member2, p_unit_id: secondUnit, p_amount: 50, p_as_of_date: date });
    expect(res.error?.message, why).toMatch(re);
    expect(await snapshot(), `${why}: nothing may remain`).toEqual(before);
  }
});

test("O2/O3 a due is refused atomically for a missing, planned and closed period; a batch creates none", async () => {
  const session = await signedInClient(fx.accountant.email);
  for (const [why, date, re] of CASES) {
    const before = await snapshot();
    const single = await issue(session, date, [fx.unit.id], `refused: ${why}`);
    expect(single.error?.message, why).toMatch(re);
    const batch = await issue(session, date, [fx.unit.id, secondUnit], `refused batch: ${why}`);
    expect(batch.error?.message, `${why} (batch)`).toMatch(re);
    expect(await snapshot(), `${why}: nothing may remain`).toEqual(before);
  }
});

test("O2 through the UI: the dialogs show the cause and create nothing", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const before = await snapshot();

  // issue-due dialog, date in no period
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  let dialog = dialogScope(page);
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await expect(dialog.getByRole("combobox").nth(2)).toContainText(/^1130/);
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("200");
  await dialog.locator('input[type="date"]').nth(0).fill("2023-06-15");
  await dialog.locator('input[type="date"]').nth(1).fill("2023-06-30");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("UI refused: no period");
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  // the dialog maps the RPC code to an actionable bilingual message (raw DB codes never reach the UI)
  await expect(dialog.getByRole("alert")).toContainText(/No fiscal period covers the issue date/, { timeout: 60_000 });
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/70-issue-due-no-fiscal-period.png" });
  expect(await snapshot()).toEqual(before);

  // opening-balance dialog, date in a CLOSED period
  await go(page, `/en/members/${member2}`);
  await page.getByRole("button", { name: /Opening balance/i }).click();
  dialog = dialogScope(page);
  await dialog.locator("#ob-amount").fill("50");
  await dialog.locator("#ob-date").fill("2026-04-10");
  await dialog.getByRole("button", { name: /Record balance/i }).click();
  // this dialog shows the message text without the code: it must still name the period, the date and the status
  await expect(dialog.getByRole("alert")).toContainText(/2026-04.*2026-04-10.*CLOSED/, { timeout: 60_000 });
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/71-opening-balance-closed-period.png" });
  expect(await snapshot()).toEqual(before);
});

test("O4 once the period is opened the same operation succeeds and posts", async () => {
  const admin = adminClient();
  const owner = await signedInClient(fx.accountant.email);
  const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2024-03-10").gte("end_date", "2024-03-10").single()).data!.id as string;
  const opened = await (await signedInClient(fx.owner.email)).rpc("set_fiscal_period_status", { p_fiscal_period_id: period, p_status: "OPEN", p_reason: "period test" });
  expect(opened.error, opened.error?.message).toBeNull();
  const before = await snapshot();
  const due = await issue(owner, "2024-03-10", [fx.unit.id], "O4 now allowed");
  expect(due.error, due.error?.message).toBeNull();
  const after = await snapshot();
  expect([after.dues, after.entries]).toEqual([before.dues + 1, before.entries + 1]);
  const row = (await admin.from("dues").select("journal_entry_id").eq("organization_id", fx.orgId).eq("description", "O4 now allowed").single()).data!;
  expect(row.journal_entry_id).not.toBeNull();
});
