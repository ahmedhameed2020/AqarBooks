import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

/**
 * REPRODUCIBLE NON-PRODUCTION POSTGRESQL VERIFICATION: W0-SEC
 *
 * Runs against an isolated in-process PostgreSQL 18.3 engine (PGlite WASM).
 * NEVER points at or connects to production database ataslxkcflxuilpgyepm.
 *
 * Verifies all 10 authorization containment invariants:
 *   1. Platform Admin assignment containment (rejects PLATFORM_SUPER_ADMIN in org scope)
 *   2. Cross-Tenant role assignment containment (rejects role org mismatch)
 *   3. Hardened is_platform_admin() semantics (strictly requires org_id IS NULL)
 *   4. Tenant role definition containment (rejects org role named PLATFORM_SUPER_ADMIN)
 *   5. Permission scope trigger (rejects platform.% permissions on org roles)
 *   6. Valid tenant role assignments and template assignments
 *   7A. has_permission(): ACTIVE member + valid role assignment + permission -> true
 *   7B. has_permission(): Suspended member + valid role assignment + permission -> false
 *   7C. has_permission(): Deleted membership + stale role assignment -> false
 *   7D. has_permission(): Canonical global PLATFORM_SUPER_ADMIN -> true
 */
describe("W0-SEC Real PostgreSQL Engine Verification (Disposable PGlite)", () => {
  let db: PGlite;

  const orgA = "a0000000-0000-0000-0000-000000000001";
  const orgB = "b0000000-0000-0000-0000-000000000002";
  const userAdmin = "11111111-1111-1111-1111-111111111111";
  const userTenant = "22222222-2222-2222-2222-222222222222";
  const userAttacker = "33333333-3333-3333-3333-333333333333";

  const roleSuperAdminId = "90000000-0000-0000-0000-000000000001";
  const roleTenantTemplateId = "90000000-0000-0000-0000-000000000002";
  const roleOrgAId = "90000000-0000-0000-0000-000000000003";

  const permPlatformId = "80000000-0000-0000-0000-000000000001";
  const permTenantId = "80000000-0000-0000-0000-000000000002";

  beforeAll(async () => {
    db = new PGlite();

    // 1. Initialize isolated base schema in disposable PostgreSQL
    await db.exec(`
      CREATE TABLE public.organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL
      );

      CREATE TABLE public.organization_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        UNIQUE(organization_id, user_id)
      );

      CREATE TABLE public.roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL,
        name text NOT NULL,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        is_system boolean DEFAULT false
      );

      CREATE TABLE public.permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL UNIQUE,
        name text NOT NULL
      );

      CREATE TABLE public.role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
        UNIQUE(role_id, permission_id)
      );

      CREATE TABLE public.user_role_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE
      );
    `);

    // 2. Load and apply staged remediation DDL
    const ddlPath = path.resolve(__dirname, "../../supabase/remediations/w0-sec-authorization-containment.sql");
    const ddlSql = fs.readFileSync(ddlPath, "utf8");
    await db.exec(ddlSql);

    // 3. Seed test fixtures
    await db.query("INSERT INTO public.organizations (id, name) VALUES ($1, 'Tenant Alpha'), ($2, 'Tenant Beta');", [orgA, orgB]);

    await db.query(
      `INSERT INTO public.roles (id, key, name, organization_id, is_system) VALUES
        ($1, 'PLATFORM_SUPER_ADMIN', 'Platform Super Admin', NULL, true),
        ($2, 'TENANT_ADMIN', 'Tenant Admin Template', NULL, true),
        ($3, 'ORG_A_CUSTOM_ROLE', 'Org A Custom Role', $4, false);`,
      [roleSuperAdminId, roleTenantTemplateId, roleOrgAId, orgA]
    );

    await db.query(
      `INSERT INTO public.permissions (id, key, name) VALUES
        ($1, 'platform.tenants.manage', 'Manage Platform Tenants'),
        ($2, 'tenant.users.manage', 'Manage Tenant Users');`,
      [permPlatformId, permTenantId]
    );

    // Setup global platform admin assignment for userAdmin
    await db.query(
      "INSERT INTO public.user_role_assignments (user_id, role_id, organization_id) VALUES ($1, $2, NULL);",
      [userAdmin, roleSuperAdminId]
    );

    // Link tenant permission to Org A custom role
    await db.query(
      "INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2);",
      [roleOrgAId, permTenantId]
    );
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it("Invariant 1 (Platform Admin Containment): rejects assigning PLATFORM_SUPER_ADMIN to an organization scope", async () => {
    await expect(
      db.query(
        "INSERT INTO public.user_role_assignments (user_id, role_id, organization_id) VALUES ($1, $2, $3);",
        [userAttacker, roleSuperAdminId, orgA]
      )
    ).rejects.toThrow("PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope");
  });

  it("Invariant 2 (Cross-Tenant Role Containment): rejects assigning Org A role in Org B scope", async () => {
    await expect(
      db.query(
        "INSERT INTO public.user_role_assignments (user_id, role_id, organization_id) VALUES ($1, $2, $3);",
        [userAttacker, roleOrgAId, orgB]
      )
    ).rejects.toThrow("Tenant-owned role");
  });

  it("Invariant 3 (Hardened is_platform_admin): returns true for global assignment and false for non-admin", async () => {
    const adminCheck = await db.query<{ is_admin: boolean }>("SELECT public.is_platform_admin($1) AS is_admin;", [userAdmin]);
    expect(adminCheck.rows[0].is_admin).toBe(true);

    const tenantCheck = await db.query<{ is_admin: boolean }>("SELECT public.is_platform_admin($1) AS is_admin;", [userTenant]);
    expect(tenantCheck.rows[0].is_admin).toBe(false);
  });

  it("Invariant 4 (Tenant Role Definition Containment): rejects creating tenant role named PLATFORM_SUPER_ADMIN", async () => {
    await expect(
      db.query(
        "INSERT INTO public.roles (key, name, organization_id, is_system) VALUES ('PLATFORM_SUPER_ADMIN', 'Malicious Org Role', $1, false);",
        [orgA]
      )
    ).rejects.toThrow("Cannot create organization-scoped role with reserved key PLATFORM_SUPER_ADMIN");
  });

  it("Invariant 5 (Permission Scope Trigger): rejects granting platform.% permissions to organization roles", async () => {
    await expect(
      db.query(
        "INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2);",
        [roleOrgAId, permPlatformId]
      )
    ).rejects.toThrow("Platform permissions cannot be granted to organization roles");
  });

  it("Invariant 6 (Valid Tenant Role Assignment): permits valid tenant-owned and global template roles in tenant scope", async () => {
    // 6a: Valid tenant role assignment matching org
    await expect(
      db.query(
        "INSERT INTO public.user_role_assignments (user_id, role_id, organization_id) VALUES ($1, $2, $3);",
        [userTenant, roleOrgAId, orgA]
      )
    ).resolves.toBeDefined();

    // 6b: Valid legacy global template role in org scope
    await expect(
      db.query(
        "INSERT INTO public.user_role_assignments (user_id, role_id, organization_id) VALUES ($1, $2, $3);",
        [userTenant, roleTenantTemplateId, orgA]
      )
    ).resolves.toBeDefined();
  });

  it("Invariant 7A (has_permission ACTIVE): returns true when member is ACTIVE with valid role and permission", async () => {
    // Insert ACTIVE membership for userTenant in Org A
    await db.query(
      `INSERT INTO public.organization_memberships (organization_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active';`,
      [orgA, userTenant]
    );

    const res = await db.query<{ has_perm: boolean }>(
      "SELECT public.has_permission($1, $2, 'tenant.users.manage') AS has_perm;",
      [userTenant, orgA]
    );

    expect(res.rows[0].has_perm).toBe(true);
  });

  it("Invariant 7B (has_permission Suspended): returns false when member is suspended even with valid role assignment", async () => {
    // Update userTenant membership to suspended
    await db.query(
      "UPDATE public.organization_memberships SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2;",
      [orgA, userTenant]
    );

    const res = await db.query<{ has_perm: boolean }>(
      "SELECT public.has_permission($1, $2, 'tenant.users.manage') AS has_perm;",
      [userTenant, orgA]
    );

    expect(res.rows[0].has_perm).toBe(false);
  });

  it("Invariant 7C (has_permission Deleted Membership): returns false when membership row is deleted but stale role assignment remains", async () => {
    // Delete membership row entirely, leaving stale user_role_assignments row intact
    await db.query(
      "DELETE FROM public.organization_memberships WHERE organization_id = $1 AND user_id = $2;",
      [orgA, userTenant]
    );

    const res = await db.query<{ has_perm: boolean }>(
      "SELECT public.has_permission($1, $2, 'tenant.users.manage') AS has_perm;",
      [userTenant, orgA]
    );

    expect(res.rows[0].has_perm).toBe(false);
  });

  it("Invariant 7D (has_permission Canonical Platform Admin): returns true for canonical global PLATFORM_SUPER_ADMIN", async () => {
    // Canonical platform admin has no membership in Org A, but holds global PLATFORM_SUPER_ADMIN
    const res = await db.query<{ has_perm: boolean }>(
      "SELECT public.has_permission($1, $2, 'tenant.users.manage') AS has_perm;",
      [userAdmin, orgA]
    );

    expect(res.rows[0].has_perm).toBe(true);
  });
});
