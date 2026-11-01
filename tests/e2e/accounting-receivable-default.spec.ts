/**
 * Phase 2b — the receivable account for issuing a due is never guessed.
 *
 * FIXED BEFORE EXECUTION (organization with NO approved receivable account; chart of accounts = RESORT_STANDARD)
 *   R1 database: issue_dues refuses (as the accountant) a missing account (RECEIVABLE_ACCOUNT_REQUIRED), another
 *      organization's account, a non-asset account (4100 revenue), a group account and an inactive account
 *      (RECEIVABLE_ACCOUNT_INVALID); nothing is created by any refusal.
 *   R2 UI, no approved setting: the accountant opens "Issue Due"; the receivable field is EMPTY (not 1110 Cash), a
 *      "not approved / choose yourself" notice is shown, submitting without choosing is refused and creates nothing;
 *      the accountant has no "approve as default" checkbox (no finance.accounts.manage).
 *   R3 UI, owner: sees the checkbox, chooses 1130 and ticks it -> due issued Dr 1130 / Cr 4100, setting saved + audited.
 *   R4 UI, accountant afterwards: the field arrives preselected as 1130; due issued without touching it -> Dr 1130.
 *   R5 database: get_default_receivable_account answers the accountant, refuses a member without dues.issue /
 *      accounts.manage, another organization's accountant and anonymous; set_default_receivable_account refuses the
 *      accountant (42501), refuses a foreign / revenue / group account and a foreign property, and works for the owner.
 */
import { test, expect } from "./helpers/local-only";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
let other: JourneyFixture;
const dialogScope = (page: Page) => page.locator('[data-slot="dialog-content"][data-open]');
const SHOTS = "docs/audits/phase2-evidence/screens";

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
const countOf = async (table: string) => {
  const { count } = await adminClient().from(table).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId);
  return count ?? 0;
};
async function fillIssueDue(page: Page, dialog: ReturnType<typeof dialogScope>, note: string) {
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("700");
  await dialog.locator('input[type="date"]').nth(0).fill("2026-02-01");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-02-15");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill(note);
}
const lines = async (description: string) => {
  const admin = adminClient();
  const { data: je } = await admin.from("journal_entries").select("id").eq("organization_id", fx.orgId).ilike("description", `%${description}%`);
  const ids = (je ?? []).map((j) => j.id as string);
  const { data: ls } = await admin.from("journal_entry_lines").select("account_id,debit,credit").in("journal_entry_id", ids.length ? ids : [randomUUID()]);
  const code = Object.fromEntries(Object.entries(fx.accounts).map(([c, id]) => [id, c]));
  return (ls ?? []).map((l) => `${code[l.account_id as string]}:${Number(l.debit)}:${Number(l.credit)}`).sort();
};

test.beforeAll(async () => {
  test.setTimeout(300_000);
  fx = await createJourneyFixture("recv", { approveReceivable: false });
  other = await createJourneyFixture("recv-other", { approveReceivable: false });
});

test("R1 issue_dues refuses a missing, foreign, non-asset, group or inactive receivable account", async () => {
  const admin = adminClient();
  const acc = await signedInClient(fx.accountant.email);
  const dueType = (await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  const group = (await admin.from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("category", "ASSET").eq("is_group", true).limit(1).single()).data!.id as string;
  const inactive = randomUUID();
  await admin.from("chart_of_accounts").insert({ id: inactive, organization_id: fx.orgId, code: "1199", name_ar: "x", name_en: "Inactive asset", category: "ASSET", normal_balance: "DEBIT", is_group: false, is_active: false });
  const call = (receivable: string | null) =>
    acc.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: dueType, p_receivable_account_id: receivable, p_amount: 100, p_issue_date: "2026-02-01", p_due_date: "2026-02-15", p_description: "R1 refused" });

  const before = [await countOf("dues"), await countOf("journal_entries")];
  const cases: Array<[string, string | null, RegExp]> = [
    ["missing", null, /RECEIVABLE_ACCOUNT_REQUIRED/],
    ["another organization's asset account", other.accounts["1130"], /RECEIVABLE_ACCOUNT_INVALID/],
    ["revenue account", fx.accounts["4100"], /RECEIVABLE_ACCOUNT_INVALID/],
    ["group account", group, /RECEIVABLE_ACCOUNT_INVALID/],
    ["inactive account", inactive, /RECEIVABLE_ACCOUNT_INVALID/],
  ];
  for (const [what, id, re] of cases) {
    const res = await call(id);
    expect(res.error?.message, what).toMatch(re);
  }
  expect([await countOf("dues"), await countOf("journal_entries")]).toEqual(before);
});

