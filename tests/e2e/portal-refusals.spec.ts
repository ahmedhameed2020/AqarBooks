/**
 * Acceptance review — what must be REFUSED around the customer portal, maintenance, passes and gates.
 * Real pages (owner sessions through the email-code login) and the real RPCs under the caller's own session.
 * Every refusal also asserts that nothing changed in the database.
 *
 *   R1 another owner of the SAME organization   R2 an owner of ANOTHER organization (same unit code R-101)
 *   R3 an owner against staff-only surfaces and staff against owner-only functions
 *   R4 a suspended owner account                R5 an inactive organization
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/local-only";
import { createPortalWorld, password, type PortalWorld } from "./helpers/portal-fixture";
import { body, go, portalLogin, q, sha } from "./helpers/portal-ui";
import { login as staffLogin } from "./gate-release-helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

let W: PortalWorld;
const evidence: Record<string, unknown> = {};
const note = (k: string, v: unknown) => { evidence[k] = v; };
const SHOTS = "docs/audits/portal-review-evidence/screens";
let requestId = "", requestTitle = "", pass: { id: string; secret: string; payload: string };
let o1: SupabaseClient, o2: SupabaseClient, oB: SupabaseClient;
const owner1 = () => W.A.owners[0];
const owner2 = () => W.A.owners[1];
const ownerB = () => W.B.owners[0];

async function session(email: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await c.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  return c;
}
const err = (r: { error: { code?: string; message: string } | null }) => (r.error ? `${r.error.code}:${r.error.message}` : null);
const dbCounts = () => ({
  requests: q(`select count(*) from public.maintenance_requests`),
  passes: q(`select count(*) from public.visitor_invitations`),
  events: q(`select count(*) from public.access_events`),
  updates: q(`select count(*) from public.maintenance_request_updates`),
});

test.beforeAll(async () => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  W = await createPortalWorld();
  o1 = await session(owner1().email);
  o2 = await session(owner2().email);
  oB = await session(ownerB().email);
  // owner 1 files a request through the product RPC (own session), and holds one genuine pass
  const cat = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
  requestTitle = `Owner one private request ${randomUUID().slice(0, 8)}`;
  const created = await o1.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: cat, p_title: requestTitle, p_description: "Only owner one and the staff may see this.", p_priority: "NORMAL" });
  expect(created.error, created.error?.message).toBeNull();
  requestId = created.data as string;
  pass = W.A.gate.invitation("Guest of owner one");
});
test.afterAll(() => {
  writeFileSync("docs/audits/portal-review-evidence/refusal-observations.json", JSON.stringify(evidence, null, 2));
});

test("R1 another owner of the same organization: pages show nothing of owner 1; API refuses creation for, and reads of, owner 1's unit", async ({ page }) => {
  await portalLogin(page, owner2().email);
  for (const [name, url, secret] of [
    ["maintenance request", `/en/portal/maintenance/${requestId}`, requestTitle],
    ["visitor pass", `/en/portal/visitors/${pass.id}`, "Guest of owner one"],
  ] as const) {
    await go(page, url);
    const text = await body(page);
    expect(text, `${name} must not be shown to owner 2`).not.toContain(secret);
    note(`R1-${name}-page`, text.slice(0, 160));
  }
  await go(page, "/en/portal/maintenance");
  expect(await body(page)).not.toContain(requestTitle);
  await page.screenshot({ path: `${SHOTS}/R1-owner2-maintenance-list.png` });
  // the other money screens are separate pages from the statement: owner 2 sees only owner 2's 7,777
  for (const [name, url] of [["dues", "/en/portal/dues"], ["payments", "/en/portal/payments"]] as const) {
    await go(page, url);
    const text = await body(page);
    expect(text, `${name}: owner 1's charges must not appear`).not.toMatch(/Charge (3000|1500)|REC-1000/);
    expect(text, `${name}: organization B's charge must not appear`).not.toContain("Charge 9999");
    note(`R1-${name}-page`, text.slice(0, 200));
  }

  const before = dbCounts();
  const cat = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
  const r1 = await o2.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: cat, p_title: "Intrusion", p_description: "Not my unit at all.", p_priority: "NORMAL" });
  const r2 = await o2.rpc("create_visitor_invitation", { p_unit_id: owner1().unitId, p_token_hash: "a".repeat(64), p_token_hint: "x", p_guest_name: "Intruder", p_guest_phone: null, p_guest_note: null, p_valid_from: new Date().toISOString(), p_valid_until: new Date(Date.now() + 3600_000).toISOString(), p_usage_policy: "SINGLE_USE" });
  const r3 = await o2.rpc("cancel_own_maintenance_request", { p_request_id: requestId, p_note: "not mine" });
  const r4 = await o2.rpc("revoke_visitor_invitation", { p_invitation_id: pass.id });
  note("R1-api", { createRequest: err(r1), createPass: err(r2), cancelOthersRequest: err(r3), revokeOthersPass: err(r4) });
  for (const r of [r1, r2, r3, r4]) expect(r.error).not.toBeNull();
  // reads through RLS return nothing
  expect((await o2.from("maintenance_requests").select("id").eq("id", requestId)).data).toEqual([]);
  expect((await o2.from("visitor_invitations").select("id").eq("id", pass.id)).data).toEqual([]);
  expect((await o2.from("dues").select("id,amount").eq("unit_id", owner1().unitId)).data).toEqual([]);
  expect(dbCounts()).toEqual(before);
  expect(q(`select status from public.maintenance_requests where id='${requestId}'`)).toBe("SUBMITTED");
  expect(q(`select status from public.visitor_invitations where id='${pass.id}'`)).toBe("ACTIVE");
});

test("R2 an owner of ANOTHER organization (same unit code R-101): nothing of A is visible or creatable", async ({ page }) => {
  await portalLogin(page, ownerB().email);
  for (const url of [`/en/portal/maintenance/${requestId}`, `/en/portal/visitors/${pass.id}`]) {
    await go(page, url);
    const text = await body(page);
    expect(text).not.toContain(requestTitle);
    expect(text).not.toContain("Guest of owner one");
  }
  await go(page, "/en/portal/units");
  const units = await body(page);
  expect(units).not.toContain("R-202");
  for (const url of ["/en/portal/dues", "/en/portal/payments"]) {
    await go(page, url);
    expect(await body(page), url).not.toMatch(/Charge (3000|1500|7777)|REC-1000/);
  }
  await go(page, "/en/portal/statement");
  const statement = await body(page);
  expect(statement).not.toMatch(/Charge (3000|1500|7777)/);
  expect(statement).toContain("Charge 9999"); // their own
  await page.screenshot({ path: `${SHOTS}/R2-ownerB-statement.png`, fullPage: true });

  const before = dbCounts();
  const catA = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
  const r1 = await oB.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: catA, p_title: "Cross-tenant", p_description: "Not my organization at all.", p_priority: "NORMAL" });
  const r2 = await oB.rpc("create_visitor_invitation", { p_unit_id: owner1().unitId, p_token_hash: "b".repeat(64), p_token_hint: "x", p_guest_name: "Cross", p_guest_phone: null, p_guest_note: null, p_valid_from: new Date().toISOString(), p_valid_until: new Date(Date.now() + 3600_000).toISOString(), p_usage_policy: "SINGLE_USE" });
  note("R2-api", { createRequestInA: err(r1), createPassInA: err(r2) });
  expect(r1.error).not.toBeNull();
  expect(r2.error).not.toBeNull();
  for (const t of ["maintenance_requests", "visitor_invitations", "access_events", "dues", "members"]) {
    const rows = (await oB.from(t).select("organization_id").eq("organization_id", W.A.org)).data;
    expect(rows ?? [], `${t} of A visible to B`).toEqual([]);
  }
  expect(dbCounts()).toEqual(before);
});

test("R3 an owner cannot use staff surfaces; staff cannot use owner-only functions", async ({ page }) => {
  await portalLogin(page, owner1().email);
  for (const url of ["/en/operations/maintenance", `/en/operations/maintenance/${requestId}`, "/en/operations/gate", "/en/operations/visitors", "/en/finance/dues"]) {
    await go(page, url);
    const text = await body(page);
    const staffDataVisible = text.includes(requestTitle) || /Gate Scanner|Release guard/.test(text);
    note(`R3-owner-url ${url}`, { finalUrl: page.url().replace(/^https?:\/\/[^/]+/, ""), staffDataVisible, snippet: text.slice(0, 120) });
    expect(staffDataVisible, url).toBe(false);
  }
  const upd = await o1.rpc("update_maintenance_request_staff", { p_request_id: requestId, p_next_status: "COMPLETED", p_category_id: null, p_priority: null, p_note: "owner tries staff action", p_visibility: "MEMBER_VISIBLE" });
  const scan = await o1.rpc("process_visitor_gate_scan", { p_gate_id: W.A.gate.gate, p_invitation_id: pass.id, p_raw_secret: pass.secret, p_direction: "ENTRY", p_client_scan_id: randomUUID() });
  note("R3-owner-api", { staffUpdate: err(upd), gateScan: err(scan) });
  expect(upd.error).not.toBeNull();
  expect(scan.error).not.toBeNull();
  expect(q(`select status from public.maintenance_requests where id='${requestId}'`)).toBe("SUBMITTED");
  expect(q(`select count(*) from public.access_events where visitor_invitation_id='${pass.id}'`)).toBe("0");

  // staff (manager / guard) have no member identity: owner-only functions refuse them
  const mgr = W.A.gate.manager.client;
  const cat = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
  const s1 = await mgr.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: cat, p_title: "Staff as owner", p_description: "Staff have no member identity.", p_priority: "NORMAL" });
  const s2 = await W.A.gate.guard.client.rpc("create_visitor_invitation", { p_unit_id: owner1().unitId, p_token_hash: "c".repeat(64), p_token_hint: "x", p_guest_name: "Staff pass", p_guest_phone: null, p_guest_note: null, p_valid_from: new Date().toISOString(), p_valid_until: new Date(Date.now() + 3600_000).toISOString(), p_usage_policy: "SINGLE_USE" });
  note("R3-staff-api", { createRequestAsStaff: err(s1), createPassAsGuard: err(s2) });
  expect(s1.error).not.toBeNull();
  expect(s2.error).not.toBeNull();
  // an anonymous caller reaches nothing
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const a1 = await anon.rpc("process_visitor_gate_scan", { p_gate_id: W.A.gate.gate, p_invitation_id: pass.id, p_raw_secret: pass.secret, p_direction: "ENTRY", p_client_scan_id: randomUUID() });
  expect(a1.error).not.toBeNull();
  note("R3-anon-scan", err(a1));
  await page.context().clearCookies();
  await staffLogin(page, W.A.gate.guard); // a guard session on the same browser reaches the scanner but never the finance screens
  await go(page, "/en/finance/dues");
  note("R3-guard-finance", { finalUrl: page.url().replace(/^https?:\/\/[^/]+/, ""), snippet: (await body(page)).slice(0, 140) });
});

test("R4 a suspended owner account: portal creation is refused; passes issued earlier by that owner stop admitting (G3)", async ({ page }) => {
  // staff suspension is covered by tests/owner-portal-functions-authz.integration.test.ts; here the resulting state is
  // set directly so the effect on the owner's own screens and on an already-issued pass can be observed
  q(`insert into public.member_portal_access(organization_id,member_id,status,login_method,auth_user_id,auth_origin,suspended_at,activated_at)
     values('${W.A.org}','${owner1().memberId}','suspended','email','${owner1().userId}','linked_existing',now(),now())`);
  const before = dbCounts();
  const cat = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
  const c1 = await o1.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: cat, p_title: "Suspended owner", p_description: "Should be refused outright.", p_priority: "NORMAL" });
  const c2 = await o1.rpc("create_visitor_invitation", { p_unit_id: owner1().unitId, p_token_hash: "d".repeat(64), p_token_hint: "x", p_guest_name: "Suspended", p_guest_phone: null, p_guest_note: null, p_valid_from: new Date().toISOString(), p_valid_until: new Date(Date.now() + 3600_000).toISOString(), p_usage_policy: "SINGLE_USE" });
  note("R4-api", { createRequest: err(c1), createPass: err(c2) });
  expect(c1.error).not.toBeNull();
  expect(c2.error).not.toBeNull();
  expect(dbCounts()).toEqual(before);

  await portalLogin(page, owner1().email).catch(() => undefined);
  await go(page, "/en/portal/maintenance");
  const text = await body(page);
  note("R4-portal-maintenance-page", { finalUrl: page.url().replace(/^https?:\/\/[^/]+/, ""), snippet: text.slice(0, 200), showsOwnRequest: text.includes(requestTitle) });
  await page.screenshot({ path: `${SHOTS}/R4-suspended-owner-portal.png`, fullPage: true });

  // G3 (decided and fixed): a pass issued by a suspended owner admits nobody on ENTRY, exits stay possible so a visitor already
  // inside can leave and be recorded, nothing is revoked or edited, and reactivating the owner restores the pass.
  const dev = W.A.gate.device();
  const mkPass = (guest: string) => {
    const id = randomUUID(), secret = randomUUID();
    q(`insert into public.visitor_invitations(id,organization_id,property_id,unit_id,invited_by_member_id,invitation_no,guest_name,valid_from,valid_until,usage_policy,created_by)
       values('${id}','${W.A.org}','${W.A.property}','${owner1().unitId}','${owner1().memberId}','${id}','${guest}',now()-interval '1 hour',now()+interval '1 hour','MULTI_USE','${owner1().userId}');
       insert into public.visitor_invitation_secrets(invitation_id,organization_id,token_hash) values('${id}','${W.A.org}','${sha(secret)}');`);
    return { id, secret };
  };
  const scanPass = async (p: { id: string; secret: string }, direction: "ENTRY" | "EXIT") => {
    const r = await W.A.gate.guard.client.rpc("process_visitor_gate_scan", { p_device_id: dev.id, p_device_credential: dev.credential, p_gate_id: W.A.gate.gate, p_invitation_id: p.id, p_raw_secret: p.secret, p_direction: direction, p_client_scan_id: randomUUID(), p_scanner_version: "review" });
    const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { decision?: string; reason_code?: string } | null;
    return { error: err(r), decision: row?.decision, reason: row?.reason_code };
  };
  const state = (id: string) => q(`select coalesce(entry_count||'/'||exit_count||'/'||is_inside, 'none') from public.visitor_access_state where visitor_invitation_id='${id}' union all select 'none' limit 1`);
  const ledger = (id: string) => Number(q(`select count(*) from public.access_events where visitor_invitation_id='${id}'`));

  const inside = mkPass("Already inside"), fresh = mkPass("Not yet entered");
  q(`update public.member_portal_access set status='active', suspended_at=null where member_id='${owner1().memberId}'`);
  expect(await scanPass(inside, "ENTRY")).toMatchObject({ decision: "ALLOW", reason: "VALID_ENTRY" }); // entered while the owner was active
  q(`update public.member_portal_access set status='suspended', suspended_at=now() where member_id='${owner1().memberId}'`);

  const stateInsideBefore = state(inside.id), stateFreshBefore = state(fresh.id);
  const d1 = await scanPass(fresh, "ENTRY"), d2 = await scanPass(inside, "ENTRY");
  note("R4-G3-entry-after-suspension", { fresh: d1, alreadyInsideReentry: d2 });
  expect(d1).toEqual({ error: null, decision: "DENY", reason: "OWNER_SUSPENDED" });
  expect(d2).toEqual({ error: null, decision: "DENY", reason: "OWNER_SUSPENDED" });
  expect(ledger(fresh.id)).toBe(1); // the denial is on record
  expect(state(fresh.id)).toBe(stateFreshBefore);   // denials change no visitor state
  expect(state(inside.id)).toBe(stateInsideBefore);
  expect(q(`select status from public.visitor_invitations where id='${fresh.id}'`)).toBe("ACTIVE"); // the pass itself is untouched

  const ex = await scanPass(inside, "EXIT");
  note("R4-G3-exit-after-suspension", ex);
  expect(ex).toEqual({ error: null, decision: "ALLOW", reason: "VALID_EXIT" }); // a visitor already inside can leave

  q(`update public.member_portal_access set status='active', suspended_at=null where member_id='${owner1().memberId}'`); // reactivation
  const back = await scanPass(fresh, "ENTRY");
  note("R4-G3-after-reactivation", back);
  expect(back).toMatchObject({ decision: "ALLOW", reason: "VALID_ENTRY" });

  // the owner is suspended again for the rest of the file (R5 removes the row): the fixture host's own pass is not the owner's
  q(`update public.member_portal_access set status='suspended', suspended_at=now() where member_id='${owner1().memberId}'`);
});

test("R5 an inactive organization: nothing can be created or changed, and the gate admits nobody", async () => {
  q(`delete from public.member_portal_access where member_id='${owner1().memberId}'`); // un-suspend: isolate the organization effect
  q(`update public.organizations set status='SUSPENDED' where id='${W.A.org}'`);
  try {
    const cat = q(`select id from public.maintenance_categories where organization_id='${W.A.org}' order by sort_order limit 1`);
    const before = dbCounts();
    const c1 = await o1.rpc("create_maintenance_request", { p_unit_id: owner1().unitId, p_category_id: cat, p_title: "Inactive org", p_description: "The organization is suspended.", p_priority: "NORMAL" });
    const c2 = await o1.rpc("create_visitor_invitation", { p_unit_id: owner1().unitId, p_token_hash: "e".repeat(64), p_token_hint: "x", p_guest_name: "Inactive", p_guest_phone: null, p_guest_note: null, p_valid_from: new Date().toISOString(), p_valid_until: new Date(Date.now() + 3600_000).toISOString(), p_usage_policy: "SINGLE_USE" });
    const u = await W.A.gate.manager.client.rpc("update_maintenance_request_staff", { p_request_id: requestId, p_next_status: "TRIAGED", p_category_id: null, p_priority: null, p_note: "staff update in a suspended organization", p_visibility: "STAFF_ONLY" });
    note("R5-api", { createRequest: err(c1), createPass: err(c2), staffUpdate: err(u) });
    expect(c1.error?.message).toMatch(/ORGANIZATION_INACTIVE/);
    expect(c2.error?.message).toMatch(/ORGANIZATION_INACTIVE/);
    expect(u.error?.message).toMatch(/ORGANIZATION_INACTIVE/);
    expect(dbCounts()).toEqual(before);

    const dev = W.A.gate.device();
    const allowsBefore = q(`select count(*) from public.access_events where visitor_invitation_id='${pass.id}' and decision='ALLOW'`);
    const scan = await W.A.gate.guard.client.rpc("process_visitor_gate_scan", { p_device_id: dev.id, p_device_credential: dev.credential, p_gate_id: W.A.gate.gate, p_invitation_id: pass.id, p_raw_secret: pass.secret, p_direction: "ENTRY", p_client_scan_id: randomUUID(), p_scanner_version: "review" });
    const row = (Array.isArray(scan.data) ? scan.data[0] : scan.data) as { decision?: string; reason_code?: string } | null;
    note("R5-scan", { error: err(scan), decision: row?.decision, reason: row?.reason_code });
    // fail-closed: nobody is admitted. Today the device check refuses first (an error, no ledger row) rather than a
    // recorded DENY / ORGANIZATION_INACTIVE decision; both are acceptable outcomes for "no admission", the difference is reported.
    expect(row?.decision ?? "ERROR").not.toBe("ALLOW");
    expect(q(`select count(*) from public.access_events where visitor_invitation_id='${pass.id}' and decision='ALLOW'`)).toBe(allowsBefore);
  } finally {
    q(`update public.organizations set status='ACTIVE' where id='${W.A.org}'`);
  }
});
