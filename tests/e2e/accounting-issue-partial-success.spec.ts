/**
 * Phase 2c — issueDueAction: a due that WAS issued must never be reported as failed because the optional
 * "approve as default receivable account" step failed.
 *
 * FIXED BEFORE EXECUTION (organization with no approved receivable account; the owner issues 700 on A-101)
 *   I1 a fault is injected into the settings write (a trigger scoped to this organization raises); the owner chooses 1130,
 *      ticks "approve as default" and issues: the due is ISSUED and POSTED (1 due, 1 entry Dr 1130 / Cr 4100 700), the UI
 *      reports a separate warning "Due issued, but the default account was not saved" (not an error), the dialog closes
 *      and the page refreshes with the due listed; no default is stored.
 *   I2 the fault is removed; "Retry saving" saves ONLY the setting: the default is stored and audited once; still exactly
 *      1 due and 1 entry (nothing was issued again).
 *   I3 re-opening the dialog now preselects 1130; the same identical due submitted again is skipped by the duplicate guard
 *      (still 1 due), proving the retry path never needed a second issue.
 */
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";
import { sql } from "../helpers/gate-release";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
const dialogScope = (page: Page) => page.locator('[data-slot="dialog-content"][data-open]');
const counts = async () => {
  const admin = adminClient();
  const c = async (t: string) => (await admin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId)).count ?? 0;
  return { dues: await c("dues"), entries: await c("journal_entries") };
};

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
const dropFault = () => sql(`drop trigger if exists trg_test_fail_settings on public.organization_finance_settings; drop function if exists public.test_fail_settings()`);

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("partial", { approveReceivable: false });
  dropFault();
});
test.afterAll(() => {
  try { dropFault(); } catch { /* best effort: the trigger is scoped to a disposable organization */ }
});

test("I1 issue succeeds, saving the default fails: success + separate warning, due listed, nothing rolled back", async ({ page }) => {
  sql(`create function public.test_fail_settings() returns trigger language plpgsql as $$ begin
         if new.organization_id = '${fx.orgId}' then raise exception 'TEST_FAULT: settings write refused'; end if;
         return new; end $$;
       create trigger trg_test_fail_settings before insert or update on public.organization_finance_settings
         for each row execute function public.test_fail_settings()`);

  await signIn(page, fx.owner.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await choose(page, dialog, 2, /^1130/);
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("700");
  await dialog.locator('input[type="date"]').nth(0).fill("2026-02-01");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-02-15");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("I1 partial success");
  await dialog.getByTestId("save-receivable-default").check();
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();

  await expect(page.getByText(/Due issued, but the default account was not saved/i)).toBeVisible({ timeout: 60_000 });
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/Failed to issue/i)).toHaveCount(0);
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/60-issue-partial-success-warning.png" });

  expect(await counts()).toEqual({ dues: 1, entries: 1 });
  const admin = adminClient();
  const setting = await admin.from("organization_finance_settings").select("receivable_account_id").eq("organization_id", fx.orgId);
  expect(setting.data ?? []).toHaveLength(0);
  // the refreshed page lists the due
  await expect(page.getByText("I1 partial success").first()).toBeVisible({ timeout: 60_000 });
});

test("I2 'Retry saving' saves only the setting; the due is not issued again", async ({ page }) => {
  dropFault();
  // the toast from I1 is gone after navigation; repeat the failing submit's visible path is unnecessary - the retry
  // control lives in that toast, so reproduce it once more on a second identical submit (duplicate -> skipped) with the fault re-armed.
  sql(`create function public.test_fail_settings() returns trigger language plpgsql as $$ begin
         if new.organization_id = '${fx.orgId}' then raise exception 'TEST_FAULT: settings write refused'; end if;
         return new; end $$;
       create trigger trg_test_fail_settings before insert or update on public.organization_finance_settings
         for each row execute function public.test_fail_settings()`);
  await signIn(page, fx.owner.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await choose(page, dialog, 2, /^1130/);
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("700");
  await dialog.locator('input[type="date"]').nth(0).fill("2026-02-01");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-02-15");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("I1 partial success"); // identical -> skipped by the duplicate guard
  await dialog.getByTestId("save-receivable-default").check();
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  // the identical due already exists, so the message must NOT say "issued"
  await expect(page.getByText(/Due already exists, and the default account was not saved/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Due issued, but/i)).toHaveCount(0);
  expect(await counts()).toEqual({ dues: 1, entries: 1 }); // the repeated issue created nothing new

  dropFault(); // the fault is fixed; retry only the setting
  await page.getByRole("button", { name: /Retry saving/i }).click();
  await expect(page.getByText(/Default account saved/i)).toBeVisible({ timeout: 60_000 });

  expect(await counts()).toEqual({ dues: 1, entries: 1 });
  const admin = adminClient();
  const setting = await admin.from("organization_finance_settings").select("receivable_account_id").eq("organization_id", fx.orgId).single();
  expect(setting.data!.receivable_account_id).toBe(fx.accounts["1130"]);
  const audit = await admin.from("platform_audit_logs").select("actor_id").eq("organization_id", fx.orgId).eq("action", "finance.default_receivable_account.set");
  expect(audit.data).toHaveLength(1);
  expect(audit.data![0].actor_id).toBe(fx.owner.id);
});

test("I3 afterwards the dialog preselects 1130 and no extra due or entry exists", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  await expect(dialogScope(page).getByRole("combobox").nth(2)).toContainText(/^1130/);
  await expect(dialogScope(page).getByTestId("receivable-not-configured")).toHaveCount(0);
  expect(await counts()).toEqual({ dues: 1, entries: 1 });
});
