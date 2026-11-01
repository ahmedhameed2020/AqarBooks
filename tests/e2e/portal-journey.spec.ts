/**
 * Acceptance review — customer portal → maintenance → visitor pass → gate scan, as ONE connected journey, plus the
 * refusals. Performed through the product's own screens and RPCs; the service key only seeds users / rows and, where
 * the local stack has no mailbox, reads the six-digit login code that would have been emailed.
 *
 * Organization A: owner 1 (unit R-101: dues 3,000 + 1,500, payment 1,000 → balance 3,500), owner 2 (unit R-202: 7,777),
 *   a property manager (operations.*) and a guard (scan). Organization B: an owner whose unit has the SAME code R-101 and
 *   a due of 9,999. Distinct amounts make any cross-customer leak visible.
 *
 * Each test records what it observed into test-results evidence (see `note`) so the report quotes facts, not intentions.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { body, go, portalLogin, q } from "./helpers/portal-ui";
import { AMOUNTS, createPortalWorld, type PortalWorld } from "./helpers/portal-fixture";
import { login as staffLogin } from "./gate-release-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

let W: PortalWorld;
const evidence: Record<string, unknown> = {};
const note = (key: string, value: unknown) => { evidence[key] = value; };

test.beforeAll(async () => {
  test.setTimeout(300_000);
  W = await createPortalWorld();
  note("world", { orgA: W.A.org, orgB: W.B.org, owner1: W.A.owners[0].email, owner2: W.A.owners[1].email, ownerB: W.B.owners[0].email });
});
test.afterAll(() => {
  mkdirSync("docs/audits/portal-review-evidence", { recursive: true });
  writeFileSync("docs/audits/portal-review-evidence/journey-observations.json", JSON.stringify(evidence, null, 2));
});

const owner1 = () => W.A.owners[0];
const owner2 = () => W.A.owners[1];
const ownerB = () => W.B.owners[0];

test("J1 owner 1 signs in to the portal (email code) and lands on the dashboard", async ({ page }) => {
  await portalLogin(page, owner1().email);
  await expect(page).toHaveURL(/\/portal\/?$/);
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J1-portal-home.png" });
  note("J1", { text: (await body(page)).slice(0, 400) });
});

test("J2 the owner sees only their own unit", async ({ page }) => {
  await portalLogin(page, owner1().email);
  await go(page, "/en/portal/units");
  const text = await body(page);
  expect(text).not.toContain("R-202"); // same organization, other owner
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J2-portal-units.png" });
  note("J2", { unitsText: text.slice(0, 400) });
});

test("J3 the owner's statement shows their movements and nobody else's", async ({ page }) => {
  await portalLogin(page, owner1().email);
  await go(page, "/en/portal/statement");
  const text = await body(page);
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J3-portal-statement.png", fullPage: true });
  note("J3", { statementText: text.slice(0, 900) });
  for (const must of ["Charge 3000", "Charge 1500"]) expect(text, must).toContain(must);
  expect(text).not.toContain("Charge 7777"); // owner 2, same organization
  expect(text).not.toContain("Charge 9999"); // organization B
  expect(text).toMatch(/3,?500/); // 3,000 + 1,500 - 1,000
});

let requestId = "";

test("J4 owner 1 submits a maintenance request for their unit", async ({ page }) => {
  await portalLogin(page, owner1().email);
  await go(page, "/en/portal/maintenance/new");
  await expect(page.getByText("Short title")).toBeVisible({ timeout: 60_000 });
  await page.locator("select").nth(1).selectOption({ index: 0 }); // first category
  await page.getByPlaceholder("Example: AC water leak").fill("Water leak in the kitchen");
  await page.locator("textarea").fill("Water drips from the ceiling near the sink since this morning.");
  await page.getByRole("button", { name: "High", exact: true }).click();
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J4-maintenance-form.png", fullPage: true });
  await page.getByRole("button", { name: /Submit|Send/i }).last().click();
  await page.waitForURL(/\/portal\/maintenance\/[0-9a-f-]{36}/, { timeout: 60_000 });
  requestId = page.url().match(/maintenance\/([0-9a-f-]{36})/)![1];
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J4-maintenance-submitted.png", fullPage: true });

  const row = q(`select status||'|'||priority||'|'||request_no||'|'||requester_member_id||'|'||unit_id||'|'||organization_id from public.maintenance_requests where id='${requestId}'`).split("|");
  expect(row[0]).toBe("SUBMITTED");
  expect(row[1]).toBe("HIGH");
  expect(row[3]).toBe(owner1().memberId);
  expect(row[4]).toBe(owner1().unitId);
  expect(row[5]).toBe(W.A.org);
  const updates = q(`select count(*) from public.maintenance_request_updates where maintenance_request_id='${requestId}'`);
  const staffNotified = q(`select count(*) from public.notifications where source_id='${requestId}' and recipient_user_id is not null and recipient_member_id is null`);
  const platformAudit = q(`select count(*) from public.platform_audit_logs where organization_id='${W.A.org}' and entity_id='${requestId}'`);
  note("J4", { requestNo: row[2], updateRows: updates, staffNotifications: staffNotified, platformAuditRows: platformAudit });
});

test("J5 the property manager triages and starts the request, with one member-visible and one staff-only note", async ({ page }) => {
  await staffLogin(page, W.A.gate.manager);
  await go(page, `/en/operations/maintenance/${requestId}`);
  await expect(page.getByText("Water leak in the kitchen").first()).toBeVisible({ timeout: 60_000 });
  const form = page.locator("select").first().locator("xpath=ancestor::div[contains(@class,'space-y') or contains(@class,'grid')][1]");
  void form;
  const update = async (status: string, text: string, visibility: "STAFF_ONLY" | "MEMBER_VISIBLE") => {
    await page.locator("select").filter({ has: page.locator('option[value="TRIAGED"]') }).selectOption(status);
    await page.locator("textarea").first().fill(text);
    await page.locator("select.h-9").filter({ has: page.locator('option[value="STAFF_ONLY"]') }).first().selectOption(visibility);
    await page.getByRole("button", { name: /Save|Update|Apply/i }).first().click();
    await expect.poll(() => q(`select status from public.maintenance_requests where id='${requestId}'`), { timeout: 60_000 }).toBe(status);
  };
  await update("TRIAGED", "Internal: plumber needed, check the AC drain", "STAFF_ONLY");
  await update("IN_PROGRESS", "A technician will visit tomorrow morning", "MEMBER_VISIBLE");
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J5-staff-maintenance.png", fullPage: true });

  const rows = q(`select string_agg(previous_status||'>'||resulting_status||':'||visibility||':'||coalesce(actor_user_id::text,'-'), ' ; ' order by created_at) from public.maintenance_request_updates where maintenance_request_id='${requestId}'`);
  expect(rows).toContain("SUBMITTED>TRIAGED:STAFF_ONLY");
  expect(rows).toContain("TRIAGED>IN_PROGRESS:MEMBER_VISIBLE");
  expect(rows).toContain(W.A.gate.manager.id);
  const ownerNotifications = q(`select string_agg(type||':'||source_type, ',' order by created_at) from public.notifications where recipient_member_id='${owner1().memberId}' and source_id='${requestId}'`);
  note("J5", { updates: rows, ownerNotifications });
});

test("J6 the owner follows the status and sees only the member-visible note", async ({ page }) => {
  await portalLogin(page, owner1().email);
  await go(page, `/en/portal/maintenance/${requestId}`);
  const text = await body(page);
  expect(text).toMatch(/In progress/i);
  expect(text).toContain("A technician will visit tomorrow morning");
  expect(text).not.toContain("Internal: plumber needed"); // staff-only note must not leak
  await page.screenshot({ path: "docs/audits/portal-review-evidence/screens/J6-owner-sees-status.png", fullPage: true });
  await go(page, "/en/portal/notifications");
  const notifications = await body(page);
  note("J6", { notificationsText: notifications.slice(notifications.indexOf("Notifications") > -1 ? 0 : 0, 700) });
});
