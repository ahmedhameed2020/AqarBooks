/**
 * Fixture for the connected accounting journey (LOCAL clean stack only).
 *
 * The service key is used for what only it can do — creating the organization, auth users, role
 * assignments, and master data rows. The chart of accounts and the fiscal calendar are set up through
 * the product's own RPCs under a real TENANT_OWNER session, and every accounting operation of the journey
 * itself is performed afterwards through the UI by the accountant.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertKnownLocalSupabaseUrl } from "../../helpers/local-target";

export const PASSWORD = "Demo_Journey_P@ssw0rd_2026!";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export function localEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assertKnownLocalSupabaseUrl(url);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anon || !service) throw new Error("local Supabase keys are not set (see docs/runbooks/accounting-demo-local.md)");
  return { url: url as string, anon, service };
}

export function adminClient(): SupabaseClient {
  const e = localEnv();
  return createClient(e.url, e.service, opts);
}

export async function signedInClient(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const e = localEnv();
  const client = createClient(e.url, e.anon, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

export type JourneyFixture = {
  tag: string;
  orgId: string;
  orgName: string;
  accountant: { id: string; email: string };
  /** AUDITOR template: read-only, holds finance.audit.read (the audit-trail report) */
  auditor: { id: string; email: string };
  owner: { id: string; email: string };
  propertyId: string;
  unit: { id: string; code: string };
  member: { id: string; name: string };
  dueTypeName: string;
  accounts: Record<string, string>; // code -> id
  fiscalYears: number[];
};

export const FIXED = {
  /** fiscal years that must exist: the opening balance is dated in 2025, the report period is 2026 */
  years: [2025, 2026],
  openingDate: "2025-12-31",
  dueIssueDate: "2026-02-01",
  dueDueDate: "2026-02-15",
  payment1Date: "2026-02-10",
  payment2Date: "2026-02-12",
  reportStart: "2026-01-01",
};

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error || data === null) throw new Error(`${what}: ${error?.message ?? "no data"}`);
  return data;
}

/** Test-only role: the shipped ACCOUNTANT template plus finance.payments.void, so the accountant can reverse a receipt. */
export const ACCOUNTANT_ROLE_KEY = "ACCOUNTANT_WITH_VOID";

