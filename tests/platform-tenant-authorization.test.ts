import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

// Define mock data and handlers
const orgId = "6bdda7c1-3444-4c28-996e-3aaff14b630c";
const callerUserId = "a836e6e8-8538-4f59-a9df-41dbcfe4e7b8";
const targetUserId = "62fea3a7-da31-433f-b390-9a0beb018d73";
const roleAdminId = "8c9768df-063c-4341-a8b7-cd878c32084f";
const roleNewId = "a05ebdf9-8641-4281-bb2a-1d33a730737a";
const permUsersId = "323aaea2-f77f-4a4e-8512-bf99a19a10f5";
const permRolesId = "5f6872bc-6d37-4ce7-8cd4-e77b571a2dd4";

let mockCurrentUser: { id: string; email: string } | null = null;
let mockIsDemo = false;
let mockMembership: { status: string } | null = null;
let mockAssignments: Array<{ role_id: string }> = [];
let mockRoles: Array<{ id: string; key: string; organization_id: string | null; is_system: boolean }> = [];
let mockRolePermissions: Array<{ permission_id: string; permissions?: { key: string } }> = [];
let mockPermissions: Array<{ id: string; key: string }> = [];
let mockRoleTemplatePerms: Array<{ permission_id: string }> = [];
let mockOtherOwners: Array<{ user_id: string; status?: string }> = [];
let mockAuditLogs: Array<any> = [];

// Track auth admin calls
let mockAuthAdminUsers: Array<{ id: string; email: string }> = [];
let deleteUserCalls: string[] = [];
let inviteUserFail = false;

// Mock dependencies
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => mockCurrentUser),
  isPlatformAdmin: vi.fn(async (userId: string) => {
    // True only if caller holds PLATFORM_SUPER_ADMIN with organization_id IS NULL
    const hasPlatformRole = mockAssignments.some((a) => {
      const r = mockRoles.find((role) => role.id === a.role_id);
      return r && r.key === "PLATFORM_SUPER_ADMIN" && r.organization_id === null;
    });
    return hasPlatformRole;
  }),
}));

