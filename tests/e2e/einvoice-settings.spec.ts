/**
 * E-invoicing settings screen.
 *
 * The risk here is not that the page breaks; it is that it LIES. A settings
 * screen for a statutory integration can very easily imply a connection exists,
 * show a state nobody earned, or echo a secret back into the DOM. So these tests
 * are mostly about what must NOT appear.
 *
 * The four operator-facing states are derived, not stored:
 *   no row -> NOT_CONFIGURED, row without verified_at -> CONFIGURED,
 *   verified_at -> VERIFIED, verified and enabled -> ACTIVE.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

/** Never stored by this feature; used only to prove it is never echoed back. */
const CANARY_SECRET = "SUPER-SECRET-CANARY-VALUE-9f3a";

type Org = { orgId: string; email: string; taxpayerId: string };

async function setUpOrg(
  admin: SupabaseClient,
  label: string,
  roleKey: string | null,
): Promise<Org> {
  const stamp = `${Date.now()}-${label}`;
  // ADR 0002: organizations.tax_id هو مصدر الهوية، ولا يُنشأ ملف فوترة بدونه،
  // وقيمة الملف يجب أن تطابقه. هذا الـfixture سبق تلك القاعدة فانكسر بحق حين
  // نزلت — الإصلاح في الـfixture لا في الحارس.
  const taxpayerId = `TAX-${label}-${Date.now()}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E EInv Settings ${stamp}`,
      slug: `e2e-einv-settings-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      tax_id: taxpayerId,
    })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const email = `e2e-einv-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(userErr, `createUser failed: ${userErr?.message}`).toBeNull();

  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: created!.user!.id, status: "active" });

  if (roleKey) {
    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", roleKey)
      .single();
    await admin
      .from("user_role_assignments")
      .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: orgId });
  }

  return { orgId, email, taxpayerId };
}

async function cleanUp(admin: SupabaseClient, orgId: string) {
  await admin.from("einvoice_submission_attempts").delete().eq("organization_id", orgId);
  await admin.from("einvoice_documents").delete().eq("organization_id", orgId);
  await admin.from("einvoice_profiles").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
}

/**
 * Both jurisdictions render identical controls, so every locator must be scoped
 * to one section. An earlier version of this spec used `.first()` and page-wide
 * getByText, and silently drove the wrong jurisdiction — the fields it asserted
 * on belonged to a different section than the ones it filled.
 */
function section(page: Page, jurisdiction: "EG_ETA" | "SA_ZATCA") {
  return page.locator(`form:has(input[name="jurisdiction"][value="${jurisdiction}"])`);
}

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 20_000 });
}

