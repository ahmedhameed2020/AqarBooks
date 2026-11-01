/**
 * Acceptance review — visitor pass → gate scan, performed through the product: the owner creates a pass in the portal,
 * a GUARD (not the manager) scans it from an enrolled device, and the pass rules are exercised with the real scanner
 * screen. Every step records what the database holds afterwards.
 *
 * Expected reason codes come from the access ledger contract (access_events_reason_code_check):
 *   SINGLE_USE: entry → ALLOW/VALID_ENTRY; entry again while inside → DENY/PASS_ALREADY_USED (the pass is consumed by its
 *               first entry, which takes precedence over ALREADY_INSIDE); exit → ALLOW/VALID_EXIT; entry again → DENY/PASS_ALREADY_USED.
 *   MULTI_USE:  exit while outside → DENY/NOT_INSIDE; entry → ALLOW; entry again → DENY/ALREADY_INSIDE; exit → ALLOW; entry → ALLOW.
 *   REVOKED → DENY/REVOKED.   Expired → DENY/EXPIRED.   Not yet valid → DENY/NOT_YET_VALID.   Wrong secret → DENY/INVALID_PASS.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { createPortalWorld, password, type Owner, type PortalWorld } from "./helpers/portal-fixture";
import { body, go, portalLogin, q, sha } from "./helpers/portal-ui";
import { enrollment, login as staffLogin, manualScan, redeem, resultPanel } from "./gate-release-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let W: PortalWorld;
let deviceId = "";
// the guard's enrolled device lives in IndexedDB; a real phone keeps it between visits, so later tests start from it
const GUARD_DEVICE_STATE = join(tmpdir(), "aqarbooks-guard-device-state.json");
const payloads: Record<string, { payload: string; id: string }> = {};
const evidence: Record<string, unknown> = {};
const note = (k: string, v: unknown) => { evidence[k] = v; };
const SHOTS = "docs/audits/portal-review-evidence/screens";
const owner1 = () => W.A.owners[0];
const owner2 = () => W.A.owners[1];

test.beforeAll(async () => {
  test.setTimeout(300_000);
  W = await createPortalWorld();
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => {
  writeFileSync("docs/audits/portal-review-evidence/visitor-gate-observations.json", JSON.stringify(evidence, null, 2));
});

/** The owner creates a pass through the portal form; returns the AQP1 payload shown once on the page. */
async function createPass(page: Page, who: Owner, key: string, guest: string, policy: "SINGLE_USE" | "MULTI_USE") {
  await portalLogin(page, who.email);
  await go(page, "/en/portal/visitors/new");
  await expect(page.getByRole("button", { name: "Create Pass" })).toBeVisible({ timeout: 60_000 });
  await page.locator("select").nth(1).selectOption(policy);
  await page.getByPlaceholder("Example: Alex Morgan").fill(guest);
  await page.getByRole("button", { name: "Create Pass" }).click();
  const payloadLocator = page.locator("text=/AQP1\\.[0-9a-f-]{36}\\./").first();
  await expect(payloadLocator).toBeVisible({ timeout: 60_000 });
  const payload = (await payloadLocator.innerText()).trim();
  payloads[key] = { payload, id: payload.split(".")[1] };
  return payloads[key];
}
const events = (id: string) => q(`select coalesce(string_agg(direction||':'||decision||':'||reason_code, ' | ' order by occurred_at, created_at), '') from public.access_events where visitor_invitation_id='${id}'`);
const lastEvent = (id: string) => q(`select decision||':'||reason_code from public.access_events where visitor_invitation_id='${id}' order by occurred_at desc, created_at desc limit 1`);
const count = (id: string) => Number(q(`select count(*) from public.access_events where visitor_invitation_id='${id}'`));

async function guardScanner(page: Page) {
  // the owner portal session must be dropped, but the guard's device binding lives in the browser storage and survives
  await page.context().clearCookies();
  await staffLogin(page, W.A.gate.guard);
  await go(page, `/en/operations/gate?deviceId=${deviceId}`);
  await expect(page.getByRole("button", { name: "Entry", exact: true })).toBeVisible({ timeout: 60_000 });
}
/** One real scan through the scanner screen (the client suppresses an identical payload for a few seconds). */
async function scan(page: Page, key: string, direction: "Entry" | "Exit") {
  const { payload, id } = payloads[key];
  const before = count(id);
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: direction, exact: true }).click();
  await manualScan(page, payload);
  await expect.poll(() => count(id), { timeout: 30_000 }).toBe(before + 1);
  return (await resultPanel(page).innerText()).replace(/\s+/g, " ");
}

