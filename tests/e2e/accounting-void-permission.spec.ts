/**
 * Phase 2b — who may reverse (void) a receipt. The default role templates are NOT widened for the demo.
 *
 * FIXED BEFORE EXECUTION
 *   W1 the permission key is finance.payments.void; of the shipped templates only TENANT_OWNER and FINANCE_MANAGER hold
 *      it; the shipped ACCOUNTANT does not (and the organization's cloned ACCOUNTANT role does not either).
 *   W2 a user with the shipped ACCOUNTANT role: the receipts screen offers no "Reverse" control for a posted receipt;
 *      calling void_payment is refused (42501); the receipt stays POSTED; no journal entry or audit row is added.
 *   W3 a user explicitly granted the key (role ACCOUNTANT_WITH_VOID, created by the fixture for the demo only) reverses
 *      receipt #1 in the UI: payment REVERSED, a mirror entry posted, one PAYMENT_REVERSED audit row. A user with the
 *      shipped FINANCE_MANAGER role reverses receipt #2 through the same RPC.
 *   W4 refused (42501): auditor, a void-capable user of ANOTHER organization, anonymous.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
let other: JourneyFixture;
let plain: { id: string; email: string };
let manager: { id: string; email: string };
const payments: string[] = [];
let dueId = "";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
async function userWithShippedRole(org: JourneyFixture, label: string, roleKey: string) {
  const admin = adminClient();
  const email = `${label}-${org.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const role = (await admin.from("roles").select("id").eq("organization_id", org.orgId).eq("key", roleKey).single()).data!.id as string;
  await admin.from("organization_memberships").insert({ organization_id: org.orgId, user_id: created.data.user.id, status: "active" });
  await admin.from("user_role_assignments").insert({ organization_id: org.orgId, user_id: created.data.user.id, role_id: role });
  return { id: created.data.user.id, email };
}
const state = async () => {
  const admin = adminClient();
  const count = async (t: string) => (await admin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId)).count ?? 0;
  return { entries: await count("journal_entries"), audit: await count("financial_audit_logs"), payments: await count("payments") };
};
const status = async (id: string) => (await adminClient().from("payments").select("status").eq("id", id).single()).data?.status;
const rpcVoid = (c: Awaited<ReturnType<typeof signedInClient>>, id: string, org = fx.orgId) => c.rpc("void_payment", { p_organization_id: org, p_payment_id: id, p_reason: "Wrong tenant" });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  fx = await createJourneyFixture("void", { approveReceivable: false });
  other = await createJourneyFixture("void-other", { approveReceivable: false });
  plain = await userWithShippedRole(fx, "plain-accountant", "ACCOUNTANT");
  manager = await userWithShippedRole(fx, "finance-manager", "FINANCE_MANAGER");
  // two receipts recorded by the demo accountant (unallocated advance receipts; the point here is who can reverse)
  const admin = adminClient();
  const session = await signedInClient(fx.accountant.email);
  const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-02-10").gte("end_date", "2026-02-10").single()).data!.id as string;
  // a receipt must be allocated to a due: issue one due of 1,000 (explicit receivable account 1130)
  const dueType = (await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  const issued = await session.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: dueType, p_receivable_account_id: fx.accounts["1130"], p_amount: 1000, p_issue_date: "2026-02-01", p_due_date: "2026-02-15", p_description: "void permission test" });
  expect(issued.error, issued.error?.message).toBeNull();
  dueId = (await admin.from("dues").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  for (const amount of [150, 250]) {
    const r = await session.rpc("record_payment", {
      p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: amount, p_method: "CASH",
      p_payment_date: "2026-02-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [{ due_id: dueId, amount }], p_idempotency_key: randomUUID(),
    });
    expect(r.error, r.error?.message).toBeNull();
  }
  const rows = (await admin.from("payments").select("id,receipt_number").eq("organization_id", fx.orgId).order("receipt_number")).data!;
  payments.push(...rows.map((p) => p.id as string));
  expect(payments).toHaveLength(2);
});

test("W1 only the owner and finance-manager templates hold finance.payments.void; the accountant template does not", async () => {
  const admin = adminClient();
  const holders = (await admin.from("role_template_permissions").select("role_template_key").eq("permission_key", "finance.payments.void")).data!.map((r) => r.role_template_key as string).sort();
  expect(holders).toEqual(["FINANCE_MANAGER", "TENANT_OWNER"]);
  const accountantRole = (await admin.from("roles").select("id").eq("organization_id", fx.orgId).eq("key", "ACCOUNTANT").single()).data!.id as string;
  const perm = (await admin.from("permissions").select("id").eq("key", "finance.payments.void").single()).data!.id as string;
  const has = await admin.from("role_permissions").select("role_id").eq("role_id", accountantRole).eq("permission_id", perm);
  expect(has.data).toHaveLength(0);
  // the demo-only role is a separate, non-system role in this organization
  const demoRole = (await admin.from("roles").select("is_system").eq("organization_id", fx.orgId).eq("key", "ACCOUNTANT_WITH_VOID").single()).data!;
  expect(demoRole.is_system).toBe(false);
});

test("W2 a shipped-ACCOUNTANT user sees no Reverse control and the database refuses; nothing changes", async ({ page }) => {
  const before = await state();
  await signIn(page, plain.email);
  await go(page, "/en/finance/payments");
  const row = page.getByRole("row", { name: /#1\b/ });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.getByRole("button", { name: /Reverse/i })).toHaveCount(0);
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/50-receipts-no-reverse-for-accountant.png" });

  const session = await signedInClient(plain.email);
  const refused = await rpcVoid(session, payments[0]);
  expect(refused.error?.code, refused.error?.message).toBe("42501");
  expect(await status(payments[0])).toBe("POSTED");
  expect(await state()).toEqual(before);
});

test("W3 an explicitly authorized user reverses in the UI; a finance manager can through the RPC", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  const row = page.getByRole("row", { name: /#1\b/ });
  await expect(row.getByRole("button", { name: /Reverse/i })).toBeVisible({ timeout: 60_000 });
  const entriesBefore = (await state()).entries;
  await row.getByRole("button", { name: /Reverse/i }).click();
  // the product opens an in-app confirmation dialog with a required reason (no native dialog)
  const voidDialog = page.getByTestId("void-receipt-dialog");
  await voidDialog.getByTestId("void-reason-input").fill("Wrong tenant");
  await voidDialog.getByRole("button", { name: /Confirm reversal/i }).click();
  await expect(page.getByRole("row", { name: /#1\b/ })).toContainText(/Reversed/i, { timeout: 60_000 });
  expect(await status(payments[0])).toBe("REVERSED");
  expect((await state()).entries).toBe(entriesBefore + 1); // exactly one mirror entry
  const audits = await adminClient().from("financial_audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).eq("action", "PAYMENT_REVERSED");
  expect(audits.count).toBe(1);

  const fm = await signedInClient(manager.email);
  const done = await rpcVoid(fm, payments[1]);
  expect(done.error, done.error?.message).toBeNull();
  expect(await status(payments[1])).toBe("REVERSED");
});

test("W4 refused for the auditor, another organization's void-capable user, and anonymous", async () => {
  // a fresh receipt so there is something POSTED left to protect
  const admin = adminClient();
  const session = await signedInClient(fx.accountant.email);
  const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-02-10").gte("end_date", "2026-02-10").single()).data!.id as string;
  const r = await session.rpc("record_payment", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 75, p_method: "CASH",
    p_payment_date: "2026-02-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [{ due_id: dueId, amount: 75 }], p_idempotency_key: randomUUID(),
  });
  expect(r.error, r.error?.message).toBeNull();
  const target = (await admin.from("payments").select("id").eq("organization_id", fx.orgId).eq("status", "POSTED").single()).data!.id as string;

  const before = await state();
  expect((await rpcVoid(await signedInClient(fx.auditor.email), target)).error?.code).toBe("42501");
  // the other organization's accountant has the void key THERE, but not here
  const otherVoid = await signedInClient(other.accountant.email);
  expect((await rpcVoid(otherVoid, target)).error?.code).toBe("42501");
  expect((await rpcVoid(otherVoid, target, other.orgId)).error?.message ?? "").toMatch(/PAYMENT_NOT_FOUND/); // wrong organization for that payment
  const anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await anon.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: target, p_reason: "x" })).error).not.toBeNull();
  expect(await status(target)).toBe("POSTED");
  expect(await state()).toEqual(before);
});