export async function createJourneyFixture(label = "journey", opts: { approveReceivable?: boolean; linkCashAccount?: boolean } = {}): Promise<JourneyFixture> {
  const approveReceivable = opts.approveReceivable ?? true;
  const admin = adminClient();
  const tag = `${label}-${Date.now().toString(36)}`;
  const orgId = randomUUID();
  const orgName = `Palm Village Owners Association (${tag})`;

  await must(
    admin.from("organizations").insert({ id: orgId, name: orgName, slug: `pv-${tag}`, default_currency: "EGP", status: "ACTIVE" }).select("id").single(),
    "organization",
  );
  const clone = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  if (clone.error) throw new Error(`roles: ${clone.error.message}`);

  const mkUser = async (name: string) => {
    const email = `${name}-${tag}@demo.local`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (created.error || !created.data.user) throw new Error(`user ${name}: ${created.error?.message}`);
    return { id: created.data.user.id, email };
  };
  const owner = await mkUser("setup-owner");
  const accountant = await mkUser("accountant");
  const auditor = await mkUser("auditor");

  const roleId = async (key: string) =>
    (await must(admin.from("roles").select("id").eq("organization_id", orgId).eq("key", key).single(), `role ${key}`)).id as string;

  // accountant role = ACCOUNTANT template + payments.void
  const tpl = await must(admin.from("role_template_permissions").select("permission_key").eq("role_template_key", "ACCOUNTANT"), "template permissions");
  const keys = [...new Set([...tpl.map((r) => r.permission_key as string), "finance.payments.void"])];
  const perms = await must(admin.from("permissions").select("id,key").in("key", keys), "permissions");
  const accRole = await must(
    admin.from("roles").insert({ organization_id: orgId, key: ACCOUNTANT_ROLE_KEY, name_ar: "محاسب (مع عكس السندات)", name_en: "Accountant (can reverse receipts)", is_system: false }).select("id").single(),
    "accountant role",
  );
  await must(admin.from("role_permissions").insert(perms.map((p) => ({ role_id: accRole.id, permission_id: p.id }))).select("role_id"), "role permissions");

  for (const [u, r] of [[owner, await roleId("TENANT_OWNER")], [accountant, accRole.id as string], [auditor, await roleId("AUDITOR")]] as const) {
    await must(admin.from("organization_memberships").insert({ organization_id: orgId, user_id: u.id, status: "active" }).select("id").single(), "membership");
    await must(admin.from("user_role_assignments").insert({ user_id: u.id, role_id: r, organization_id: orgId }).select("id").single(), "assignment");
  }

  // Chart of accounts and fiscal calendar through the product's own RPCs, as a real owner session.
  const ownerSession = await signedInClient(owner.email);
  const coa = await ownerSession.rpc("clone_chart_of_accounts_template", { p_organization_id: orgId, p_template_key: "RESORT_STANDARD" });
  if (coa.error) throw new Error(`chart of accounts: ${coa.error.message}`);

  const thisYear = new Date().getUTCFullYear();
  const years = [...new Set([...FIXED.years, thisYear])].sort();
  for (const y of years) {
    const created = await ownerSession.rpc("create_fiscal_year", { p_organization_id: orgId, p_name: String(y), p_start_date: `${y}-01-01`, p_end_date: `${y}-12-31` });
    if (created.error) throw new Error(`fiscal year ${y}: ${created.error.message}`);
  }
  const periods = await must(admin.from("fiscal_periods").select("id").eq("organization_id", orgId), "periods");
  for (const p of periods) {
    const r = await ownerSession.rpc("set_fiscal_period_status", { p_fiscal_period_id: p.id, p_status: "OPEN", p_reason: "demo setup" });
    if (r.error) throw new Error(`open period: ${r.error.message}`);
  }

  const coaRows = await must(admin.from("chart_of_accounts").select("id,code").eq("organization_id", orgId), "accounts");
  const accounts = Object.fromEntries(coaRows.map((a) => [a.code as string, a.id as string]));
  for (const code of ["1110", "1120", "1130", "3100", "4100"]) if (!accounts[code]) throw new Error(`template account ${code} missing`);

  // Property, unit, owner member and ownership; one due type for the new charge.
  const propertyId = randomUUID();
  await must(admin.from("properties").insert({ id: propertyId, organization_id: orgId, name: "Palm Village", code: `PV-${tag}`.slice(0, 20), timezone: "Africa/Cairo", property_type: "resort" }).select("id").single(), "property");
  // The till: receipts are deposited to a cash box or bank account GL account (migration 20261018100000). The cash account 1110 gets an active
  // cash box here; pass { linkCashAccount: false } to build an organization whose cash account was never linked (the legacy case).
  if (opts.linkCashAccount !== false) {
    await must(admin.from("cashboxes").insert({ organization_id: orgId, property_id: propertyId, name: "Main till", gl_account_id: accounts["1110"] }).select("id").single(), "cashbox");
  }
  const unit = { id: randomUUID(), code: "A-101" };
  await must(admin.from("units").insert({ id: unit.id, organization_id: orgId, property_id: propertyId, code: unit.code }).select("id").single(), "unit");
  const member = { id: randomUUID(), name: "Mona Hassan" };
  await must(admin.from("members").insert({ id: member.id, organization_id: orgId, full_name: member.name, phone: "+201000000123" }).select("id").single(), "member");
  await must(admin.from("unit_ownerships").insert({ organization_id: orgId, unit_id: unit.id, member_id: member.id, share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" }).select("id").single(), "ownership");
  const dueTypeName = "Annual maintenance fee";
  await must(admin.from("due_types").insert({ organization_id: orgId, name_ar: "رسوم صيانة سنوية", name_en: dueTypeName, default_revenue_account_id: accounts["4100"] }).select("id").single(), "due type");

  // Logins for browsing the demo by hand (local clean stack only; the password is the PASSWORD constant above).
  try {
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/demo-org.json", JSON.stringify({ organization: orgName, slug: `pv-${tag}`, accountant: accountant.email, auditor: auditor.email, owner: owner.email }, null, 2));
  } catch { /* informational only */ }

  // The organization's approved receivable account, set the way an owner would: through the product's RPC.
  // (Pass { approveReceivable: false } to build an organization with no approved setting.)
  if (approveReceivable) {
    const approved = await ownerSession.rpc("set_default_receivable_account", { p_organization_id: orgId, p_property_id: propertyId, p_account_id: accounts["1130"] });
    if (approved.error) throw new Error(`approve receivable account: ${approved.error.message}`);
  }

  return { tag, orgId, orgName, accountant, auditor, owner, propertyId, unit, member, dueTypeName, accounts, fiscalYears: years };
}

/** Bank account whose GL account is 1120, for the bank collection scenario. */
export async function addBankAccount(fx: JourneyFixture, name = "National Bank of Egypt") {
  const admin = adminClient();
  const bank = await must(admin.from("banks").insert({ organization_id: fx.orgId, name_ar: "البنك الأهلي المصري", name_en: name }).select("id").single(), "bank");
  const account = await must(
    admin.from("bank_accounts").insert({ organization_id: fx.orgId, property_id: fx.propertyId, bank_id: bank.id, account_name: "Operating account", account_number: "EG00-DEMO-0001", gl_account_id: fx.accounts["1120"] }).select("id").single(),
    "bank account",
  );
  return { bankId: bank.id as string, bankAccountId: account.id as string, name };
}

/**
 * Re-attach to the most recent journey organization (for re-running single verification steps without
 * rebuilding the world): JOURNEY_REUSE=1 npx playwright test ... -g "V8".
 */
export async function loadLatestJourneyFixture(prefix = "pv-journey-"): Promise<JourneyFixture> {
  const admin = adminClient();
  // JOURNEY_ORG_SLUG pins a specific organization (e.g. the one built by a previous complete run)
  const pinned = process.env.JOURNEY_ORG_SLUG;
  const org = await must(
    pinned
      ? admin.from("organizations").select("id,name,slug").eq("slug", pinned).single()
      : admin.from("organizations").select("id,name,slug").like("slug", `${prefix}%`).order("created_at", { ascending: false }).limit(1).single(),
    "journey organization",
  );
  const tag = String(org.slug).replace(/^pv-/, "");
  const [accts, prop, unit, member, years] = await Promise.all([
    must(admin.from("chart_of_accounts").select("id,code").eq("organization_id", org.id), "accounts"),
    must(admin.from("properties").select("id").eq("organization_id", org.id).limit(1).single(), "property"),
    must(admin.from("units").select("id,code").eq("organization_id", org.id).limit(1).single(), "unit"),
    must(admin.from("members").select("id,full_name").eq("organization_id", org.id).limit(1).single(), "member"),
    must(admin.from("fiscal_years").select("name").eq("organization_id", org.id), "fiscal years"),
  ]);
  const user = async (name: string) => {
    const email = `${name}-${tag}@demo.local`;
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = list.data.users.find((x) => x.email === email);
    if (!u) throw new Error(`user ${email} not found`);
    return { id: u.id, email };
  };
  return {
    tag,
    orgId: org.id as string,
    orgName: org.name as string,
    accountant: await user("accountant"),
    auditor: await user("auditor"),
    owner: await user("setup-owner"),
    propertyId: prop.id as string,
    unit: { id: unit.id as string, code: unit.code as string },
    member: { id: member.id as string, name: member.full_name as string },
    dueTypeName: "Annual maintenance fee",
    accounts: Object.fromEntries(accts.map((a) => [a.code as string, a.id as string])),
    fiscalYears: years.map((y) => Number(y.name)).sort(),
  };
}
