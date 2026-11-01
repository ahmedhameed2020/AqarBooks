import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/local-only";
import {
  adminClient,
  createJourneyFixture,
  PASSWORD,
  signedInClient,
  type JourneyFixture,
} from "./helpers/accounting-fixture";

const OUT = join(process.cwd(), "docs/progress/evidence-r6-run10/results");
let fx: JourneyFixture;
let yearId = "";

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function openPreview(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/admin/finance/periods`);
  await page.getByTestId("open-year-closing-2026").click();
  const dialog = page.getByTestId("year-end-closing-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("run-closing-precheck").click();
  await expect(dialog.getByTestId("closing-entry-preview")).toBeVisible({ timeout: 60_000 });
  return dialog;
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  fx = await createJourneyFixture("yearclose", { approveReceivable: false });
  const admin = adminClient();
  const owner = await signedInClient(fx.owner.email);

  const designation = await owner.rpc("designate_retained_earnings_account", {
    p_organization_id: fx.orgId,
    p_account_id: fx.accounts["3100"],
  });
  expect(designation.error, designation.error?.message).toBeNull();
  expect(designation.data).toMatchObject({ ok: true });

  const year = await admin
    .from("fiscal_years")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("name", "2026")
    .single();
  expect(year.error, year.error?.message).toBeNull();
  yearId = year.data!.id as string;

  const period = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("fiscal_year_id", yearId)
    .lte("start_date", "2026-03-15")
    .gte("end_date", "2026-03-15")
    .single();
  expect(period.error, period.error?.message).toBeNull();

  const created = await owner.rpc("create_journal_entry", {
    p_organization_id: fx.orgId,
    p_resort_id: null,
    p_fiscal_period_id: period.data!.id,
    p_entry_date: "2026-03-15",
    p_description: "Batch 3 closing fixture: cash 100 / revenue 100",
    p_source_type: "JOURNAL_VOUCHER",
    p_lines: [
      { account_id: fx.accounts["1110"], debit: 100, credit: 0 },
      { account_id: fx.accounts["4100"], debit: 0, credit: 100 },
    ],
    p_idempotency_key: randomUUID(),
  });
  expect(created.error, created.error?.message).toBeNull();
  expect((await owner.rpc("submit_journal_entry_for_review", { p_journal_entry_id: created.data as string })).error).toBeNull();
  expect((await owner.rpc("post_journal_entry", { p_journal_entry_id: created.data as string })).error).toBeNull();

  const periods = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("fiscal_year_id", yearId);
  expect(periods.error, periods.error?.message).toBeNull();
  for (const item of periods.data ?? []) {
    const closed = await owner.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: item.id,
      p_status: "CLOSED",
      p_reason: "Batch 3 isolated closing fixture",
    });
    expect(closed.error, closed.error?.message).toBeNull();
  }
});

test("Batch 3 closes a real year through Arabic and English UI and persists one balanced result", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page, fx.owner.email);

  await page.goto("/ar/admin/finance/periods");
  await page.getByTestId("open-year-closing-2026").click();
  let dialog = page.getByTestId("year-end-closing-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("فحص حقيقي قبل أي كتابة");
  await page.screenshot({ path: join(OUT, "batch3-closing-ar-precheck.png"), fullPage: true });
  await dialog.getByTestId("run-closing-precheck").click();
  await expect(dialog.getByTestId("closing-entry-preview")).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toContainText("4100");
  await expect(dialog).toContainText("3100");
  await expect(dialog.getByTestId("closing-entry-preview").locator("tbody tr")).toHaveCount(3);
  await page.screenshot({ path: join(OUT, "batch3-closing-ar-preview.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("year-end-closing-dialog")).toHaveCount(0);

  dialog = await openPreview(page, "en");
  await expect(dialog).toContainText("Balanced total");
  await expect(dialog).toContainText("100.0000");
  await page.screenshot({ path: join(OUT, "batch3-closing-en-preview.png"), fullPage: true });
  await dialog.getByTestId("continue-closing").click();
  await page.getByLabel("Closing reason (recorded in the audit log)").fill("Annual result reviewed in isolated r6 fixture");
  await page.getByLabel(/Type .*CLOSE YEAR.* to confirm/).fill("CLOSE");
  const confirm = page.getByTestId("confirm-year-closing");
  await expect(confirm).toBeDisabled();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: join(OUT, "batch3-closing-en-confirm-mobile.png"), fullPage: true });
  await page.getByLabel(/Type .*CLOSE YEAR.* to confirm/).fill("CLOSE YEAR");
  await expect(confirm).toBeEnabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await confirm.click();

  await expect(page.getByTestId("closing-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("closing-result")).toContainText("Fiscal year closed successfully");
  await expect(page.getByTestId("closing-result")).toContainText("100.0000");
  await page.screenshot({ path: join(OUT, "batch3-closing-en-result.png"), fullPage: true });
  const closingEntryId = await page.getByTestId("closing-entry-id").innerText();

  const admin = adminClient();
  const storedYear = await admin.from("fiscal_years").select("status").eq("id", yearId).eq("organization_id", fx.orgId).single();
  expect(storedYear.data?.status).toBe("CLOSED");

  const closings = await admin
    .from("fiscal_year_closings")
    .select("closing_entry_id, line_count, net_income, reason")
    .eq("organization_id", fx.orgId)
    .eq("fiscal_year_id", yearId);
  expect(closings.error, closings.error?.message).toBeNull();
  expect(closings.data).toHaveLength(1);
  expect(closings.data![0]).toMatchObject({
    closing_entry_id: closingEntryId,
    line_count: 2,
    reason: "Annual result reviewed in isolated r6 fixture",
  });
  expect(Number(closings.data![0].net_income)).toBe(100);

  const entry = await admin
    .from("journal_entries")
    .select("id, source_type, status, entry_date")
    .eq("id", closingEntryId)
    .eq("organization_id", fx.orgId)
    .single();
  expect(entry.data).toMatchObject({ source_type: "YEAR_END_CLOSING", status: "POSTED", entry_date: "2026-12-31" });

  const lines = await admin
    .from("journal_entry_lines")
    .select("account_id, debit, credit")
    .eq("journal_entry_id", closingEntryId)
    .order("line_number");
  expect(lines.error, lines.error?.message).toBeNull();
  expect(lines.data).toHaveLength(2);
  expect(lines.data).toEqual([
    { account_id: fx.accounts["4100"], debit: 100, credit: 0 },
    { account_id: fx.accounts["3100"], debit: 0, credit: 100 },
  ]);

  const audit = await admin
    .from("financial_audit_logs")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("action", "FISCAL_YEAR_CLOSED")
    .eq("entity_id", yearId);
  expect(audit.error, audit.error?.message).toBeNull();
  expect(audit.data).toHaveLength(1);
  expect(pageErrors).toEqual([]);

  writeFileSync(join(OUT, "batch3-closing-e2e-database.json"), JSON.stringify({
    organizationId: fx.orgId,
    fiscalYearId: yearId,
    closingEntryId,
    yearStatus: storedYear.data?.status,
    closing: closings.data![0],
    entry: entry.data,
    lines: lines.data,
    fiscalYearClosedAuditCount: audit.data?.length,
    pageErrors,
  }, null, 2));
});