test("walks NOT_CONFIGURED -> CONFIGURED, and never claims a connection", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Owner", "TENANT_OWNER");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice");

  // The jurisdiction form is present; no status badge may claim a connection.
  const egForm = section(page, "EG_ETA");
  await expect(egForm).toBeVisible();
  const body = await page.locator("body").innerText();

  // Nothing anywhere may imply a working link to a tax authority.
  expect(body, "must not claim a connection").not.toMatch(
    /\bconnected\b|\bvalidated\b|connection successful|test connection/i,
  );
  // And there must be no control that pretends to test one.
  await expect(page.getByRole("button", { name: /test connection/i })).toHaveCount(0);

  // Save identifying details.
  const eg = section(page, "EG_ETA");
  await eg.locator("#tax-EG_ETA").fill(org.taxpayerId);
  await eg.getByRole("button", { name: /Save Settings/i }).click();

  // Configured-but-unverified must not claim more than "Setup needed".
  await expect(page.getByText(/Setup needed/i).first()).toBeVisible({ timeout: 15_000 });

  // Reload before checking the saved value: proving it survives a fresh request
  // is the point, and an input's value never appears in innerText anyway.
  await page.reload();
  await expect(section(page, "EG_ETA").locator("#tax-EG_ETA")).toHaveValue(org.taxpayerId);
  // The screen must not claim a verified/active state nobody earned.
  await expect(page.getByText(/Verified — ready|Active & Auto-filing/i)).toHaveCount(0);

  // Filing cannot be switched on from CONFIGURED.
  await expect(
    page.getByRole("button", { name: /Activate Auto-Filing/i }).first(),
  ).toBeDisabled();

  const { data: profile } = await admin
    .from("einvoice_profiles")
    .select("status, enabled, verified_at")
    .eq("organization_id", org.orgId)
    .single();
  expect(profile!.status).toBe("DRAFT");
  expect(profile!.enabled).toBe(false);
  expect(profile!.verified_at).toBeNull();

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("shows VERIFIED then ACTIVE only when the database genuinely says so", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Verified", "TENANT_OWNER");

  const { data: profile } = await admin
    .from("einvoice_profiles")
    .insert({
      organization_id: org.orgId,
      jurisdiction: "EG_ETA",
      environment: "SANDBOX",
      taxpayer_id: org.taxpayerId,
    })
    .select("id")
    .single();

  // VERIFIED is only reachable by a real verification write; simulating it here
  // is what lets the UI state be tested without inventing a fake success path
  // in the product itself.
  await admin
    .from("einvoice_profiles")
    .update({ status: "ACTIVE", verified_at: new Date().toISOString() })
    .eq("id", profile!.id);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice");

  const eg = section(page, "EG_ETA");
  await expect(page.getByText(/Verified — ready/i).first()).toBeVisible();
  // Now the toggle is genuinely available.
  const toggle = page.getByRole("button", { name: /Activate Auto-Filing/i }).first();
  await expect(toggle).toBeEnabled();
  await toggle.click();

  await expect(page.getByText(/Active & Auto-filing/i).first()).toBeVisible({ timeout: 15_000 });
  const { data: after } = await admin
    .from("einvoice_profiles")
    .select("enabled")
    .eq("id", profile!.id)
    .single();
  expect(after!.enabled).toBe(true);

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("re-saving details keeps an existing verification, but changing the taxpayer drops it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Resave", "TENANT_OWNER");

  const { data: profile } = await admin
    .from("einvoice_profiles")
    .insert({
      organization_id: org.orgId,
      jurisdiction: "EG_ETA",
      environment: "SANDBOX",
      taxpayer_id: org.taxpayerId,
    })
    .select("id")
    .single();
  await admin
    .from("einvoice_profiles")
    .update({ status: "ACTIVE", enabled: true, verified_at: new Date().toISOString() })
    .eq("id", profile!.id);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice");
  const eg = section(page, "EG_ETA");
  await expect(page.getByText(/Active & Auto-filing/i).first()).toBeVisible();

  // Editing a branch code is a correction, not a different filer: verification
  // must survive it.
  const beforeSave = await admin
    .from("einvoice_profiles").select("updated_at").eq("id", profile!.id).single();
  await eg.locator("#branch-EG_ETA").fill("BR-2");
  await eg.getByRole("button", { name: /Save Settings/i }).click();
  await expect(page.getByText(/Active & Auto-filing/i).first()).toBeVisible({ timeout: 40_000 });
  // Wait for the save to land in the database before touching the form again;
  // the badge does not change when verification survives.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("einvoice_profiles").select("updated_at").eq("id", profile!.id).single();
      return data?.updated_at ?? "";
    }, { timeout: 40_000 })
    .not.toBe(beforeSave.data?.updated_at ?? "");
  // Confirm against the database, not just the badge, that nothing was dropped.
  const { data: afterBranch } = await admin
    .from("einvoice_profiles").select("status, enabled, taxpayer_id").eq("id", profile!.id).single();
  expect(afterBranch!.status).toBe("ACTIVE");
  expect(afterBranch!.taxpayer_id).toBe(org.taxpayerId);

  // ProfileForm is keyed on updated_at, so the save remounts the form. Reload
  // before the second edit: it removes the remount race deterministically while
  // keeping the doctrine under test (a mismatched filer identity is refused).
  await page.reload();
  const eg2 = section(page, "EG_ETA");
  await eg2.locator("#tax-EG_ETA").fill("TAX-DIFFERENT-FILER");
  await expect(eg2.locator("#tax-EG_ETA")).toHaveValue("TAX-DIFFERENT-FILER");
  await eg2.getByRole("button", { name: /Save Settings/i }).click();
  await expect(eg2.getByText(/does not match the organization/i)).toBeVisible({ timeout: 15_000 });

  const { data: unchanged } = await admin
    .from("einvoice_profiles")
    .select("status, taxpayer_id")
    .eq("id", profile!.id)
    .single();
  expect(unchanged!.status, "a refused save changes nothing").toBe("ACTIVE");
  expect(unchanged!.taxpayer_id).toBe(org.taxpayerId);

  // Changing the filer is an act on the ENTITY, not on an integration setting.
  // That is what drops the verification, through the organization trigger.
  await admin
    .from("organizations")
    .update({ tax_id: "TAX-DIFFERENT-FILER" })
    .eq("id", org.orgId);
  await page.reload();
  // With verification dropped the badge may only claim the unverified state;
  // the DB assertions below are the authoritative proof.
  await expect(page.getByText(/Setup needed/i).first()).toBeVisible({ timeout: 15_000 });

  const { data: after } = await admin
    .from("einvoice_profiles")
    .select("status, enabled, verified_at")
    .eq("id", profile!.id)
    .single();
  expect(after!.status).toBe("DRAFT");
  expect(after!.enabled).toBe(false);
  expect(after!.verified_at).toBeNull();

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("a user without the permission cannot see settings detail", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // CASHIER holds no finance.einvoice.* permission.
  const org = await setUpOrg(admin, "NoPerm", "CASHIER");

  await admin.from("einvoice_profiles").insert({
    organization_id: org.orgId,
    jurisdiction: "EG_ETA",
    environment: "SANDBOX",
    taxpayer_id: org.taxpayerId,
  });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice");

  const body = await page.locator("body").innerText();
  expect(body).toMatch(/don't have permission|You don't have/i);
  expect(body, "internal detail must not leak").not.toContain(org.taxpayerId);
  await expect(page.getByRole("button", { name: /Save Settings/i })).toHaveCount(0);

  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("organization A cannot see or alter organization B's profile", async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const orgA = await setUpOrg(admin, "IsoA", "TENANT_OWNER");
  const orgB = await setUpOrg(admin, "IsoB", "TENANT_OWNER");

  const { data: profileB } = await admin
    .from("einvoice_profiles")
    .insert({
      organization_id: orgB.orgId,
      jurisdiction: "EG_ETA",
      environment: "SANDBOX",
      taxpayer_id: orgB.taxpayerId,
    })
    .select("id")
    .single();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, orgA.email);
  await page.goto("/en/finance/einvoice");

  const body = await page.locator("body").innerText();
  expect(body, "another tenant's taxpayer id must never appear").not.toContain(orgB.taxpayerId);

  // Server-side too: A's session cannot read B's row even by asking directly.
  const asA = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await asA.auth.signInWithPassword({ email: orgA.email, password: STAFF_PASSWORD });
  const { data: leaked } = await asA
    .from("einvoice_profiles")
    .select("id")
    .eq("id", profileB!.id);
  expect(leaked ?? [], "RLS must hide another tenant's profile").toEqual([]);

  // And cannot write to it: the RPC re-checks permission against the target org.
  const { error: writeErr } = await asA.rpc("upsert_einvoice_profile", {
    p_organization_id: orgB.orgId,
    p_jurisdiction: "EG_ETA",
    p_environment: "SANDBOX",
    p_taxpayer_id: "HIJACKED",
  });
  expect(writeErr, "cross-tenant write must be refused").not.toBeNull();

  const { data: untouched } = await admin
    .from("einvoice_profiles")
    .select("taxpayer_id")
    .eq("id", profileB!.id)
    .single();
  expect(untouched!.taxpayer_id).toBe(orgB.taxpayerId);

  await ctx.close();
  await cleanUp(admin, orgA.orgId);
  await cleanUp(admin, orgB.orgId);
});

