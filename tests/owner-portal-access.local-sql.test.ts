/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc JSON rows returned by psql */
// SQL-level tests for owner portal access (supabase/migrations/20261004120000_*).
//
// These run against a THROWAWAY local PostgreSQL that has the repository's own
// migrations replayed onto it (scripts/local-db). They never touch a hosted
// Supabase project, and they are skipped unless LOCAL_PG_PORT is set:
//
//   LOCAL_PG_PORT=54329 PG_BIN=<postgres bin dir> node scripts/local-db/replay.mjs
//   LOCAL_PG_PORT=54329 PG_BIN=<postgres bin dir> npx vitest run tests/owner-portal-access.local-sql.test.ts
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = process.env.LOCAL_PG_PORT;
const PSQL = process.env.PG_BIN ? join(process.env.PG_BIN, "psql") : "psql";
const enabled = Boolean(PORT);

type Who = { role?: "authenticated" | "anon" | "service_role"; uid?: string };

// Each run works in its own clone of the replayed database, so the suite is
// repeatable and never leaves rows behind in the template.
const TEST_DB = `aqar_portal_${Date.now()}`;

function run(sql: string, who: Who = {}, database = TEST_DB): string {
  const claims = who.role
    ? `set role ${who.role};\nset request.jwt.claims to '${JSON.stringify({ sub: who.uid ?? null, role: who.role })}';\n`
    : "";
  return execFileSync(
    PSQL,
    ["-h", "127.0.0.1", "-p", PORT!, "-U", "postgres", "-d", database, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: claims + sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function json<T = any>(sql: string, who: Who = {}): T {
  return JSON.parse(run(sql, who).split("\n").pop()!) as T;
}

function failure(sql: string, who: Who = {}): string {
  try {
    run(sql, who);
  } catch (error: any) {
    return String(error.stderr ?? error.message);
  }
  throw new Error("expected the statement to fail, but it succeeded");
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_A = id(1);
const ORG_B = id(2);
const STAFF_A = id(11); // full portal permissions in org A, also an owner (shared identity)
const STAFF_B = id(12); // full portal permissions in org B only
const STAFF_NONE = id(13); // belongs to org A with NO role
const M_OWNER = id(21);
const M_NO_EMAIL = id(22);
const M_NO_UNIT = id(23);
const M_ENDED = id(24);
const M_B = id(25);
const M_STAFF_OWNER = id(26);
const M_EXPIRE = id(27);
const M_REVOKE = id(28);
const M_SUSPEND = id(29);
const M_LOGOUT = id(30);
const M_LEGACY = id(31);
const M_UNVER = id(32);
const M_DUP_A = id(33);
const M_DUP_B = id(34);
const M_EDIT = id(35);
const M_UNSENT = id(36);
const M_DELIVER = id(37);
const M_ORGID = id(38);
const M_FALLBACK = id(39);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const authz = (uid: string): Who => ({ role: "authenticated", uid });

describe.skipIf(!enabled)("owner portal access (local PostgreSQL)", () => {
  beforeAll(() => {
    run(`create database ${TEST_DB} template aqar_local`, {}, "postgres");
    run(`
      insert into public.organizations (id, name, slug, status) values
        ('${ORG_A}', 'Org A', 'org-a-portal', 'ACTIVE'), ('${ORG_B}', 'Org B', 'org-b-portal', 'ACTIVE');
      select public.clone_tenant_role_templates('${ORG_A}');
      select public.clone_tenant_role_templates('${ORG_B}');
      insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
        ('${STAFF_A}', 'staff-a@example.com', 'hash-a', now()),
        ('${STAFF_B}', 'staff-b@example.com', 'hash-b', now()),
        ('${STAFF_NONE}', 'staff-none@example.com', 'hash-n', now());
      insert into public.organization_memberships (organization_id, user_id, status) values
        ('${ORG_A}', '${STAFF_A}', 'active'), ('${ORG_B}', '${STAFF_B}', 'active'), ('${ORG_A}', '${STAFF_NONE}', 'active');
      insert into public.user_role_assignments (user_id, role_id, organization_id)
        select '${STAFF_A}', id, organization_id from public.roles where key = 'TENANT_OWNER' and organization_id = '${ORG_A}';
      insert into public.user_role_assignments (user_id, role_id, organization_id)
        select '${STAFF_B}', id, organization_id from public.roles where key = 'TENANT_OWNER' and organization_id = '${ORG_B}';
      insert into public.properties (id, organization_id, name, code) values
        ('${id(41)}', '${ORG_A}', 'Prop A', 'PA'), ('${id(42)}', '${ORG_B}', 'Prop B', 'PB');
      insert into public.units (id, organization_id, property_id, code)
        select ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '${ORG_A}', '${id(41)}', 'A-' || n from generate_series(1, 17) n;
      insert into public.units (id, organization_id, property_id, code) values ('${id(150)}', '${ORG_B}', '${id(42)}', 'B-1');
      insert into public.members (id, organization_id, full_name, email, phone) values
        ('${M_OWNER}', '${ORG_A}', 'Owner One', 'owner1@example.com', '01001234567'),
        ('${M_NO_EMAIL}', '${ORG_A}', 'No Email Owner', null, '01119876543'),
        ('${M_NO_UNIT}', '${ORG_A}', 'No Unit', 'nounit@example.com', null),
        ('${M_ENDED}', '${ORG_A}', 'Ended Owner', 'ended@example.com', null),
        ('${M_B}', '${ORG_B}', 'Owner B', 'ownerb@example.com', null),
        ('${M_STAFF_OWNER}', '${ORG_A}', 'Staff Owner', 'staff-a@example.com', null),
        ('${M_EXPIRE}', '${ORG_A}', 'Expire Owner', 'expire@example.com', null),
        ('${M_REVOKE}', '${ORG_A}', 'Revoke Owner', 'revoke@example.com', null),
        ('${M_SUSPEND}', '${ORG_A}', 'Suspend Owner', 'suspend@example.com', null),
        ('${M_LOGOUT}', '${ORG_A}', 'Logout Owner', 'logout@example.com', null),
        ('${M_LEGACY}', '${ORG_A}', 'Legacy Owner', 'legacy@example.com', null),
        ('${M_UNVER}', '${ORG_A}', 'Unverified Owner', 'unver@example.com', null),
        ('${M_DUP_A}', '${ORG_A}', 'Dup A', 'dup@example.com', null),
        ('${M_DUP_B}', '${ORG_A}', 'Dup B', 'dup@example.com', null),
        ('${M_EDIT}', '${ORG_A}', 'Edit Owner', 'edit-before@example.com', null),
        ('${M_UNSENT}', '${ORG_A}', 'Unsent Owner', 'unsent@example.com', null),
        ('${M_DELIVER}', '${ORG_A}', 'Deliver Owner', 'deliver@example.com', null),
        ('${M_ORGID}', '${ORG_A}', 'Org Identity Owner', 'orgid@example.com', null),
        ('${M_FALLBACK}', '${ORG_A}', 'Fallback Owner', 'fallback@example.com', null);
      insert into public.unit_ownerships (organization_id, unit_id, member_id, start_date, end_date) values
        ('${ORG_A}', '${id(101)}', '${M_OWNER}', '2020-01-01', null),
        ('${ORG_A}', '${id(102)}', '${M_NO_EMAIL}', '2020-01-01', null),
        ('${ORG_A}', '${id(103)}', '${M_ENDED}', '2019-01-01', '2021-01-01'),
        ('${ORG_B}', '${id(150)}', '${M_B}', '2020-01-01', null),
        ('${ORG_A}', '${id(104)}', '${M_STAFF_OWNER}', '2020-01-01', null),
        ('${ORG_A}', '${id(105)}', '${M_EXPIRE}', '2020-01-01', null),
        ('${ORG_A}', '${id(106)}', '${M_REVOKE}', '2020-01-01', null),
        ('${ORG_A}', '${id(107)}', '${M_SUSPEND}', '2020-01-01', null),
        ('${ORG_A}', '${id(108)}', '${M_LOGOUT}', '2020-01-01', null),
        ('${ORG_A}', '${id(109)}', '${M_LEGACY}', '2020-01-01', null),
        ('${ORG_A}', '${id(110)}', '${M_UNVER}', '2020-01-01', null),
        ('${ORG_A}', '${id(111)}', '${M_DUP_A}', '2020-01-01', null),
        ('${ORG_A}', '${id(112)}', '${M_DUP_B}', '2020-01-01', null),
        ('${ORG_A}', '${id(113)}', '${M_EDIT}', '2020-01-01', null),
        ('${ORG_A}', '${id(114)}', '${M_UNSENT}', '2020-01-01', null),
        ('${ORG_A}', '${id(115)}', '${M_DELIVER}', '2020-01-01', null),
        ('${ORG_A}', '${id(116)}', '${M_ORGID}', '2020-01-01', null),
        ('${ORG_A}', '${id(117)}', '${M_FALLBACK}', '2020-01-01', null);
    `);
  }, 120_000);

  afterAll(() => {
    run(`drop database if exists ${TEST_DB} with (force)`, {}, "postgres");
  }, 60_000);

  const makeAuthUser = (uid: string, email: string, hash = "hash-initial", confirmed = false) =>
    run(
      `insert into auth.users (id, email, encrypted_password, email_confirmed_at) values ('${uid}', '${email}', '${hash}', ${
        confirmed ? "now()" : "null"
      }) on conflict (id) do nothing;`,
    );
  const actions = (memberId: string) =>
    run(`select coalesce(string_agg(action, ',' order by created_at, action), '') from public.platform_audit_logs where entity_id = '${memberId}' and action like 'member_portal.%'`);
  const SERVICE: Who = { role: "service_role" };
  const request = (member: string, who = authz(STAFF_A)) =>
    json<Record<string, unknown>>(`select to_jsonb(t) from public.request_member_activation('${member}') t;`, who);
  const mint = (member: string, actor = STAFF_A) =>
    json<{ raw_token: string; token_id: string; member_email: string }>(
      `select to_jsonb(t) from public.mint_member_activation_token('${member}', '${actor}') t;`,
      SERVICE,
    );
  const markDelivery = (tokenId: string, status: string, detail = "null") =>
    run(`select public.mark_member_activation_delivery('${tokenId}', '${status}', ${detail})`, SERVICE);
  // What the server does: authorize as staff, mint on the server, mail, record.
  const issue = (member: string, who = authz(STAFF_A)) => {
    request(member, who);
    const t = mint(member, who.uid);
    markDelivery(t.token_id, "sent");
    return t;
  };
  const inspect = (token: string) =>
    json<{ state: string }>(`select public.inspect_member_activation('${token}');`, { role: "service_role" });
  const complete = (token: string, uid: string, origin = "provisioned") =>
    json<{ ok: boolean; reason?: string }>(
      `select public.complete_member_activation('${token}', '${uid}', '${origin}');`,
      { role: "service_role" },
    );

  describe("eligibility", () => {
    it("requires an active ownership", () => {
      expect(failure(`select * from public.request_member_activation('${M_NO_UNIT}');`, authz(STAFF_A))).toContain("NO_ACTIVE_OWNERSHIP");
      expect(failure(`select * from public.request_member_activation('${M_ENDED}');`, authz(STAFF_A))).toContain("NO_ACTIVE_OWNERSHIP");
      expect(failure(`select * from public.begin_member_temp_access('${M_NO_UNIT}');`, authz(STAFF_A))).toContain("NO_ACTIVE_OWNERSHIP");
    });

    it("requires a plausible email for the link flow, not for client-id access", () => {
      expect(failure(`select * from public.request_member_activation('${M_NO_EMAIL}');`, authz(STAFF_A))).toContain("MEMBER_EMAIL_REQUIRED");
      const begin = json<{ client_id: string }>(`select to_jsonb(t) from public.begin_member_temp_access('${M_NO_EMAIL}') t;`, authz(STAFF_A));
      expect(begin.client_id).toMatch(/^MB-\d{5,}$/);
    });

    it("reports the state, unit count and eligibility to staff", () => {
      const s = json<any>(`select public.get_member_portal_access('${M_OWNER}');`, authz(STAFF_A));
      expect(s).toMatchObject({ status: "not_activated", units_count: 1, eligible: true, has_email: true, can_manage: true });
      const ended = json<any>(`select public.get_member_portal_access('${M_ENDED}');`, authz(STAFF_A));
      expect(ended).toMatchObject({ units_count: 0, eligible: false });
    });
  });

  describe("activation token", () => {
    it("is stored only as a hash and valid right after issue", () => {
      const t = issue(M_OWNER);
      expect(t.raw_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(t.member_email).toBe("owner1@example.com");
      const stored = run(`select token_hash from public.member_activation_tokens where id = '${t.token_id}'`);
      expect(stored).toBe(sha(t.raw_token));
      expect(run(`select count(*) from public.member_activation_tokens where token_hash = '${t.raw_token}'`)).toBe("0");
      expect(inspect(t.raw_token)).toMatchObject({ state: "valid", email: "owner1@example.com", existing_account: false });
      expect(json<any>(`select public.get_member_portal_access('${M_OWNER}');`, authz(STAFF_A)).status).toBe("pending");
    });

    it("expires", () => {
      const t = issue(M_EXPIRE);
      run(`update public.member_activation_tokens set expires_at = now() - interval '1 minute' where id = '${t.token_id}'`);
      expect(inspect(t.raw_token).state).toBe("expired");
      makeAuthUser(id(61), "expire@example.com");
      expect(complete(t.raw_token, id(61))).toEqual({ ok: false, reason: "expired" });
      expect(run(`select user_id is null from public.members where id = '${M_EXPIRE}'`)).toBe("t");
    });

    it("is one-time and binds the identity to the member's email", () => {
      const t = issue(M_OWNER);
      makeAuthUser(id(62), "someone-else@example.com");
      expect(complete(t.raw_token, id(62))).toEqual({ ok: false, reason: "email_mismatch" });
      makeAuthUser(id(63), "owner1@example.com");
      expect(complete(t.raw_token, id(63))).toMatchObject({ ok: true });
      expect(run(`select user_id from public.members where id = '${M_OWNER}'`)).toBe(id(63));
      expect(complete(t.raw_token, id(63))).toEqual({ ok: false, reason: "used" });
      expect(inspect(t.raw_token).state).toBe("used");
      const s = json<any>(`select public.get_member_portal_access('${M_OWNER}');`, authz(STAFF_A));
      expect(s).toMatchObject({ status: "active", login_method: "email", must_change_password: false });
      expect(failure(`select * from public.request_member_activation('${M_OWNER}');`, authz(STAFF_A))).toContain("ALREADY_ACTIVE");
    });

    it("can be revoked, and a new link revokes the old one", () => {
      const first = issue(M_REVOKE);
      const second = issue(M_REVOKE);
      expect(inspect(first.raw_token).state).toBe("revoked");
      expect(inspect(second.raw_token).state).toBe("valid");
      expect(run(`select public.revoke_member_activation('${M_REVOKE}')`, authz(STAFF_A))).toBe("1");
      expect(inspect(second.raw_token).state).toBe("revoked");
      makeAuthUser(id(64), "revoke@example.com");
      expect(complete(second.raw_token, id(64))).toEqual({ ok: false, reason: "revoked" });
    });

    it("rejects malformed and unknown tokens without leaking anything", () => {
      expect(inspect("short")).toEqual({ state: "not_found" });
      expect(inspect(randomBytes(32).toString("base64url"))).toEqual({ state: "not_found" });
      expect(complete(randomBytes(32).toString("base64url"), STAFF_A)).toEqual({ ok: false, reason: "invalid_token" });
    });
  });

  describe("email ownership proof", () => {
    it("staff request returns who and where, never a token", () => {
      const r = request(M_UNSENT);
      expect(Object.keys(r).sort()).toEqual(["member_email", "member_name", "organization_id"]);
      expect(JSON.stringify(r)).not.toMatch(/token/i);
      expect(json<any>(`select public.get_member_portal_access('${M_UNSENT}')`, authz(STAFF_A))).toMatchObject({
        status: "pending",
        email_verification: "pending_email_verification",
      });
      expect(run(`select count(*) from public.member_activation_tokens where member_id = '${M_UNSENT}'`)).toBe("0");
    });

    it("a token that was never delivered proves nothing and cannot be used", () => {
      const t = mint(M_UNSENT);
      expect(inspect(t.raw_token).state).toBe("revoked");
      // ... and it is not presented to staff as an outstanding link either.
      expect(json<any>(`select public.get_member_portal_access('${M_UNSENT}')`, authz(STAFF_A)).pending_activation_expires_at).toBeNull();
      makeAuthUser(id(90), "unsent@example.com");
      expect(complete(t.raw_token, id(90))).toEqual({ ok: false, reason: "revoked" });
      expect(run(`select user_id is null from public.members where id = '${M_UNSENT}'`)).toBe("t");
    });

    it("an email that could not be sent revokes its token and leaves the address unverified", () => {
      const before = run(`select count(*) from auth.users where lower(email) = 'unsent@example.com'`);
      const t = mint(M_UNSENT);
      markDelivery(t.token_id, "failed", "'Resend 422'");
      expect(inspect(t.raw_token).state).toBe("revoked");
      expect(run(`select revoked_at is not null from public.member_activation_tokens where id = '${t.token_id}'`)).toBe("t");
      // Not even a later "sent" mark brings a revoked token back.
      markDelivery(t.token_id, "sent");
      expect(inspect(t.raw_token).state).toBe("revoked");
      expect(json<any>(`select public.get_member_portal_access('${M_UNSENT}')`, authz(STAFF_A)).email_verification).toBe("pending_email_verification");
      // Nothing in this flow creates or confirms an identity for the address.
      expect(run(`select count(*) from auth.users where lower(email) = 'unsent@example.com'`)).toBe(before);
    });

    it("minting is refused unless the staff request opened a pending email activation", () => {
      expect(failure(`select * from public.mint_member_activation_token('${M_NO_EMAIL}', '${STAFF_A}')`, SERVICE)).toContain("ACTIVATION_NOT_ALLOWED");
      expect(failure(`select * from public.mint_member_activation_token('${M_NO_UNIT}', '${STAFF_A}')`, SERVICE)).toContain("ACTIVATION_NOT_ALLOWED");
    });

    it("a token is bound to the address it was delivered to", () => {
      const t = issue(M_EDIT);
      expect(inspect(t.raw_token)).toMatchObject({ state: "valid", email: "edit-before@example.com" });
      // Staff cannot redirect a delivered link to an address of their choosing.
      run(`update public.members set email = 'attacker@example.com' where id = '${M_EDIT}'`);
      expect(inspect(t.raw_token).state).toBe("revoked");
      makeAuthUser(id(91), "attacker@example.com");
      expect(complete(t.raw_token, id(91))).toEqual({ ok: false, reason: "revoked" });
      makeAuthUser(id(92), "edit-before@example.com");
      expect(complete(t.raw_token, id(92))).toEqual({ ok: false, reason: "revoked" });
      run(`update public.members set email = 'edit-before@example.com' where id = '${M_EDIT}'`);
    });

    it("cross-member takeover is denied: one identity can never serve two members", () => {
      const a = issue(M_DUP_A);
      makeAuthUser(id(93), "dup@example.com");
      expect(complete(a.raw_token, id(93))).toMatchObject({ ok: true });
      // A second member that happens to share the address cannot claim the same identity.
      const b = issue(M_DUP_B);
      expect(complete(b.raw_token, id(93))).toEqual({ ok: false, reason: "already_linked" });
      expect(run(`select user_id is null from public.members where id = '${M_DUP_B}'`)).toBe("t");
      // And a token for one member never works for another member's address.
      const c = issue(M_EDIT);
      makeAuthUser(id(94), "dup2@example.com");
      expect(complete(c.raw_token, id(94))).toEqual({ ok: false, reason: "email_mismatch" });
    });

    it("an existing VERIFIED identity is linked, never duplicated, and an unverified one is never linked", () => {
      // verified: staff-a (fixture) -- covered in the shared-identity suite; here the negative case.
      const t = issue(M_UNVER);
      makeAuthUser(id(95), "unver@example.com", "attacker-password-hash", false);
      expect(inspect(t.raw_token)).toMatchObject({ state: "valid", existing_account: false, existing_unverified: true });
      // The owner's data must not go to whoever registered the address first.
      expect(complete(t.raw_token, id(95), "linked_existing")).toEqual({ ok: false, reason: "identity_unverified" });
      expect(run(`select user_id is null from public.members where id = '${M_UNVER}'`)).toBe("t");
      // The mailbox holder (the token was delivered there) may take the identity over; still one identity.
      expect(complete(t.raw_token, id(95), "provisioned")).toMatchObject({ ok: true });
      expect(run(`select count(*) from auth.users where lower(email) = 'unver@example.com'`)).toBe("1");
    });

    it("an unverified identity that belongs to an organization is never taken over", () => {
      const t = issue(M_ORGID);
      makeAuthUser(id(96), "orgid@example.com", "h", false);
      run(`insert into public.organization_memberships (organization_id, user_id, status) values ('${ORG_A}', '${id(96)}', 'invited')`);
      expect(inspect(t.raw_token)).toMatchObject({ existing_unverified: true, existing_in_use: true });
      expect(complete(t.raw_token, id(96), "provisioned")).toEqual({ ok: false, reason: "identity_in_use" });
    });

    it("an activation delivered by email completes, marks the address verified and is audited", () => {
      const t = issue(M_DELIVER);
      expect(json<any>(`select public.get_member_portal_access('${M_DELIVER}')`, authz(STAFF_A)).email_verification).toBe("pending_email_verification");
      expect(inspect(t.raw_token)).toMatchObject({ state: "valid", email: "deliver@example.com", existing_account: false, existing_unverified: false });
      // The server creates the identity only now, after the delivered token is presented.
      expect(run(`select count(*) from auth.users where lower(email) = 'deliver@example.com'`)).toBe("0");
      makeAuthUser(id(97), "deliver@example.com", "hash", true);
      expect(complete(t.raw_token, id(97))).toMatchObject({ ok: true });
      expect(json<any>(`select public.get_member_portal_access('${M_DELIVER}')`, authz(STAFF_A))).toMatchObject({
        status: "active",
        email_verification: "verified",
        login_method: "email",
      });
      expect(actions(M_DELIVER)).toBe(
        "member_portal.activation_created,member_portal.invitation_sent,member_portal.activation_completed",
      );
      expect(run(`select safe_change_summary->>'email_proof' from public.platform_audit_logs where entity_id = '${M_DELIVER}' and action = 'member_portal.activation_completed'`)).toBe("delivered_link");
      expect(complete(t.raw_token, id(97))).toEqual({ ok: false, reason: "used" });
    });
  });

  describe("cross-tenant and permission denial", () => {
    it("staff of another organization cannot read or act on the member", () => {
      for (const sql of [
        `select public.get_member_portal_access('${M_SUSPEND}')`,
        `select * from public.request_member_activation('${M_SUSPEND}')`,
        `select * from public.begin_member_temp_access('${M_SUSPEND}')`,
        `select * from public.suspend_member_portal('${M_SUSPEND}')`,
        `select * from public.reactivate_member_portal('${M_SUSPEND}')`,
        `select * from public.begin_member_signout('${M_SUSPEND}')`,
        `select public.revoke_member_activation('${M_SUSPEND}')`,
      ]) {
        expect(failure(sql, authz(STAFF_B)), sql).toContain("FORBIDDEN_PORTAL_ACCESS");
      }
    });

    it("a nonexistent member looks exactly like another tenant's member", () => {
      expect(failure(`select public.get_member_portal_access('${id(999)}')`, authz(STAFF_A))).toContain("FORBIDDEN_PORTAL_ACCESS");
    });

    it("staff without the permission are refused; anon and signed-out are refused", () => {
      expect(failure(`select * from public.request_member_activation('${M_SUSPEND}')`, authz(STAFF_NONE))).toContain("FORBIDDEN_PORTAL_ACCESS");
      expect(failure(`select * from public.request_member_activation('${M_SUSPEND}')`, { role: "anon" })).toContain("permission denied");
      expect(failure(`select * from public.request_member_activation('${M_SUSPEND}')`, { role: "authenticated" })).toContain("FORBIDDEN_PORTAL_ACCESS");
    });

    it("staff can neither mint a token nor mark one delivered, whatever their permissions", () => {
      request(M_SUSPEND);
      for (const staff of [STAFF_A, STAFF_B]) {
        expect(failure(`select * from public.mint_member_activation_token('${M_SUSPEND}', '${staff}')`, authz(staff))).toContain("permission denied");
        expect(failure(`select public.mark_member_activation_delivery('${id(998)}', 'sent')`, authz(staff))).toContain("permission denied");
      }
      expect(failure(`select * from public.mint_member_activation_token('${M_SUSPEND}', '${STAFF_A}')`, { role: "anon" })).toContain("permission denied");
      run(`select public.revoke_member_activation('${M_SUSPEND}')`, authz(STAFF_A));
    });

    it("clients cannot touch the tables or the service-only functions", () => {
      expect(failure(`select * from public.member_portal_access`, authz(STAFF_A))).toContain("permission denied");
      expect(failure(`select * from public.member_activation_tokens`, authz(STAFF_A))).toContain("permission denied");
      expect(failure(`select public.inspect_member_activation('x')`, authz(STAFF_A))).toContain("permission denied");
      expect(failure(`select public.log_member_portal_event('${M_OWNER}', 'member_portal.sessions_revoked', '${STAFF_A}')`, authz(STAFF_A))).toContain("permission denied");
      expect(failure(`select public.complete_member_activation('x', '${STAFF_A}', 'provisioned')`, authz(STAFF_A))).toContain("permission denied");
      expect(failure(`select public.portal_find_auth_user('a@b.c')`, authz(STAFF_A))).toContain("permission denied");
    });

    it("no new function is executable by anon", () => {
      const out = run(`
        select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('get_member_portal_access','request_member_activation','mint_member_activation_token',
                            'mark_member_activation_delivery','revoke_member_activation','begin_member_temp_access',
                            'finish_member_temp_access','suspend_member_portal','reactivate_member_portal',
                            'begin_member_signout','log_member_portal_event','inspect_member_activation',
                            'complete_member_activation','portal_find_auth_user','my_portal_access','complete_portal_first_login')
          and has_function_privilege('anon', p.oid, 'execute');
      `);
      expect(out).toBe("");
    });
  });

  describe("client id + temporary password", () => {
    const alias = (clientId: string) => `${clientId.toLowerCase()}@client.aqarbooks.local`;

    it("issues a client number, binds the alias identity, and forces a password change", () => {
      const begin = json<{ client_id: string; alias_email: string; is_regeneration: boolean; auth_user_id: string | null }>(
        `select to_jsonb(t) from public.begin_member_temp_access('${M_NO_EMAIL}') t;`,
        authz(STAFF_A),
      );
      expect(begin.alias_email).toBe(alias(begin.client_id));
      expect(begin.is_regeneration).toBe(false);

      // The server would now create the Auth user with the temporary password.
      const uid = id(70);
      makeAuthUser(uid, begin.alias_email, "bcrypt-of-temp-1");
      const expires = run(`select public.finish_member_temp_access('${M_NO_EMAIL}', '${uid}', 48)`, authz(STAFF_A));
      expect(new Date(expires).getTime()).toBeGreaterThan(Date.now() + 47 * 3600e3);

      const row = json<any>(`select to_jsonb(a) from public.member_portal_access a where member_id = '${M_NO_EMAIL}'`);
      expect(row).toMatchObject({ status: "pending", login_method: "client_id", auth_origin: "provisioned", must_change_password: true });
      expect(row.temp_pw_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(row.temp_pw_fingerprint).not.toContain("bcrypt-of-temp-1");
      expect(JSON.stringify(row)).not.toContain("bcrypt-of-temp-1");

      // Until the owner has changed the password, the portal sees nothing.
      expect(run(`select public.current_member_id() is null`, authz(uid))).toBe("t");
      expect(json<any>(`select public.my_portal_access()`, authz(uid))).toMatchObject({
        linked: true, status: "pending", must_change_password: true, temp_expired: false,
        login_method: "client_id", client_id: begin.client_id, phone_hint: "•••• 6543", has_staff_access: false,
      });
    });

    it("refuses to attach the member to an identity that is not the reserved alias", () => {
      makeAuthUser(id(71), "unrelated@example.com");
      expect(failure(`select public.finish_member_temp_access('${M_NO_EMAIL}', '${id(71)}')`, authz(STAFF_A))).toContain("AUTH_USER_MISMATCH");
      expect(failure(`select public.finish_member_temp_access('${M_NO_EMAIL}', '${STAFF_B}')`, authz(STAFF_A))).toContain("AUTH_USER_MISMATCH");
    });

    it("first login needs a really changed password, an unexpired credential, and a phone", () => {
      const uid = id(70);
      expect(json<any>(`select public.complete_portal_first_login('01119876543')`, authz(uid))).toEqual({ ok: false, reason: "PASSWORD_NOT_CHANGED" });
      run(`update auth.users set encrypted_password = 'bcrypt-of-chosen-password' where id = '${uid}'`);
      expect(json<any>(`select public.complete_portal_first_login('12')`, authz(uid))).toEqual({ ok: false, reason: "INVALID_PHONE" });

      run(`update public.member_portal_access set temp_password_expires_at = now() - interval '1 minute' where member_id = '${M_NO_EMAIL}'`);
      expect(json<any>(`select public.my_portal_access()`, authz(uid)).temp_expired).toBe(true);
      expect(json<any>(`select public.complete_portal_first_login('01119876543')`, authz(uid))).toEqual({ ok: false, reason: "TEMP_EXPIRED" });
      run(`update public.member_portal_access set temp_password_expires_at = now() + interval '1 hour' where member_id = '${M_NO_EMAIL}'`);

      expect(json<any>(`select public.complete_portal_first_login('٠١١١٩٨٧٦٥٤٣')`, authz(uid))).toEqual({ ok: true });
      const row = json<any>(`select to_jsonb(a) from public.member_portal_access a where member_id = '${M_NO_EMAIL}'`);
      expect(row).toMatchObject({ status: "active", must_change_password: false, temp_pw_fingerprint: null, temp_password_expires_at: null, confirmed_phone: "01119876543" });
      expect(row.activated_at).not.toBeNull();
      // The portal opens, and the temporary credential cannot be replayed.
      expect(run(`select public.current_member_id()`, authz(uid))).toBe(M_NO_EMAIL);
      expect(json<any>(`select public.complete_portal_first_login('01119876543')`, authz(uid))).toEqual({ ok: false, reason: "NOT_REQUIRED" });
    });

    it("regeneration keeps the client number, re-locks the account and is audited", () => {
      const begin = json<{ client_id: string; is_regeneration: boolean; auth_user_id: string }>(
        `select to_jsonb(t) from public.begin_member_temp_access('${M_NO_EMAIL}') t;`,
        authz(STAFF_A),
      );
      expect(begin.is_regeneration).toBe(true);
      expect(begin.auth_user_id).toBe(id(70));
      // begin_ alone changes nothing for an owner who is already in.
      expect(run(`select current_member_id from (select public.current_member_id() as current_member_id) s`, authz(id(70)))).toBe(M_NO_EMAIL);

      run(`update auth.users set encrypted_password = 'bcrypt-of-temp-2' where id = '${id(70)}'`);
      run(`select public.finish_member_temp_access('${M_NO_EMAIL}', '${id(70)}', 24)`, authz(STAFF_A));
      expect(run(`select public.current_member_id() is null`, authz(id(70)))).toBe("t");
      expect(json<any>(`select to_jsonb(a) from public.member_portal_access a where member_id = '${M_NO_EMAIL}'`)).toMatchObject({
        status: "active", must_change_password: true, client_id: begin.client_id,
      });
      expect(actions(M_NO_EMAIL)).toContain("member_portal.temp_access_regenerated");
    });

    it("an ACTIVE email account is never converted to client-id access", () => {
      expect(failure(`select * from public.begin_member_temp_access('${M_OWNER}')`, authz(STAFF_A))).toContain("EMAIL_ACCOUNT");
    });

    it("a pending email activation that could not be emailed falls back to a client number", () => {
      request(M_FALLBACK);
      const t = mint(M_FALLBACK);
      markDelivery(t.token_id, "failed", "'Resend 500'");
      expect(json<any>(`select public.get_member_portal_access('${M_FALLBACK}')`, authz(STAFF_A)).email_verification).toBe("pending_email_verification");
      const begin = json<{ client_id: string; alias_email: string }>(
        `select to_jsonb(t) from public.begin_member_temp_access('${M_FALLBACK}') t;`,
        authz(STAFF_A),
      );
      expect(begin.client_id).toMatch(/^MB-\d{5,}$/);
      expect(json<any>(`select to_jsonb(a) from public.member_portal_access a where member_id = '${M_FALLBACK}'`)).toMatchObject({
        login_method: "client_id",
        client_id: begin.client_id,
      });
      // The email path is closed: its token is dead and cannot be revived.
      expect(inspect(t.raw_token).state).toBe("revoked");
      expect(failure(`select * from public.request_member_activation('${M_FALLBACK}')`, authz(STAFF_A))).toContain("CLIENT_ID_ACCOUNT");
    });
  });

  describe("staff who are also owners share one identity", () => {
    it("links the existing identity: no second Auth user, no password set", () => {
      const t = issue(M_STAFF_OWNER);
      const info = inspect(t.raw_token) as any;
      expect(info).toMatchObject({ state: "valid", existing_account: true, email: "staff-a@example.com" });
      expect(run(`select count(*) from auth.users where lower(email) = 'staff-a@example.com'`)).toBe("1");
      expect(complete(t.raw_token, STAFF_A, "linked_existing")).toMatchObject({ ok: true });
      expect(run(`select count(*) from auth.users where lower(email) = 'staff-a@example.com'`)).toBe("1");
      expect(run(`select user_id from public.members where id = '${M_STAFF_OWNER}'`)).toBe(STAFF_A);
      expect(run(`select public.current_member_id()`, authz(STAFF_A))).toBe(M_STAFF_OWNER);
      expect(json<any>(`select public.my_portal_access()`, authz(STAFF_A))).toMatchObject({ linked: true, status: "active", has_staff_access: true });
    });

    it("suspending the owner side never bans or locks out the staff identity", () => {
      const s = json<{ auth_user_id: string; should_ban: boolean }>(
        `select to_jsonb(t) from public.suspend_member_portal('${M_STAFF_OWNER}', 'test') t;`,
        authz(STAFF_A),
      );
      expect(s).toEqual({ auth_user_id: STAFF_A, should_ban: false });
      // Owner side closed ...
      expect(run(`select public.current_member_id() is null`, authz(STAFF_A))).toBe("t");
      expect(json<any>(`select public.my_portal_access()`, authz(STAFF_A))).toMatchObject({ status: "suspended", has_staff_access: true });
      // ... staff side untouched.
      expect(run(`select public.has_permission('${STAFF_A}', '${ORG_A}', 'members.portal.manage')`)).toBe("t");
      const r = json<{ should_unban: boolean }>(`select to_jsonb(t) from public.reactivate_member_portal('${M_STAFF_OWNER}') t;`, authz(STAFF_A));
      expect(r.should_unban).toBe(false);
      expect(run(`select public.current_member_id()`, authz(STAFF_A))).toBe(M_STAFF_OWNER);
    });
  });

  describe("suspend, reactivate, sign out everywhere", () => {
    const uid = id(80);

    it("suspends a provisioned owner: closes the portal and asks for a ban", () => {
      const begin = json<{ alias_email: string }>(`select to_jsonb(t) from public.begin_member_temp_access('${M_LOGOUT}') t;`, authz(STAFF_A));
      makeAuthUser(uid, begin.alias_email, "bcrypt-of-temp-3");
      run(`select public.finish_member_temp_access('${M_LOGOUT}', '${uid}')`, authz(STAFF_A));
      run(`update auth.users set encrypted_password = 'bcrypt-chosen-3' where id = '${uid}'`);
      expect(json<any>(`select public.complete_portal_first_login('01001112223')`, authz(uid))).toEqual({ ok: true });
      expect(run(`select public.current_member_id()`, authz(uid))).toBe(M_LOGOUT);

      const s = json<{ auth_user_id: string; should_ban: boolean }>(
        `select to_jsonb(t) from public.suspend_member_portal('${M_LOGOUT}', 'non-payment') t;`,
        authz(STAFF_A),
      );
      expect(s).toEqual({ auth_user_id: uid, should_ban: true });
      expect(run(`select public.current_member_id() is null`, authz(uid))).toBe("t");
      expect(json<any>(`select public.my_portal_access()`, authz(uid))).toMatchObject({ status: "suspended", has_staff_access: false });
      expect(json<any>(`select public.get_member_portal_access('${M_LOGOUT}')`, authz(STAFF_A))).toMatchObject({ status: "suspended" });
      // Portal data really is closed: the owner can no longer read their own member row.
      expect(run(`select count(*) from public.members`, authz(uid))).toBe("0");
    });

    it("is idempotent and blocks new activation while suspended", () => {
      run(`select * from public.suspend_member_portal('${M_LOGOUT}')`, authz(STAFF_A));
      expect(run(`select count(*) from public.platform_audit_logs where entity_id = '${M_LOGOUT}' and action = 'member_portal.suspended'`)).toBe("1");
      expect(failure(`select * from public.begin_member_temp_access('${M_LOGOUT}')`, authz(STAFF_A))).toContain("PORTAL_SUSPENDED");
      expect(json<any>(`select public.complete_portal_first_login('01001112223')`, authz(uid))).toEqual({ ok: false, reason: "SUSPENDED" });
    });

    it("authorizes sign-out for the identity but never writes to managed Auth tables", () => {
      run(`insert into auth.sessions (user_id) values ('${uid}'), ('${uid}');`);
      const r = json<{ auth_user_id: string; is_banned: boolean }>(
        `select to_jsonb(t) from public.begin_member_signout('${M_LOGOUT}') t;`,
        authz(STAFF_A),
      );
      expect(r).toEqual({ auth_user_id: uid, is_banned: true });
      // Ending sessions is the Auth Admin API's job; SQL leaves auth.sessions alone.
      expect(run(`select count(*) from auth.sessions where user_id = '${uid}'`)).toBe("2");
      expect(failure(`select * from public.begin_member_signout('${M_NO_UNIT}')`, authz(STAFF_A))).toContain("NOT_PROVISIONED");
      expect(failure(`select * from public.begin_member_signout('${M_LOGOUT}')`, authz(STAFF_B))).toContain("FORBIDDEN_PORTAL_ACCESS");
    });

    it("records the outcome the server observed, through a closed list of events", () => {
      run(`select public.log_member_portal_event('${M_LOGOUT}', 'member_portal.sessions_revoked', '${STAFF_A}', '{"method":"admin_global_signout"}')`, SERVICE);
      expect(actions(M_LOGOUT)).toContain("member_portal.sessions_revoked");
      expect(run(`select actor_id from public.platform_audit_logs where entity_id = '${M_LOGOUT}' and action = 'member_portal.sessions_revoked'`)).toBe(STAFF_A);
      expect(failure(`select public.log_member_portal_event('${M_LOGOUT}', 'member_portal.suspended', '${STAFF_A}')`, SERVICE)).toContain("INVALID_PORTAL_EVENT");
    });

    it("reactivates without creating a new member, and asks for an unban", () => {
      const r = json<{ auth_user_id: string; should_unban: boolean }>(
        `select to_jsonb(t) from public.reactivate_member_portal('${M_LOGOUT}') t;`,
        authz(STAFF_A),
      );
      expect(r).toEqual({ auth_user_id: uid, should_unban: true });
      expect(run(`select public.current_member_id()`, authz(uid))).toBe(M_LOGOUT);
      expect(run(`select count(*) from public.members where id = '${M_LOGOUT}'`)).toBe("1");
      expect(json<any>(`select public.get_member_portal_access('${M_LOGOUT}')`, authz(STAFF_A)).status).toBe("active");
      expect(failure(`select * from public.reactivate_member_portal('${M_LOGOUT}')`, authz(STAFF_A))).toContain("NOT_SUSPENDED");
    });

    it("suspending a pending owner kills the outstanding link; reactivation returns to pending", () => {
      const t = issue(M_SUSPEND);
      run(`select * from public.suspend_member_portal('${M_SUSPEND}')`, authz(STAFF_A));
      expect(inspect(t.raw_token).state).toBe("revoked");
      expect(failure(`select * from public.request_member_activation('${M_SUSPEND}')`, authz(STAFF_A))).toContain("PORTAL_SUSPENDED");
      run(`select * from public.reactivate_member_portal('${M_SUSPEND}')`, authz(STAFF_A));
      expect(json<any>(`select public.get_member_portal_access('${M_SUSPEND}')`, authz(STAFF_A)).status).toBe("pending");
    });

    it("can suspend an owner who was linked through the older invitation flow", () => {
      makeAuthUser(id(81), "legacy@example.com");
      run(`update public.members set user_id = '${id(81)}' where id = '${M_LEGACY}'`);
      expect(json<any>(`select public.get_member_portal_access('${M_LEGACY}')`, authz(STAFF_A))).toMatchObject({ status: "active", legacy_linked: true });
      const s = json<any>(`select to_jsonb(t) from public.suspend_member_portal('${M_LEGACY}') t;`, authz(STAFF_A));
      expect(s).toEqual({ auth_user_id: id(81), should_ban: false });
      expect(run(`select public.current_member_id() is null`, authz(id(81)))).toBe("t");
    });
  });

  describe("audit trail", () => {
    it("records each lifecycle step without secrets", () => {
      const t = issue(M_REVOKE);
      expect(actions(M_REVOKE)).toContain("member_portal.invitation_sent");
      markDelivery(t.token_id, "failed", "'smtp timeout'");
      expect(run(`select delivery_status from public.member_activation_tokens where id = '${t.token_id}'`)).toBe("failed");
      expect(actions(M_REVOKE)).toContain("member_portal.invitation_failed");

      expect(actions(M_OWNER)).toContain("member_portal.activation_created");
      expect(actions(M_OWNER)).toContain("member_portal.activation_completed");
      expect(actions(M_NO_EMAIL)).toContain("member_portal.temp_access_issued");
      expect(actions(M_NO_EMAIL)).toContain("member_portal.activation_completed");
      expect(actions(M_LOGOUT)).toContain("member_portal.suspended");
      expect(actions(M_LOGOUT)).toContain("member_portal.reactivated");

      const blob = run(`select coalesce(string_agg(safe_change_summary::text || coalesce(reason, ''), ' '), '') from public.platform_audit_logs where action like 'member_portal.%'`);
      expect(blob).not.toMatch(/password|secret|raw_token|bcrypt|hash/i);
      expect(blob).not.toContain(t.raw_token);
      expect(blob).not.toContain(t.member_email);
    });

    it("attributes staff actions to the staff user", () => {
      expect(run(`select count(*) from public.platform_audit_logs where action = 'member_portal.activation_created' and actor_id = '${STAFF_A}'`)).not.toBe("0");
    });
  });
});
