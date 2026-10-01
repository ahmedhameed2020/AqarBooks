import { readFile } from "node:fs/promises";
import { test, expect as baseExpect } from "@playwright/test";
import { createGateFixture, sql } from "../helpers/gate-release";
import { login } from "./gate-release-helpers";
const expect = baseExpect.configure({ timeout: 30_000 });
test.setTimeout(180_000);

test("guard exception requires supervisor approval; corrected exit preserves scan evidence", async ({ page, browser }) => {
  const fixture = await createGateFixture(), visitor = fixture.invitation(), device = fixture.device();
  // Selecting an identified visitor requires the separate visitor-read grant.
  // The guard still has no approval or occupancy-reconciliation permission.
  sql(`insert into public.role_permissions(role_id,permission_id) select '${fixture.guard.id}',id from public.permissions where key='operations.visitors.view'`);
  const scan = await fixture.guard.client.rpc("process_visitor_gate_scan", {
    p_device_id: device.id, p_device_credential: device.credential, p_gate_id: fixture.gate,
    p_invitation_id: visitor.id, p_raw_secret: visitor.secret, p_direction: "ENTRY", p_client_scan_id: crypto.randomUUID(),
  });
  expect(scan.error).toBeNull();
  expect(scan.data[0].decision).toBe("ALLOW");
  await login(page, fixture.guard);
  await page.goto("/en/operations/gate/occupancy");
  await expect(page.getByText(visitor.guest, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct exit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manual exception", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Record gate exception");
  await dialog.getByRole("combobox", { name: /^Gate/ }).selectOption(fixture.gate);
  await dialog.getByLabel("Visitor (optional)").selectOption(visitor.id);
  await dialog.getByRole("combobox", { name: /^Direction/ }).selectOption("EXIT");
  await dialog.getByRole("combobox", { name: /^Category/ }).selectOption("MISSED_SCAN");
  await dialog.getByLabel("Reason", { exact: true }).fill("Guard observed a missed exit");
  await dialog.getByRole("button", { name: "Record", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved");
  expect(sql(`select status from public.gate_manual_exception_details where organization_id='${fixture.org}'`)).toBe("PENDING");
  expect(sql(`select is_inside from public.visitor_access_state where visitor_invitation_id='${visitor.id}'`)).toBe("t");
  const supervisorContext = await browser.newContext();
  try {
    const supervisor = await supervisorContext.newPage();
    await login(supervisor, fixture.manager);
    await supervisor.goto("/en/operations/gate/occupancy");
    await supervisor.getByPlaceholder("Approval reason").fill("Supervisor confirmed guard evidence");
    await supervisor.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => sql(`select status from public.gate_manual_exception_details where organization_id='${fixture.org}'`)).toBe("APPROVED");
    await supervisor.getByRole("button", { name: "Correct exit", exact: true }).click();
    const correction = supervisor.getByRole("dialog");
    await expect(correction).toHaveAccessibleName("Reconcile visitor state");
    await correction.getByLabel("Correction reason").fill("Confirmed physical exit at North gate");
    await correction.getByRole("button", { name: "Confirm corrected exit" }).click();
    await expect.poll(() => sql(`select is_inside from public.visitor_access_state where visitor_invitation_id='${visitor.id}'`)).toBe("f");
    await supervisor.reload();
    await expect(supervisor.getByText("No matching visitors are inside")).toBeVisible();
    expect(sql(`select decision||'|'||reason_code from public.access_events where id='${scan.data[0].event_id}'`)).toBe("ALLOW|VALID_ENTRY");
    expect(sql(`select count(*) from public.gate_hardware_commands where organization_id='${fixture.org}'`)).toBe("1");
  } finally { await supervisorContext.close(); }
});

test("ledger filters real evidence and exports formula-safe CSV; Arabic screens use RTL", async ({ page }) => {
  const fixture = await createGateFixture(), visitor = fixture.invitation("=SUM(1,2)"), device = fixture.device();
  const scan = await fixture.manager.client.rpc("process_visitor_gate_scan", {
    p_device_id: device.id, p_device_credential: device.credential, p_gate_id: fixture.gate,
    p_invitation_id: visitor.id, p_raw_secret: visitor.secret, p_direction: "ENTRY", p_client_scan_id: crypto.randomUUID(),
  });
  expect(scan.error).toBeNull();
  await login(page, fixture.manager);
  await page.goto("/en/operations/access-events");
  await page.getByPlaceholder("Guest name", { exact: true }).fill(visitor.guest);
  await page.getByPlaceholder("Reason code", { exact: true }).fill("VALID_ENTRY");
  await page.locator("select").nth(1).selectOption(fixture.gate);
  await page.locator("select").nth(2).selectOption("ALLOW");
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel("From date").fill(today);
  await page.getByLabel("To date").fill(today);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page).toHaveURL(/reason=VALID_ENTRY/);
  await expect(page.getByText(visitor.guest, { exact: true })).toBeVisible();
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await pendingDownload;
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain("'=SUM(1,2)");
  expect(csv).not.toContain(visitor.secret);
  await page.locator("select").nth(2).selectOption("DENY");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByText("No matching evidence", { exact: true })).toBeVisible();
  for (const [route, heading] of [
    ["gate/occupancy", "الزوار الموجودون حالياً"],
    ["access-events", "سجل أدلة الدخول والخروج"],
    ["gate", "ماسح البوابة"],
  ]) {
    await page.goto(`/ar/operations/${route}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.locator("html").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  }
});