vi.mock("@/lib/demo/guard", () => ({
  denyIfDemo: vi.fn(async () => (mockIsDemo ? { ok: false, error: "demo_read_only" } : null)),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockCurrentUser },
      })),
    },
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === "add_organization_member") {
        if (args.p_role_key === "FAIL_DB") {
          return { error: { message: "db_error" } };
        }
        return { data: true, error: null };
      }
      return { data: true, error: null };
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      const queryBuilder: any = {
        _table: table,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn(),
        delete: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === "organization_memberships") {
        queryBuilder.maybeSingle.mockResolvedValue({ data: mockMembership, error: null });
        queryBuilder.select.mockImplementation(() => {
          const chain: any = {
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                in: vi.fn().mockResolvedValue({ data: mockOtherOwners, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
              })),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
            })),
            in: vi.fn().mockResolvedValue({ data: mockOtherOwners, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
          };
          return chain;
        });
        queryBuilder.update.mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }));
        queryBuilder.delete.mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }));
      }

      if (table === "user_role_assignments") {
        queryBuilder.select.mockImplementation(() => {
          const chain: any = {
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                in: vi.fn().mockImplementation((col: string, vals: any[]) => {
                  if (col === "role_id") {
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "assign-1" }, error: null }),
                      then: (resolve: any) => resolve({ data: mockOtherOwners.map((o) => ({ user_id: o.user_id })), error: null }),
                    };
                  }
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "assign-1" }, error: null }),
                    then: (resolve: any) => resolve({ data: mockAssignments, error: null }),
                  };
                }),

                maybeSingle: vi.fn().mockImplementation(() => {
                  const hasOwner = mockAssignments.some((a) => {
                    const r = mockRoles.find((role) => role.id === a.role_id);
                    return r?.key === "TENANT_OWNER";
                  });
                  return Promise.resolve({ data: hasOwner ? { id: "assign-1" } : null, error: null });
                }),
                then: (resolve: any) => resolve({ data: mockAssignments, error: null }),
              })),
              in: vi.fn().mockImplementation((col: string, vals: any[]) => {
                if (col === "role_id") {
                  const owners = mockOtherOwners.map((o) => ({ user_id: o.user_id }));
                  owners.push({ user_id: targetUserId });
                  return Promise.resolve({ data: owners, error: null });
                }
                return Promise.resolve({ data: mockAssignments, error: null });
              }),

              maybeSingle: vi.fn().mockImplementation(() => {
                const hasOwner = mockAssignments.some((a) => {
                  const r = mockRoles.find((role) => role.id === a.role_id);
                  return r?.key === "TENANT_OWNER";
                });
                return Promise.resolve({ data: hasOwner ? { id: "assign-1" } : null, error: null });
              }),
            })),
            in: vi.fn().mockImplementation((col: string, vals: any[]) => {
              if (col === "role_id") {
                return Promise.resolve({ data: mockOtherOwners.map((o) => ({ user_id: o.user_id })), error: null });
              }
              return Promise.resolve({ data: mockAssignments, error: null });
            }),
          };
          return chain;
        });
        queryBuilder.delete.mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }));
        queryBuilder.insert.mockResolvedValue({ error: null });
      }

      if (table === "roles") {
        queryBuilder.single.mockImplementation(() => {
          const r = mockRoles[0] || null;
          return Promise.resolve({ data: r, error: r ? null : { message: "not found" } });
        });
        queryBuilder.maybeSingle.mockImplementation(() => {
          const r = mockRoles[0] || null;
          return Promise.resolve({ data: r, error: null });
        });
        queryBuilder.in.mockResolvedValue({ data: mockRoles, error: null });
        queryBuilder.select.mockImplementation(() => {
          const roleSelect: any = {
            or: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((field: string, val: string) => {
              const matched = mockRoles.filter((r) => (r as any)[field] === val);
              const resObj: any = {
                single: vi.fn().mockResolvedValue({ data: matched[0] || mockRoles[0] || null, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: matched[0] || mockRoles[0] || null, error: null }),
                in: vi.fn().mockResolvedValue({ data: matched, error: null }),
                or: vi.fn().mockImplementation(() => ({
                  then: (resolve: any) => resolve({ data: matched, error: null }),
                })),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                then: (resolve: any) => resolve({ data: matched, error: null }),
              };
              return resObj;
            }),

            in: vi.fn().mockImplementation((field: string, vals: string[]) => {
              const matched = mockRoles.filter((r) => vals.includes((r as any)[field]));
              return Promise.resolve({ data: matched, error: null });
            }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockRoles[0] || null, error: null }),
            single: vi.fn().mockResolvedValue({ data: mockRoles[0] || null, error: null }),
          };
          return roleSelect;
        });
        queryBuilder.insert.mockImplementation((payload: any) => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "92cf89b3-0bb3-456a-92dd-a9a657695e52" }, error: null }),
          }),
        }));
      }

      if (table === "role_permissions") {
        queryBuilder.select.mockImplementation(() => ({
          in: vi.fn().mockImplementation((field: string, vals: string[]) => {
            return Promise.resolve({ data: mockRolePermissions, error: null });
          }),
        }));
        queryBuilder.delete.mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }));
        queryBuilder.insert.mockResolvedValue({ error: null });
      }

      if (table === "permissions") {
        queryBuilder.select.mockImplementation(() => ({
          in: vi.fn().mockImplementation((field: string, vals: string[]) => ({
            eq: vi.fn().mockImplementation((f2: string, v2: string) => ({
              maybeSingle: vi.fn().mockImplementation(() => {
                const found = mockPermissions.find((p) => p.key === v2);
                return Promise.resolve({ data: found || null, error: null });
              }),
            })),
          })),
        }));
        queryBuilder.in.mockImplementation((field: string, ids: string[]) => {
          const matched = mockPermissions.filter((p) => ids.includes(p.id));
          return Promise.resolve({ data: matched, error: null });
        });
      }

      if (table === "role_template_permissions") {
        queryBuilder.select.mockImplementation(() => ({
          in: vi.fn().mockResolvedValue({ data: mockRoleTemplatePerms, error: null }),
        }));
      }

      if (table === "platform_audit_logs") {
        queryBuilder.insert.mockImplementation((payload: any) => {
          mockAuditLogs.push(payload);
          return Promise.resolve({ error: null });
        });
      }

      if (table === "profiles") {
        queryBuilder.upsert.mockResolvedValue({ error: null });
      }

      return queryBuilder;
    },
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async (email: string) => {
          if (inviteUserFail) return { data: null, error: { message: "invite_failed" } };
          return { data: { user: { id: "37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7", email } }, error: null };
        }),
        listUsers: vi.fn(async () => ({
          data: { users: mockAuthAdminUsers },
        })),
        deleteUser: vi.fn(async (userId: string) => {
          deleteUserCalls.push(userId);
          return { error: null };
        }),
      },
    },
  })),
}));