test("V1 the manager creates a one-time enrollment code; the guard redeems it on the field device", async ({ page }) => {
  await staffLogin(page, W.A.gate.manager);
  const code = await enrollment(page, W.A.gate); // manager: operations.gates.devices.manage
  await page.context().clearCookies();
  await staffLogin(page, W.A.gate.guard); // the guard holds the device and redeems the code (operations.gates.scan)
  await redeem(page, code);
  await expect(page).toHaveURL(/deviceId=/);
  deviceId = new URL(page.url()).searchParams.get("deviceId")!;
  note("V1", {
    deviceId,
    device: q(`select allowed_direction||':'||display_name from public.gate_devices where id='${deviceId}'`),
    enrolledByIsGuard: q(`select enrolled_by from public.gate_devices where id='${deviceId}'`) === W.A.gate.guard.id,
    enrolledByIsManager: q(`select enrolled_by from public.gate_devices where id='${deviceId}'`) === W.A.gate.manager.id,
    enrollmentCodeReuse: "rejected by the existing gate-device-enrollment spec (reuse)",
  });
  await expect(page.getByRole("button", { name: "Entry", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/V1-guard-scanner.png` });
  await page.context().storageState({ path: GUARD_DEVICE_STATE, indexedDB: true });
  // a guard cannot create enrollment codes: the manage screen offers no way to do it
  await go(page, "/en/operations/gates");
  note("V1-guard-gates-page", (await body(page)).slice(0, 220));
});

test.describe("with the guard's enrolled device", () => {
test.use({ storageState: GUARD_DEVICE_STATE });

test("V2 owner creates a SINGLE_USE pass (QR shown once, only its hash is stored); the guard admits, lets out, then refuses a second use", async ({ page }) => {
  const p = await createPass(page, owner1(), "single", "Alex Morgan", "SINGLE_USE");
  await expect(page.getByAltText("Visitor pass QR code")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/V2-pass-qr.png`, fullPage: true });
  const secret = p.payload.split(".")[2];
  expect(q(`select usage_policy||'|'||status||'|'||invited_by_member_id||'|'||unit_id from public.visitor_invitations where id='${p.id}'`).split("|")).toEqual(["SINGLE_USE", "ACTIVE", owner1().memberId, owner1().unitId]);
  expect(q(`select token_hash from public.visitor_invitation_secrets where invitation_id='${p.id}'`)).toBe(sha(secret));
  expect(q(`select count(*) from public.visitor_invitations where to_jsonb(visitor_invitations)::text like '%${secret}%'`)).toBe("0");
  expect(q(`select count(*) from public.notifications where (coalesce(title_en,'')||coalesce(body_en,'')) like '%${secret}%'`)).toBe("0");

  await guardScanner(page);
  note("V2-entry", await scan(page, "single", "Entry"));
  expect(lastEvent(p.id)).toBe("ALLOW:VALID_ENTRY");
  await page.screenshot({ path: `${SHOTS}/V2-guard-allow.png` });
  note("V2-entry-while-inside", await scan(page, "single", "Entry"));
  expect(lastEvent(p.id)).toBe("DENY:PASS_ALREADY_USED");
  note("V2-exit", await scan(page, "single", "Exit"));
  expect(lastEvent(p.id)).toBe("ALLOW:VALID_EXIT");
  note("V2-second-use", await scan(page, "single", "Entry"));
  expect(lastEvent(p.id)).toBe("DENY:PASS_ALREADY_USED");
  await page.screenshot({ path: `${SHOTS}/V2-guard-deny-used.png` });
  expect(q(`select operator_user_id||'|'||gate_id||'|'||unit_id||'|'||usage_policy||'|'||guest_name from public.access_events where visitor_invitation_id='${p.id}' and reason_code='VALID_ENTRY'`).split("|"))
    .toEqual([W.A.gate.guard.id, W.A.gate.gate, owner1().unitId, "SINGLE_USE", "Alex Morgan"]);
  note("V2-ledger", events(p.id));
});

test("V3 a MULTI_USE pass admits repeatedly but never twice in a row without an exit", async ({ page }) => {
  const p = await createPass(page, owner1(), "multi", "Mariam Ali", "MULTI_USE");
  await guardScanner(page);
  await scan(page, "multi", "Exit");
  expect(lastEvent(p.id)).toBe("DENY:NOT_INSIDE");
  await scan(page, "multi", "Entry");
  expect(lastEvent(p.id)).toBe("ALLOW:VALID_ENTRY");
  await scan(page, "multi", "Entry");
  expect(lastEvent(p.id)).toBe("DENY:ALREADY_INSIDE");
  await scan(page, "multi", "Exit");
  expect(lastEvent(p.id)).toBe("ALLOW:VALID_EXIT");
  await scan(page, "multi", "Entry");
  expect(lastEvent(p.id)).toBe("ALLOW:VALID_ENTRY");
  note("V3-ledger", events(p.id));
});

test("V4 the owner revokes a pass in the portal; the guard is then refused; another owner cannot revoke it", async ({ page }) => {
  const p = await createPass(page, owner1(), "revoked", "Revoked Guest", "MULTI_USE");
  await go(page, `/en/portal/visitors/${p.id}`);
  await page.getByRole("button", { name: /Revoke/i }).first().click();
  await expect.poll(() => q(`select status from public.visitor_invitations where id='${p.id}'`), { timeout: 60_000 }).toBe("REVOKED");
  expect(q(`select (revoked_by is not null)::text||'|'||(revoked_at is not null)::text from public.visitor_invitations where id='${p.id}'`)).toBe("true|true");
  note("V4-notifications", q(`select coalesce(string_agg(type||':'||source_type, ','), '') from public.notifications where source_id='${p.id}'`));
  await guardScanner(page);
  await scan(page, "revoked", "Entry");
  expect(lastEvent(p.id)).toBe("DENY:REVOKED");

  // owner 2 (same organization) tries to revoke owner 1's other pass through the API
  const o2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const signed = await o2.auth.signInWithPassword({ email: owner2().email, password });
  expect(signed.error).toBeNull();
  const attempt = await o2.rpc("revoke_visitor_invitation", { p_invitation_id: payloads.multi.id });
  note("V4-other-owner-revoke", { code: attempt.error?.code, message: attempt.error?.message });
  expect(attempt.error).not.toBeNull();
  expect(q(`select status from public.visitor_invitations where id='${payloads.multi.id}'`)).toBe("ACTIVE");
});

test("V5 expired and not-yet-valid passes are refused; a tampered or foreign QR is refused as an invalid pass", async ({ page }) => {
  const exp = await createPass(page, owner1(), "expired", "Late Guest", "MULTI_USE");
  const future = await createPass(page, owner1(), "future", "Early Guest", "MULTI_USE");
  // time cannot be moved in the UI: the validity window is edited directly (service) to simulate the clock passing
  q(`update public.visitor_invitations set valid_from=now()-interval '3 hours', valid_until=now()-interval '1 hour' where id='${exp.id}'`);
  q(`update public.visitor_invitations set valid_from=now()+interval '2 hours', valid_until=now()+interval '5 hours' where id='${future.id}'`);
  await guardScanner(page);
  await scan(page, "expired", "Entry");
  expect(lastEvent(exp.id)).toBe("DENY:EXPIRED");
  await scan(page, "future", "Entry");
  expect(lastEvent(future.id)).toBe("DENY:NOT_YET_VALID");

  // A forged scan is recorded at ORGANIZATION level as INVALID_PASS with no invitation attached: the real pass's own
  // ledger is not polluted by forgeries, yet the attempt, the gate and the operator are on record.
  const invalidCount = () => Number(q(`select count(*) from public.access_events where organization_id='${W.A.org}' and reason_code='INVALID_PASS' and visitor_invitation_id is null`));
  const forged = async (payload: string) => {
    const before = invalidCount();
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: "Entry", exact: true }).click();
    await manualScan(page, payload);
    await expect.poll(invalidCount, { timeout: 30_000 }).toBe(before + 1);
    return (await resultPanel(page).innerText()).replace(/\s+/g, " ");
  };
  const real = payloads.multi;
  const realEvents = count(real.id);
  note("V5-wrong-secret", await forged(`AQP1.${real.id}.${randomUUID()}`)); // real id, wrong secret
  note("V5-unknown-pass", await forged(`AQP1.${randomUUID()}.${randomUUID()}`)); // id that does not exist
  expect(count(real.id)).toBe(realEvents); // the real pass was not touched by either
  expect(q(`select operator_user_id||'|'||gate_id from public.access_events where organization_id='${W.A.org}' and reason_code='INVALID_PASS' and visitor_invitation_id is null order by occurred_at desc limit 1`)).toBe(`${W.A.gate.guard.id}|${W.A.gate.gate}`);
  await page.screenshot({ path: `${SHOTS}/V5-guard-deny-forged.png` });
  note("V5-ledger-expired", events(exp.id));
  note("V5-ledger-future", events(future.id));
  await page.screenshot({ path: `${SHOTS}/V5-guard-deny-unknown.png` });
});