test("R2 with no approved setting the receivable field is empty, a notice is shown, and an unchosen submit creates nothing", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  const field = dialog.getByRole("combobox").nth(2);
  await expect(field).not.toContainText(/1110|Cash/i);
  await expect(field).toContainText(/Select account/i);
  await expect(dialog.getByTestId("receivable-not-configured")).toBeVisible();
  await expect(dialog.getByTestId("save-receivable-default")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/30-issue-due-no-default.png` });
  const before = [await countOf("dues"), await countOf("journal_entries")];
  await fillIssueDue(page, dialog, "R2 no account chosen");
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect([await countOf("dues"), await countOf("journal_entries")]).toEqual(before);
});

test("R3 the owner chooses 1130 explicitly and approves it as the default; the due posts to 1130", async ({ page }) => {
  await signIn(page, fx.owner.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  await expect(dialog.getByTestId("save-receivable-default")).toBeVisible();
  await fillIssueDue(page, dialog, "R3 owner approves 1130");
  await choose(page, dialog, 2, /^1130/);
  await dialog.getByTestId("save-receivable-default").check();
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });
  expect(await lines("R3 owner approves 1130")).toEqual(["1130:700:0", "4100:0:700"]);
  const admin = adminClient();
  const setting = (await admin.from("organization_finance_settings").select("receivable_account_id").eq("organization_id", fx.orgId).eq("property_id", fx.propertyId).single()).data;
  expect(setting?.receivable_account_id).toBe(fx.accounts["1130"]);
  const { data: audit } = await admin.from("platform_audit_logs").select("actor_id,action").eq("organization_id", fx.orgId).eq("action", "finance.default_receivable_account.set");
  expect(audit).toHaveLength(1);
  expect(audit![0].actor_id).toBe(fx.owner.id);
});

test("R4 afterwards the accountant gets 1130 preselected and issues without touching the field", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  await expect(dialog.getByRole("combobox").nth(2)).toContainText(/^1130/);
  await expect(dialog.getByTestId("receivable-not-configured")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/31-issue-due-default-preselected.png` });
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("300");
  await dialog.locator('input[type="date"]').nth(0).fill("2026-02-02");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-02-16");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("R4 default preselected");
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });
  expect(await lines("R4 default preselected")).toEqual(["1130:300:0", "4100:0:300"]);
});

test("R5 who may read and who may set the approved account", async () => {
  const env = localEnv();
  const admin = adminClient();
  const accountant = await signedInClient(fx.accountant.email);
  const owner = await signedInClient(fx.owner.email);
  const auditor = await signedInClient(fx.auditor.email);
  const stranger = await signedInClient(other.accountant.email);
  const get = (c: Awaited<ReturnType<typeof signedInClient>>) => c.rpc("get_default_receivable_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId });

  expect((await get(accountant)).data).toBe(fx.accounts["1130"]);
  expect((await get(owner)).data).toBe(fx.accounts["1130"]);
  for (const [who, c] of [["auditor (no dues.issue / accounts.manage)", auditor], ["another organization's accountant", stranger]] as const) {
    const r = await get(c);
    expect(r.error?.code, who).toBe("42501");
  }
  const anon = createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await get(anon as never)).error).not.toBeNull();

  const set = (c: Awaited<ReturnType<typeof signedInClient>>, account: string, property = fx.propertyId) =>
    c.rpc("set_default_receivable_account", { p_organization_id: fx.orgId, p_property_id: property, p_account_id: account });
  expect((await set(accountant, fx.accounts["1130"])).error?.code).toBe("42501");
  expect((await set(auditor, fx.accounts["1130"])).error?.code).toBe("42501");
  expect((await set(stranger, fx.accounts["1130"])).error?.code).toBe("42501");
  expect((await set(owner, fx.accounts["4100"])).error?.message).toMatch(/RECEIVABLE_ACCOUNT_INVALID/);
  expect((await set(owner, other.accounts["1130"])).error?.message).toMatch(/RECEIVABLE_ACCOUNT_INVALID/);
  expect((await set(owner, fx.accounts["1130"], other.propertyId)).error?.message).toMatch(/PROPERTY_NOT_FOUND/);
  // a stale setting (account deactivated afterwards) reads as "not configured", not as an unusable account
  await admin.from("chart_of_accounts").update({ is_active: false }).eq("id", fx.accounts["1130"]);
  expect((await get(accountant)).data).toBeNull();
  await admin.from("chart_of_accounts").update({ is_active: true }).eq("id", fx.accounts["1130"]);
  expect((await get(accountant)).data).toBe(fx.accounts["1130"]);
});