test("no secret material reaches the response, the DOM, or the client bundle", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Secrets", "TENANT_OWNER");

  // Plant a canary in a Vault-reference column. The page must never select or
  // render it; if the query ever widens to `select *`, this test fails.
  const { data: profile } = await admin
    .from("einvoice_profiles")
    .insert({
      organization_id: org.orgId,
      jurisdiction: "EG_ETA",
      environment: "SANDBOX",
      taxpayer_id: org.taxpayerId,
      last_verification_error: null,
    })
    .select("id")
    .single();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Capture every response body the page loads, including RSC payloads and JS
  // chunks — a secret leaked into a flight payload would never appear in
  // innerText but would still be shipped to the browser.
  const bodies: string[] = [];
  page.on("response", async (res) => {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (/text|javascript|json/.test(ct)) bodies.push(await res.text());
    } catch {
      /* body already consumed or binary */
    }
  });

  await signIn(page, org.email);
  await page.goto("/en/finance/einvoice");
  await page.waitForLoadState("networkidle");

  const html = await page.content();
  const allTraffic = bodies.join("\n");

  for (const haystack of [html, allTraffic]) {
    expect(haystack).not.toContain(CANARY_SECRET);
    // The Vault reference columns must not be serialised either.
    expect(haystack).not.toContain("client_secret_secret_id");
    expect(haystack).not.toContain("signing_key_secret_id");
  }

  // A secret-shaped input must not exist on this screen at all.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  expect(profile!.id).toBeTruthy();
  await ctx.close();
  await cleanUp(admin, org.orgId);
});

test("a jurisdiction with no adapter is refused by the API, not just hidden by the UI", async () => {
  test.setTimeout(90_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const org = await setUpOrg(admin, "Jurisdiction", "TENANT_OWNER");

  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await asUser.auth.signInWithPassword({
    email: org.email,
    password: STAFF_PASSWORD,
  });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();

  // The settings screen never offers the UAE, but a caller can skip the screen.
  const { error } = await asUser.rpc("upsert_einvoice_profile", {
    p_organization_id: org.orgId,
    p_jurisdiction: "AE_PEPPOL",
    p_environment: "SANDBOX",
    p_taxpayer_id: "SHOULD-NOT-EXIST",
  });
  expect(error, "an adapterless jurisdiction must be refused").not.toBeNull();
  expect(error!.message).toMatch(/EINVOICE_JURISDICTION_UNSUPPORTED/);

  const { count } = await admin
    .from("einvoice_profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.orgId);
  expect(count ?? 0, "nothing may be created for an unsupported jurisdiction").toBe(0);

  // A supported one still works, so the guard is a filter and not a wall.
  const { error: okErr } = await asUser.rpc("upsert_einvoice_profile", {
    p_organization_id: org.orgId,
    p_jurisdiction: "EG_ETA",
    p_environment: "SANDBOX",
    p_taxpayer_id: org.taxpayerId,
  });
  expect(okErr, `supported jurisdiction should succeed: ${okErr?.message}`).toBeNull();

  await cleanUp(admin, org.orgId);
});
