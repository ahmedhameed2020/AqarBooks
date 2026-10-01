import { expect, type Page } from "@playwright/test";
import { password, type GateFixture } from "../helpers/gate-release";

export async function login(page: Page, user: GateFixture["manager"]) {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Gate release browsers must target localhost.");
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
export async function enrollment(page: Page, fixture: GateFixture, direction = "BOTH") {
  await page.goto("/en/operations/gates");
  await page.getByRole("button", { name: "Enroll device", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Enroll gate scanner");
  await dialog.getByLabel("Gate", { exact: true }).selectOption(fixture.gate);
  await dialog.getByLabel("Allowed direction").selectOption(direction);
  await dialog.getByRole("button", { name: "Create code" }).click();
  await expect(dialog.locator("code")).toHaveCount(2);
  const code = (await dialog.locator("code").nth(0).innerText()).trim();
  const id = (await dialog.locator("code").nth(1).innerText()).trim();
  await dialog.getByRole("button", { name: "I saved it" }).click();
  await expect(dialog).not.toBeVisible();
  return { code, id };
}
export async function redeem(page: Page, code: { id: string; code: string }) {
  await page.goto("/en/operations/gate");
  await page.getByPlaceholder("Enrollment ID", { exact: true }).fill(code.id);
  await page.getByPlaceholder("Enrollment code", { exact: true }).fill(code.code);
  await page.getByPlaceholder("Device name", { exact: true }).fill("Field browser");
  await page.getByRole("button", { name: "Enroll device", exact: true }).click();
}
export async function enrolledScanner(page: Page, fixture: GateFixture) {
  await login(page, fixture.manager);
  await redeem(page, await enrollment(page, fixture));
  await expect(page).toHaveURL(/deviceId=/);
  await expect(page.getByPlaceholder("Enrollment ID", { exact: true })).not.toBeVisible();
  return new URL(page.url()).searchParams.get("deviceId")!;
}
export async function manualScan(page: Page, payload: string) {
  await page.getByPlaceholder("AQP1...").fill(payload);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
}
export const resultPanel = (page: Page) => page.locator('[aria-live="assertive"]');
