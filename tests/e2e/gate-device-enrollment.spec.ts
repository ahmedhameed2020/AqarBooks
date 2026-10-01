import { test, expect as baseExpect } from "@playwright/test";
import { createGateFixture, sql } from "../helpers/gate-release";
import { enrollment, login, redeem, manualScan, resultPanel } from "./gate-release-helpers";
const expect = baseExpect.configure({ timeout: 30_000 });
test.setTimeout(180_000);

test("manager issues one-time enrollment; browser persists gate binding and rejects reuse", async ({ page, browser }) => {
  const fixture = await createGateFixture();
  await login(page, fixture.manager);
  const code = await enrollment(page, fixture, "ENTRY");
  await redeem(page, code);
  await expect(page).toHaveURL(/deviceId=/);
  const device = new URL(page.url()).searchParams.get("deviceId")!;
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Exit", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).not.toBeVisible();
  // Starting from the bare scanner URL must hydrate the persisted binding.
  await page.goto("/en/operations/gate");
  await expect(page).toHaveURL(new RegExp(`deviceId=${device}`));
  await page.goto(`/en/operations/gate?deviceId=${device}&gateId=${fixture.otherGate}`);
  await expect(page.getByText("North gate · NORTH", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  const visitor = fixture.invitation();
  await manualScan(page, visitor.payload);
  await expect(resultPanel(page)).toContainText("ALLOW");
  expect(sql(`select gate_id from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe(fixture.gate);

  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await login(second, fixture.guard);
    await redeem(second, code);
    await expect(second.getByText("Device enrollment failed. Request a new code.")).toBeVisible();
    await expect(second).not.toHaveURL(/deviceId=/);
    expect(sql(`select count(*) from public.gate_devices where organization_id='${fixture.org}'`)).toBe("1");
  } finally { await context.close(); }
});

test("manager revocation removes a loaded scanner binding and cannot issue access", async ({ page, context }) => {
  const fixture = await createGateFixture();
  await login(page, fixture.manager);
  await redeem(page, await enrollment(page, fixture));
  await expect(page).toHaveURL(/deviceId=/);
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).not.toBeVisible();
  const manager = await context.newPage();
  await manager.goto("/en/operations/gates");
  await manager.getByPlaceholder("Revocation reason").fill("Release device retired");
  await manager.getByRole("button", { name: "Revoke device", exact: true }).click();
  await expect(manager.getByText("Release device retired")).toBeVisible();
  const visitor = fixture.invitation();
  await manualScan(page, visitor.payload);
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/deviceId=/);
  await expect(resultPanel(page)).not.toContainText("ALLOW");
  await page.reload();
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).toBeVisible();
  expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("0");
});

test("enrollment fields have accessible names and keyboard access", async ({ page }) => {
  const fixture = await createGateFixture();
  await login(page, fixture.guard);
  await page.goto("/en/operations/gate");
  await expect(page.getByRole("heading", { level: 1, name: "Gate Scanner" })).toBeVisible();
  // Check actual browser-computed names and keyboard order.
  for (const name of ["enrollmentId", "enrollmentCode", "displayName"]) {
    await expect.soft(page.locator(`input[name="${name}"]`)).toHaveAccessibleName(/\S/);
  }
  const input = page.locator('input[name="enrollmentId"]');
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('input[name="enrollmentCode"]')).toBeFocused();
});

test("occupancy navigation is available to guards only with ledger permission", async ({ page }) => {
  const fixture = await createGateFixture();
  await login(page, fixture.guard);
  const link = page.getByRole("link", { name: "Live Visitor Occupancy", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/operations\/gate\/occupancy$/);
  await expect(page.getByRole("heading", { name: "Live visitor occupancy", exact: true })).toBeVisible();
  sql(`delete from public.role_permissions where role_id='${fixture.guard.id}' and permission_id in (select id from public.permissions where key='operations.access_events.view')`);
  await page.goto("/en/dashboard");
  await expect(link).toHaveCount(0);
});