test("V6 a pass of another organization is refused at this organization's gate and writes nothing to its ledger", async () => {
  // organization B's guard (a real session) scans organization A's pass at B's own gate
  const guardB = W.B.gate.guard.client;
  const real = payloads.multi;
  const secret = real.payload.split(".")[2];
  const before = count(real.id);
  const res = await guardB.rpc("process_visitor_gate_scan", { p_gate_id: W.B.gate.gate, p_invitation_id: real.id, p_raw_secret: secret, p_direction: "ENTRY", p_client_scan_id: randomUUID() });
  note("V6-cross-org-scan", { error: res.error ? { code: res.error.code, message: res.error.message } : null, data: res.data });
  // organization A's guard at organization B's gate
  const res2 = await W.A.gate.guard.client.rpc("process_visitor_gate_scan", { p_gate_id: W.B.gate.gate, p_invitation_id: real.id, p_raw_secret: secret, p_direction: "ENTRY", p_client_scan_id: randomUUID() });
  note("V6-guard-A-at-gate-B", { error: res2.error ? { code: res2.error.code, message: res2.error.message } : null, data: res2.data });
  // neither call may have admitted anyone or altered the pass
  expect(count(real.id)).toBe(before);
  expect(q(`select count(*) from public.access_events where visitor_invitation_id='${real.id}' and organization_id<>'${W.A.org}'`)).toBe("0");
  const decision = (r: typeof res) => (r.error ? "ERROR" : (r.data as { decision?: string } | null)?.decision ?? JSON.stringify(r.data));
  expect(decision(res)).not.toBe("ALLOW");
  expect(decision(res2)).not.toBe("ALLOW");
});