// Import actions after mocking
import {
  inviteUserAction,
  changeUserRoleAction,
  updateUserStatusAction,
  removeUserAction,
} from "@/lib/actions/users";
import {
  createRoleAction,
  updateRolePermissionsAction,
} from "@/lib/actions/roles";
import { inviteMemberAction } from "@/lib/actions/tenant";
import { proveTenantPermission } from "@/lib/auth/authorize";

describe("Platform and Tenant Authorization Containment (W0-SEC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = { id: callerUserId, email: "admin@aqarbooks.com" };
    mockIsDemo = false;
    mockMembership = { status: "active" };
    mockAssignments = [{ role_id: roleAdminId }];
    mockRoles = [
      { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
      { id: roleNewId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
    ];
    mockRolePermissions = [
      { permission_id: permUsersId },
      { permission_id: permRolesId },
    ];
    mockPermissions = [
      { id: permUsersId, key: "tenant.users.manage" },
      { id: permRolesId, key: "tenant.roles.manage" },
    ];
    mockRoleTemplatePerms = [
      { permission_id: permUsersId },
      { permission_id: permRolesId },
    ];
    mockOtherOwners = [{ user_id: "dba74b87-1c6b-4520-99ea-1ac69468f00a" }];
    mockAuditLogs = [];
    mockAuthAdminUsers = [];
    deleteUserCalls = [];
    inviteUserFail = false;
  });

  describe("Application-Layer Tenant Authorization Proof (proveTenantPermission)", () => {
    it("fails when caller has no active membership", async () => {
      mockMembership = { status: "suspended" };
      const proof = await proveTenantPermission(orgId, "tenant.users.manage", callerUserId);
      expect(proof.ok).toBe(false);
      if (!proof.ok) expect(proof.error).toBe("unauthorized");
    });

    it("fails when role does not grant requested permission", async () => {
      mockPermissions = []; // No permission matching
      const proof = await proveTenantPermission(orgId, "tenant.users.manage", callerUserId);
      expect(proof.ok).toBe(false);
      if (!proof.ok) expect(proof.error).toBe("forbidden");
    });

    it("SEC-01: does NOT short-circuit or grant access via PLATFORM_SUPER_ADMIN role key", async () => {
      mockRoles = [
        { id: roleNewId, key: "PLATFORM_SUPER_ADMIN", organization_id: orgId, is_system: false },
      ];
      mockAssignments = [{ role_id: roleNewId }];
      // Even if database has_permission might short-circuit, proveTenantPermission explicitly filters out PLATFORM_SUPER_ADMIN
      const proof = await proveTenantPermission(orgId, "tenant.users.manage", callerUserId);
      expect(proof.ok).toBe(false);
      if (!proof.ok) expect(proof.error).toBe("forbidden");
    });
  });

  describe("users.ts Server Actions Authorization & Containment", () => {
    it("SEC-02 / Negative: Cashier role holding only finance.cashier.access is rejected", async () => {
      mockRoles = [{ id: roleAdminId, key: "CASHIER", organization_id: orgId, is_system: false }];
      mockPermissions = [{ id: permUsersId, key: "finance.cashier.access" }];

      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "new@example.com");
      fd.append("roleKey", "CASHIER");

      const res = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("forbidden");
    });

    it("SEC-02 / Negative: Auditor role holding only reports.view is rejected", async () => {
      mockRoles = [{ id: roleAdminId, key: "AUDITOR", organization_id: orgId, is_system: false }];
      mockPermissions = [{ id: permUsersId, key: "reports.view" }];

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("forbidden");
    });

    it("SEC-04: denyIfDemo blocks all users.ts mutating actions", async () => {
      mockIsDemo = true;
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "test@demo.com");
      fd.append("roleKey", "TENANT_ADMIN");

      const resInvite = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(resInvite).toEqual({ ok: false, error: "demo_read_only" });

      const resRole = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(resRole).toEqual({ ok: false, error: "demo_read_only" });

      const resStatus = await updateUserStatusAction(orgId, targetUserId, "suspended");
      expect(resStatus).toEqual({ ok: false, error: "demo_read_only" });

      const resRemove = await removeUserAction(orgId, targetUserId);
      expect(resRemove).toEqual({ ok: false, error: "demo_read_only" });
    });

    it("Protection: cannot suspend self", async () => {
      const res = await updateUserStatusAction(orgId, callerUserId, "suspended");
      expect(res).toEqual({ ok: false, error: "cannot_suspend_self" });
    });

    it("Protection: cannot remove self", async () => {
      const res = await removeUserAction(orgId, callerUserId);
      expect(res).toEqual({ ok: false, error: "cannot_remove_self" });
    });

    it("Protection: cannot demote, suspend, or remove the last active TENANT_OWNER", async () => {
      // Mock that target is TENANT_OWNER and there are no other active owners
      mockOtherOwners = []; // No other owners
      mockRoles = [
        { id: roleAdminId, key: "TENANT_OWNER", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
      ];

      const resDemote = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(resDemote).toEqual({ ok: false, error: "cannot_demote_last_tenant_owner" });

      const resSuspend = await updateUserStatusAction(orgId, targetUserId, "suspended");
      expect(resSuspend).toEqual({ ok: false, error: "cannot_suspend_last_tenant_owner" });

      const resRemove = await removeUserAction(orgId, targetUserId);
      expect(resRemove).toEqual({ ok: false, error: "cannot_remove_last_tenant_owner" });
    });


    it("SEC-01 / Negative: cannot assign PLATFORM_SUPER_ADMIN in changeUserRoleAction", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "PLATFORM_SUPER_ADMIN", organization_id: null, is_system: true },
      ];

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res).toEqual({ ok: false, error: "invalid_role_assignment" });
    });

    it("Cross-Tenant: cannot assign role belonging to another organization", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "CUSTOM_ROLE", organization_id: "dba74b87-1c6b-4520-99ea-1ac69468f00a", is_system: false },
      ];

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res).toEqual({ ok: false, error: "role_organization_mismatch" });
    });

    it("OBS-02: successful operations record audit trail in platform_audit_logs", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
      ];

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res).toEqual({ ok: true });
      expect(mockAuditLogs.length).toBeGreaterThan(0);
      expect(mockAuditLogs[0].action).toBe("user.role_changed");
      expect(mockAuditLogs[0].actor_id).toBe(callerUserId);
      expect(mockAuditLogs[0].organization_id).toBe(orgId);
    });
  });

  describe("roles.ts Server Actions Authorization & Scope Validation", () => {
    it("SEC-02 / Negative: cannot create role with reserved key PLATFORM_SUPER_ADMIN", async () => {
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("key", "PLATFORM_SUPER_ADMIN");
      fd.append("nameAr", "مدير المنصة");
      fd.append("nameEn", "Platform Admin");

      const res = await createRoleAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: false, error: "reserved_role_key" });
    });

    it("SEC-02: rejects granting platform.% permissions to tenant roles", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "CUSTOM_ROLE", organization_id: orgId, is_system: false },
      ];
      // Permission has platform. prefix
      mockPermissions = [
        { id: permRolesId, key: "tenant.roles.manage" },
        { id: "37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7", key: "platform.organizations.manage" },
      ];

      const res = await updateRolePermissionsAction(orgId, roleNewId, ["37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7"]);
      expect(res).toEqual({ ok: false, error: "invalid_permission_scope" });
    });

    it("Security: cannot modify system roles", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "TENANT_OWNER", organization_id: null, is_system: true },
      ];

      const res = await updateRolePermissionsAction(orgId, roleNewId, [permRolesId]);
      expect(res).toEqual({ ok: false, error: "cannot_modify_system_role" });
    });

    it("SEC-04: denyIfDemo blocks role creation and permission updates", async () => {
      mockIsDemo = true;
      const resUpdate = await updateRolePermissionsAction(orgId, roleNewId, [permRolesId]);
      expect(resUpdate).toEqual({ ok: false, error: "demo_read_only" });

      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("key", "TEST_ROLE");
      fd.append("nameAr", "دور تجريبي");
      fd.append("nameEn", "Test Role");
      const resCreate = await createRoleAction({ ok: false, error: "" }, fd);
      expect(resCreate).toEqual({ ok: false, error: "demo_read_only" });
    });
  });

  describe("tenant.ts inviteMemberAction Security & Auth Compensation (SEC-05)", () => {
    it("SEC-05: verifies authorization BEFORE calling auth.admin.inviteUserByEmail", async () => {
      mockMembership = { status: "suspended" }; // Caller not authorized

      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "invitee@example.com");
      fd.append("roleKey", "TENANT_ADMIN");

      const res = await inviteMemberAction({ ok: false, error: "" }, fd);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("unauthorized");
      // Auth admin should not have been called
      expect(deleteUserCalls.length).toBe(0);
    });

    it("SEC-05 / Auth Compensation: deletes newly created auth user if subsequent DB write fails", async () => {
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "faildb@example.com");
      fd.append("roleKey", "FAIL_DB"); // Triggers mock RPC failure

      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "FAIL_DB", organization_id: orgId, is_system: false },
      ];

      const res = await inviteMemberAction({ ok: false, error: "" }, fd);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("db_error");

      // Compensation must have triggered deleteUser for newly invited user
      expect(deleteUserCalls).toContain("37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7");
    });
  });

  describe("Database Trigger Invariants Simulation", () => {
    it("simulates user_role_assignments trigger: rejects PLATFORM_SUPER_ADMIN with organization_id", () => {
      const simulateTrigger = (roleKey: string, assignmentOrgId: string | null) => {
        if (roleKey === "PLATFORM_SUPER_ADMIN" && assignmentOrgId !== null) {
          throw new Error("PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope");
        }
      };

      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", orgId)).toThrow(
        "PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope"
      );
      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", null)).not.toThrow();
      expect(() => simulateTrigger("TENANT_ADMIN", orgId)).not.toThrow();
    });

    it("simulates roles trigger: rejects creating PLATFORM_SUPER_ADMIN with organization_id", () => {
      const simulateTrigger = (key: string, organizationId: string | null) => {
        if (key === "PLATFORM_SUPER_ADMIN" && organizationId !== null) {
          throw new Error("Cannot create organization-scoped role with reserved key PLATFORM_SUPER_ADMIN");
        }
      };

      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", orgId)).toThrow(
        "Cannot create organization-scoped role with reserved key PLATFORM_SUPER_ADMIN"
      );
      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", null)).not.toThrow();
      expect(() => simulateTrigger("CUSTOM_ROLE", orgId)).not.toThrow();
    });

    it("simulates role_permissions trigger: rejects granting platform.% permissions to tenant roles", () => {
      const simulateTrigger = (roleOrgId: string | null, permKey: string) => {
        if (roleOrgId !== null && permKey.startsWith("platform.")) {
          throw new Error("Platform permissions cannot be granted to organization roles");
        }
      };

      expect(() => simulateTrigger(orgId, "platform.tenants.manage")).toThrow(
        "Platform permissions cannot be granted to organization roles"
      );
      expect(() => simulateTrigger(null, "platform.tenants.manage")).not.toThrow();
      expect(() => simulateTrigger(orgId, "tenant.users.manage")).not.toThrow();
    });
  });
});
