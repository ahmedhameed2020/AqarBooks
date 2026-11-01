import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { adminClient } from "./accounting-fixture";
import { sql } from "../../helpers/gate-release";

export const q = (query: string) => sql(query);
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
export const body = async (page: Page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

/** Owner login: the portal is passwordless (email → six-digit code). The code is read through the auth admin API
 *  because the local stack has no mailbox; everything the user does is the real screen. */
export async function portalLogin(page: Page, email: string) {
  await page.context().clearCookies();
  await go(page, "/en/portal/login");
  await page.locator("#portal-login-email").fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.locator("#portal-otp")).toBeVisible({ timeout: 60_000 });
  const link = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data.properties?.email_otp;
  if (!otp) throw new Error(`no login code for ${email}: ${link.error?.message}`);
  await page.locator("#portal-otp").fill(otp);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/portal\/?$/, { timeout: 60_000 });
}
