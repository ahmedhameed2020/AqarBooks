import { test, expect } from "./helpers/local-only";
import type { Locator, Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";
import { portalLogin } from "./helpers/portal-ui";
import { sql } from "../helpers/gate-release";

/**
 * A page that cannot read its data must say so, not render an empty page.
 *
 * Measured 2026-10-12: statement timeouts (8 s role limit) on units_with_financials / members_with_financials made PostgREST answer 500, and
 * the pages turned that into "Units owned 0", a "link the client to a unit first" notice instead of the form, empty lists. Here the failure
 * is produced on demand and deterministically: SELECT on the two views is revoked from `authenticated` for the duration of one test, which
 * makes every page read through them fail exactly like a timeout does (`{ data: null, error }`). The grants are restored in `finally`, and
 * verified identical to the snapshot taken before; a crash mid-test is repaired by the next run's beforeAll.
 *
 * ISOLATED STACK ONLY (the runner refuses anything else). Nothing else may run against the stack while this file runs.
 */
const VIEWS = ["units_with_financials", "members_with_financials"];
const grantsSnapshot = () =>
  sql(`select string_agg(grantee||':'||table_name||':'||privilege_type, ',' order by grantee, table_name, privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name in ('${VIEWS.join("','")}')`);
const revokeViews = () => VIEWS.forEach((v) => sql(`revoke select on public.${v} from authenticated`));
const restoreViews = () => VIEWS.forEach((v) => sql(`grant select on public.${v} to authenticated`));

let fx: JourneyFixture;
let originalGrants = "";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  restoreViews(); // repair a previous crash, if any
  originalGrants = grantsSnapshot();
  expect(originalGrants).toContain("authenticated:units_with_financials:SELECT");
  fx = await createJourneyFixture("errstate");
  // a portal login for the member (the owner of A-101)
  const email = `owner-${fx.tag}@demo.local`;
  const created = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  await adminClient().from("members").update({ user_id: created.data.user!.id, email }).eq("id", fx.member.id);
});
test.afterEach(() => restoreViews());
test.afterAll(() => restoreViews());

/**
 * The page is expected to be healthy at the points where this is called. No retry loop: a statement timeout here is a failure of its own
 * (the error view would be showing instead of `ready`), reported as such, and is never hidden by pressing Retry again. Before the views were
 * rewritten (migration 20261017100800) this file needed such a loop because the isolated stack produced real 57014 timeouts on them.
 */
async function expectHealthy(page: Page, ready: Locator, what: string) {
  await expect(ready, `${what}: expected the normal page, not the error view (a 57014 timeout would be an independent failure)`).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("data-load-error"), `${what}: error view must not be showing`).toHaveCount(0);
}

async function staffSignIn(page: Page) {
  await page.context().clearCookies();
  await page.goto("/en/login");
  await page.locator("#email").fill(fx.accountant.email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 });
}

test("staff member page: a failed read shows an error with Retry, never 'Units owned 0'; Retry recovers", async ({ page }) => {
  test.setTimeout(300_000);
  await staffSignIn(page);
  await page.goto(`/en/members/${fx.member.id}`);
  await expectHealthy(page, page.getByRole("button", { name: /Opening balance/i }), "member page, before the failure is provoked");

  try {
    revokeViews();
    await page.goto(`/en/members/${fx.member.id}`);
    await expect(page.getByTestId("data-load-error")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("data-load-error")).toContainText(/could not be loaded/i);
    const body = await page.locator("body").innerText();
    expect(body, "no partial or zero figures behind the error").not.toMatch(/Units owned/i);
    await expect(page.getByRole("button", { name: /Opening balance/i })).toHaveCount(0);
    await page.screenshot({ path: "docs/audits/phase3-evidence/task7-error-screens/en-member-page-load-error.png" });
  } finally {
    restoreViews();
  }
  expect(grantsSnapshot()).toBe(originalGrants);

  // the data is back: Retry re-reads it (a refresh, not a replay of the failure)
  // the FIRST Retry must succeed; a later timeout would be a separate failure, not something to click through
  await page.getByTestId("data-load-retry").click();
  await expectHealthy(page, page.getByRole("button", { name: /Opening balance/i }), "member page, first Retry after the grants were restored");
});

test("owner portal: units, home and statement show the error, not 'no units' / zeros; Retry recovers", async ({ page }) => {
  test.setTimeout(300_000);
  await portalLogin(page, `owner-${fx.tag}@demo.local`);
  await page.goto("/ar/portal/units");
  await expectHealthy(page, page.getByText("A-101").first(), "portal units, before the failure is provoked");

  try {
    revokeViews();
    for (const path of ["/en/portal/units", "/en/portal", "/en/portal/statement", "/en/portal/payments"]) {
      await page.goto(path);
      await expect(page.getByTestId("data-load-error"), `${path} must show the error state`).toBeVisible({ timeout: 60_000 });
      expect(await page.locator("body").innerText(), `${path}: no unit list behind the error`).not.toContain("A-101");
    }
    await page.goto("/ar/portal/units");
    await expect(page.getByTestId("data-load-error")).toContainText("تعذّر تحميل");
    await page.screenshot({ path: "docs/audits/phase3-evidence/task7-error-screens/ar-portal-units-load-error.png" });
  } finally {
    restoreViews();
  }
  expect(grantsSnapshot()).toBe(originalGrants);

  await page.getByTestId("data-load-retry").click();
  await expectHealthy(page, page.getByText("A-101").first(), "portal units, first Retry after the grants were restored");
});