test("V6b organization B's enrolled device scanning A's genuine pass is a generic DENY / INVALID_PASS recorded in B only", async () => {
  const real = payloads.multi;
  const secret = real.payload.split(".")[2];
  const dev = W.B.gate.device();
  const beforeB = Number(q(`select count(*) from public.access_events where organization_id='${W.B.org}'`));
  const beforeA = Number(q(`select count(*) from public.access_events where organization_id='${W.A.org}'`));
  const res3 = await W.B.gate.guard.client.rpc("process_visitor_gate_scan", { p_device_id: dev.id, p_device_credential: dev.credential, p_gate_id: W.B.gate.gate, p_invitation_id: real.id, p_raw_secret: secret, p_direction: "ENTRY", p_client_scan_id: randomUUID(), p_scanner_version: "review" });
  note("V6-org-B-device-scans-A-pass", { error: res3.error ? { code: res3.error.code, message: res3.error.message } : null, data: res3.data });
  expect(res3.error, res3.error?.message).toBeNull();
  const row3 = (Array.isArray(res3.data) ? res3.data[0] : res3.data) as { decision: string; reason_code: string };
  expect([row3.decision, row3.reason_code]).toEqual(["DENY", "INVALID_PASS"]); // indistinguishable from a forged pass: nothing about A is revealed
  // the denial lands in B's own ledger (no invitation attached), never in A's, and A's pass is untouched
  expect(Number(q(`select count(*) from public.access_events where organization_id='${W.B.org}'`))).toBe(beforeB + 1);
  expect(q(`select count(*) from public.access_events where organization_id='${W.B.org}' and visitor_invitation_id='${real.id}'`)).toBe("0");
  expect(q(`select count(*) from public.access_events where visitor_invitation_id='${real.id}' and organization_id <> '${W.A.org}'`)).toBe("0");
  expect(Number(q(`select count(*) from public.access_events where organization_id='${W.A.org}'`))).toBe(beforeA);
  // the response carries nothing about A's pass: no guest name, invitation number, unit or validity
  const r3 = row3 as Record<string, unknown>;
  expect([r3.guest_name, r3.invitation_no, r3.unit_id, r3.invitation_id, r3.valid_until, r3.usage_policy]).toEqual([null, null, null, null, null, null]);
  expect(JSON.stringify(res3.data)).not.toContain(real.id);

});

});
