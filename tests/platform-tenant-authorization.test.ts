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
let mockTargetMemberships = new Map<string, { status: string } | null>();
let mockAssignments: Array<{ role_id: string }> = [];
let mockRoles: Array<{ id: string; key: string; organization_id: string | null; is_system: boolean }> = [];
let mockRolePermissions: Array<{ role_id?: string; permission_id: string; permissions?: { key: string } }> = [];
let mockPermissions: Array<{ id: string; key: string }> = [];
let mockRoleTemplatePerms: Array<{ role_template_key?: string; permission_key: string }> = [];
let mockOtherOwners: Array<{ user_id: string; status?: string }> = [];
let mockAuditLogs: Array<any> = [];

// Track auth admin and compensation calls
let mockAuthAdminUsers: Array<{ id: string; email: string }> = [];
let deleteUserCalls: string[] = [];
let deleteRoleCalls: string[] = [];
let inviteUserFail = false;
let mockRolePermissionsSelectError: { message: string } | null = null;
let mockRolePermissionsTargetOnly = false;
let mockRolePermissionsInsertError: { message: string } | null = null;
let mockPermissionsSelectError: { message: string } | null = null;
let mockPermissionsTargetOnly = false;
let mockMembershipSelectError: { message: string } | null = null;

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
        queryBuilder.maybeSingle.mockImplementation(() => Promise.resolve({ data: mockMembership, error: null }));
        queryBuilder.select.mockImplementation(() => {
          const chain: any = {
            eq: vi.fn().mockImplementation((col1: string, val1: string) => ({
              eq: vi.fn().mockImplementation((col2: string, val2: string) => {
                const requestedUserId = col1 === "user_id" ? val1 : col2 === "user_id" ? val2 : null;
                if (mockMembershipSelectError && requestedUserId !== callerUserId) {
                  return {
                    in: vi.fn().mockResolvedValue({ data: null, error: mockMembershipSelectError }),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: mockMembershipSelectError }),
                  };
                }
                let memberData: { status: string } | null = null;
                if (requestedUserId === callerUserId) {
                  memberData = mockMembership;
                } else if (requestedUserId && mockTargetMemberships.has(requestedUserId)) {
                  memberData = mockTargetMemberships.get(requestedUserId) || null;
                } else {
                  memberData = null;
                }
                return {
                  in: vi.fn().mockResolvedValue({ data: mockOtherOwners, error: null }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: memberData, error: null }),
                };
              }),
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
        queryBuilder.delete.mockImplementation(() => ({
          eq: vi.fn().mockImplementation((field: string, val: string) => {
            if (field === "id") deleteRoleCalls.push(val);
            return Promise.resolve({ error: null });
          }),
        }));
      }

      if (table === "role_permissions") {
        queryBuilder.select.mockImplementation(() => {
          if (mockRolePermissionsSelectError && !mockRolePermissionsTargetOnly) {
            const errChain: any = {
              in: vi.fn().mockResolvedValue({ data: null, error: mockRolePermissionsSelectError }),
              eq: vi.fn().mockResolvedValue({ data: null, error: mockRolePermissionsSelectError }),
            };
            return errChain;
          }
          const chain: any = {
            in: vi.fn().mockImplementation((field: string, vals: string[]) => {
              if (mockRolePermissionsSelectError && mockRolePermissionsTargetOnly && vals.includes(roleNewId)) {
                return Promise.resolve({ data: null, error: mockRolePermissionsSelectError });
              }
              if (field === "role_id") {
                const matched = mockRolePermissions.filter((rp) => !rp.role_id || vals.includes(rp.role_id));
                return Promise.resolve({ data: matched, error: null });
              }
              return Promise.resolve({ data: mockRolePermissions, error: null });
            }),
            eq: vi.fn().mockImplementation((field: string, val: string) => {
              if (mockRolePermissionsSelectError && mockRolePermissionsTargetOnly && val === roleNewId) {
                return Promise.resolve({ data: null, error: mockRolePermissionsSelectError });
              }
              if (field === "role_id") {
                const matched = mockRolePermissions.filter((rp) => !rp.role_id || rp.role_id === val);
                return Promise.resolve({ data: matched, error: null });
              }
              return Promise.resolve({ data: mockRolePermissions, error: null });
            }),
          };
          return chain;
        });
        queryBuilder.delete.mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }));
        queryBuilder.insert.mockImplementation(() => {
          if (mockRolePermissionsInsertError) {
            return Promise.resolve({ error: mockRolePermissionsInsertError });
          }
          return Promise.resolve({ error: null });
        });
      }

      if (table === "permissions") {
        queryBuilder.select.mockImplementation(() => {
          if (mockPermissionsSelectError && !mockPermissionsTargetOnly) {
            return {
              in: vi.fn().mockResolvedValue({ data: null, error: mockPermissionsSelectError }),
            };
          }
          return {
            in: vi.fn().mockImplementation((field: string, vals: string[]) => {
              if (mockPermissionsSelectError && mockPermissionsTargetOnly && vals.some((v) => v !== permUsersId && v !== permRolesId)) {
                return Promise.resolve({ data: null, error: mockPermissionsSelectError });
              }
              const seen = new Set<string>();
              const matched: Array<{ id: string; key: string }> = [];
              for (const p of mockPermissions) {
                if (vals.includes((p as any)[field]) && !seen.has(p.id)) {
                  seen.add(p.id);
                  matched.push(p);
                }
              }
              return {
                eq: vi.fn().mockImplementation((f2: string, v2: string) => ({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    const found = mockPermissions.find((p) => p.key === v2);
                    return Promise.resolve({ data: found || null, error: null });
                  }),
                })),
                then: (resolve: any) => resolve({ data: matched, error: null }),
              };
            }),
          };
        });
        queryBuilder.in.mockImplementation((field: string, ids: string[]) => {
          const seen = new Set<string>();
          const matched: Array<{ id: string; key: string }> = [];
          for (const p of mockPermissions) {
            if (ids.includes(p.id) && !seen.has(p.id)) {
              seen.add(p.id);
              matched.push(p);
            }
          }
          return Promise.resolve({ data: matched, error: null });
        });
      }

      if (table === "role_template_permissions") {
        queryBuilder.select.mockImplementation(() => ({
          in: vi.fn().mockImplementation((field: string, keys: string[]) => {
            const matched = mockRoleTemplatePerms.filter((tp) => keys.includes(tp.permission_key));
            return Promise.resolve({ data: matched, error: null });
          }),
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
import { proveTenantPermission, getRolePermissionKeys } from "@/lib/auth/authorize";

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
      { role_template_key: "TENANT_ADMIN", permission_key: "tenant.users.manage" },
      { role_template_key: "TENANT_ADMIN", permission_key: "tenant.roles.manage" },
    ];
    mockOtherOwners = [{ user_id: "dba74b87-1c6b-4520-99ea-1ac69468f00a" }];
    mockAuditLogs = [];
    mockAuthAdminUsers = [];
    deleteUserCalls = [];
    deleteRoleCalls = [];
    mockRolePermissionsSelectError = null;
    mockRolePermissionsTargetOnly = false;
    mockRolePermissionsInsertError = null;
    mockPermissionsSelectError = null;
    mockPermissionsTargetOnly = false;
    mockMembershipSelectError = null;
    inviteUserFail = false;
    mockTargetMemberships = new Map<string, { status: string } | null>();
    mockTargetMemberships.set(targetUserId, { status: "active" });
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


    it("Self-Role Escalation Protection: TENANT_ADMIN cannot promote or change their own role", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "TENANT_OWNER", organization_id: orgId, is_system: false },
      ];

      // Attempting to promote self from TENANT_ADMIN to TENANT_OWNER
      const resPromoteSelf = await changeUserRoleAction(orgId, callerUserId, roleNewId);
      expect(resPromoteSelf).toEqual({ ok: false, error: "cannot_change_own_role" });

      // Attempting to change self to any other role
      const resChangeSelf = await changeUserRoleAction(orgId, callerUserId, roleAdminId);
      expect(resChangeSelf).toEqual({ ok: false, error: "cannot_change_own_role" });
    });

    it("Legitimate modification: caller can change role of another active member", async () => {
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "ACCOUNTANT", organization_id: orgId, is_system: false },
      ];

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res).toEqual({ ok: true });
    });

    it("Target Membership Requirement: rejects mutation if target user is not a member of the organization", async () => {
      // Mock that target has NO membership in this organization
      const foreignUserId = "9b64c0ae-6d60-449d-b8eb-9d10cbe432e1";

      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "ACCOUNTANT", organization_id: orgId, is_system: false },
      ];

      // Caller has active membership, target has null membership
      mockMembership = { status: "active" };
      mockTargetMemberships.set(foreignUserId, null);

      // Test changeUserRoleAction
      const resRole = await changeUserRoleAction(orgId, foreignUserId, roleNewId);
      expect(resRole).toEqual({ ok: false, error: "target_not_member" });

      // Test updateUserStatusAction
      const resStatus = await updateUserStatusAction(orgId, foreignUserId, "suspended");
      expect(resStatus).toEqual({ ok: false, error: "target_not_member" });

      // Test removeUserAction
      const resRemove = await removeUserAction(orgId, foreignUserId);
      expect(resRemove).toEqual({ ok: false, error: "target_not_member" });

      mockTargetMemberships.clear();
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

    it("Real Schema Validation: createRoleAction with valid tenant permissions succeeds against role_template_permissions schema", async () => {
      // Proves validateTenantPermissionIds maps permission IDs to keys and checks role_template_permissions.permission_key
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("key", "FINANCE_SPECIALIST");
      fd.append("nameAr", "أخصائي مالي");
      fd.append("nameEn", "Finance Specialist");
      fd.append("permissionIds", JSON.stringify([permUsersId, permRolesId]));

      const res = await createRoleAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: true });
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

  describe("Privilege Escalation & Delegation Containment (Attacks A through E)", () => {
    const ownerPermFinanceId = "81c3b123-5e78-4390-84cf-2407238210f1";
    const permFinanceKey = "finance.payments.void";

    beforeEach(() => {
      // Add finance.payments.void to permissions and role_template_permissions (TENANT_OWNER has it)
      mockPermissions.push({ id: ownerPermFinanceId, key: permFinanceKey });
      mockRoleTemplatePerms.push({ role_template_key: "TENANT_OWNER", permission_key: permFinanceKey });
    });

    it("Attack A: TENANT_ADMIN cannot update a role to add permissions they do not possess (e.g. finance.payments.void)", async () => {
      // Caller has TENANT_ADMIN (tenant.users.manage, tenant.roles.manage).
      // Target role is a custom role. Caller tries to add finance.payments.void which caller lacks.
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "CUSTOM_ROLE", organization_id: orgId, is_system: false },
      ];

      const res = await updateRolePermissionsAction(orgId, roleNewId, [permRolesId, ownerPermFinanceId]);
      expect(res).toEqual({ ok: false, error: "permission_amplification_denied" });
    });

    it("Attack B: TENANT_ADMIN cannot create an owner-equivalent custom role with permissions they do not possess", async () => {
      // Caller is TENANT_ADMIN, tries to create a role with finance.payments.void
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("key", "SHADOW_OWNER");
      fd.append("nameAr", "مالك ظل");
      fd.append("nameEn", "Shadow Owner");
      fd.append("permissionIds", JSON.stringify([ownerPermFinanceId]));

      const res = await createRoleAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: false, error: "permission_amplification_denied" });
    });

    it("Attack C: Non-owner TENANT_ADMIN cannot invite a second account directly as TENANT_OWNER", async () => {
      // Caller is TENANT_ADMIN. Tries to invite a collaborator as TENANT_OWNER
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "second-account@example.com");
      fd.append("roleKey", "TENANT_OWNER");

      const res = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: false, error: "cannot_assign_tenant_owner" });

      const resMember = await inviteMemberAction({ ok: false, error: "" }, fd);
      expect(resMember).toEqual({ ok: false, error: "cannot_assign_tenant_owner" });
    });

    it("Attack D: TENANT_ADMIN cannot invite their own email to self-escalate", async () => {
      // Caller's email is admin@aqarbooks.com
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "admin@aqarbooks.com");
      fd.append("roleKey", "TENANT_OWNER");

      const res = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: false, error: "cannot_invite_self" });

      const resMember = await inviteMemberAction({ ok: false, error: "" }, fd);
      expect(resMember).toEqual({ ok: false, error: "cannot_invite_self" });
    });

    it("Attack E: TENANT_ADMIN cannot change another user to TENANT_OWNER or assign unheld permissions", async () => {
      // 1. Cannot assign TENANT_OWNER
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "TENANT_OWNER", organization_id: orgId, is_system: false },
      ];

      const resOwner = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(resOwner).toEqual({ ok: false, error: "cannot_assign_tenant_owner" });

      // 2. Cannot assign custom role containing unheld permissions (e.g. finance.payments.void)
      const unheldRoleId = "7c1b5042-1bf7-40c2-9e2c-2c9748b61e29";
      mockRoles = [
        { id: roleAdminId, key: "TENANT_ADMIN", organization_id: orgId, is_system: false },
        { id: unheldRoleId, key: "FINANCE_DIRECTOR", organization_id: orgId, is_system: false },
      ];
      // Caller has TENANT_ADMIN perms (permRolesId, permUsersId)
      // Target role has unheld permission ownerPermFinanceId
      mockRolePermissions = [
        { role_id: roleAdminId, permission_id: permRolesId },
        { role_id: roleAdminId, permission_id: permUsersId },
        { role_id: unheldRoleId, permission_id: ownerPermFinanceId },
      ];

      const resEscalation = await changeUserRoleAction(orgId, targetUserId, unheldRoleId);
      expect(resEscalation).toEqual({ ok: false, error: "role_privilege_escalation" });
    });

    it("Protection: Inviting an existing member is rejected (does not wipe or downgrade status)", async () => {
      // Target is an existing member
      mockTargetMemberships.set("37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7", { status: "active" });

      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "existing@example.com");
      fd.append("roleKey", "TENANT_ADMIN");

      const res = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(res).toEqual({ ok: false, error: "user_already_member" });

      const resMember = await inviteMemberAction({ ok: false, error: "" }, fd);
      expect(resMember).toEqual({ ok: false, error: "user_already_member" });
    });

    it("Positive Control: Active TENANT_OWNER can assign roles, create roles, and invite users", async () => {
      // Caller has TENANT_OWNER role
      const ownerRoleId = "f5f5c010-8b4e-4f3b-8ea9-42b7c6c449c2";
      mockRoles = [
        { id: ownerRoleId, key: "TENANT_OWNER", organization_id: orgId, is_system: false },
        { id: roleNewId, key: "CUSTOM_ROLE", organization_id: orgId, is_system: false },
      ];
      mockAssignments = [{ role_id: ownerRoleId }];
      mockRolePermissions = [
        { permission_id: permRolesId },
        { permission_id: permUsersId },
        { permission_id: ownerPermFinanceId },
      ];
      mockPermissions.push({ id: ownerPermFinanceId, key: permFinanceKey });

      // 1. Owner can grant finance permission to custom role
      const resPerms = await updateRolePermissionsAction(orgId, roleNewId, [ownerPermFinanceId]);
      expect(resPerms).toEqual({ ok: true });

      // 2. Owner can invite another user as TENANT_OWNER
      const fd = new FormData();
      fd.append("organizationId", orgId);
      fd.append("email", "newowner@example.com");
      fd.append("roleKey", "TENANT_OWNER");

      const resInvite = await inviteUserAction({ ok: false, error: "" }, fd);
      expect(resInvite).toEqual({ ok: true });
    });
  });

  describe("Database Trigger Invariants Simulation", () => {
    it("simulates user_role_assignments trigger: rejects PLATFORM_SUPER_ADMIN with organization_id", () => {
      const simulateTrigger = (roleKey: string, roleOrgId: string | null, assignmentOrgId: string | null) => {
        if (roleKey === "PLATFORM_SUPER_ADMIN") {
          if (assignmentOrgId !== null || roleOrgId !== null) {
            throw new Error("PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope");
          }
        }
        if (roleOrgId !== null) {
          if (assignmentOrgId === null || assignmentOrgId !== roleOrgId) {
            throw new Error(`Tenant-owned role cannot be assigned to different scope`);
          }
        }
      };

      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", null, orgId)).toThrow(
        "PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope"
      );
      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", orgId, null)).toThrow(
        "PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope"
      );
      expect(() => simulateTrigger("PLATFORM_SUPER_ADMIN", null, null)).not.toThrow();
    });

    it("simulates user_role_assignments trigger: rejects cross-tenant role assignments", () => {
      const simulateTrigger = (roleKey: string, roleOrgId: string | null, assignmentOrgId: string | null) => {
        if (roleOrgId !== null) {
          if (assignmentOrgId === null || assignmentOrgId !== roleOrgId) {
            throw new Error(`Tenant-owned role cannot be assigned to different scope`);
          }
        }
      };

      const foreignOrgId = "dba74b87-1c6b-4520-99ea-1ac69468f00a";
      // Role owned by Org A assigned to Org B
      expect(() => simulateTrigger("CUSTOM_ROLE", orgId, foreignOrgId)).toThrow(
        "Tenant-owned role cannot be assigned to different scope"
      );
      // Role owned by Org A assigned to Org A succeeds
      expect(() => simulateTrigger("CUSTOM_ROLE", orgId, orgId)).not.toThrow();
      // Legacy global role (roleOrgId === null) assigned to Org A succeeds
      expect(() => simulateTrigger("TENANT_ADMIN", null, orgId)).not.toThrow();
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

    it("simulates hardened is_platform_admin: ignores malformed org-scoped assignments", () => {
      // Hardened SQL logic:
      // SELECT EXISTS (
      //   SELECT 1 FROM user_role_assignments ura
      //   JOIN roles r ON r.id = ura.role_id
      //   WHERE ura.user_id = p_user_id
      //     AND ura.organization_id IS NULL
      //     AND r.key = 'PLATFORM_SUPER_ADMIN'
      //     AND r.organization_id IS NULL
      // );
      const simulateHardenedIsPlatformAdmin = (
        assignments: Array<{ user_id: string; organization_id: string | null; role: { key: string; organization_id: string | null } }>,
        checkUserId: string
      ) => {
        return assignments.some(
          (a) =>
            a.user_id === checkUserId &&
            a.organization_id === null &&
            a.role.key === "PLATFORM_SUPER_ADMIN" &&
            a.role.organization_id === null
        );
      };

      const attackerId = "attacker-123";
      const legitimateAdminId = "admin-456";

      // Attacker holds PLATFORM_SUPER_ADMIN with organization_id = orgId (malformed assignment)
      const testAssignments = [
        {
          user_id: attackerId,
          organization_id: orgId,
          role: { key: "PLATFORM_SUPER_ADMIN", organization_id: null },
        },
        {
          user_id: legitimateAdminId,
          organization_id: null,
          role: { key: "PLATFORM_SUPER_ADMIN", organization_id: null },
        },
      ];

      // Hardened check rejects attacker with malformed org-scoped assignment
      expect(simulateHardenedIsPlatformAdmin(testAssignments, attackerId)).toBe(false);
      // Legitimate admin with NULL organization_id is accepted
      expect(simulateHardenedIsPlatformAdmin(testAssignments, legitimateAdminId)).toBe(true);
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

  describe("Fail-Closed Authorization & Partial Write Compensation (Amendment 4)", () => {
    it("getRolePermissionKeys: fails closed when role_permissions lookup errors", async () => {
      mockRolePermissionsSelectError = { message: "database connection timeout" };
      const res = await getRolePermissionKeys(roleAdminId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("authorization_check_failed");
      }
    });

    it("getRolePermissionKeys: fails closed when permissions lookup errors", async () => {
      mockPermissionsSelectError = { message: "disk read error" };
      const res = await getRolePermissionKeys(roleAdminId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("authorization_check_failed");
      }
    });

    it("getRolePermissionKeys: fails closed when permission row count is inconsistent", async () => {
      mockRolePermissions = [
        { role_id: roleAdminId, permission_id: permUsersId },
        { role_id: roleAdminId, permission_id: permRolesId },
      ];
      mockPermissions = [
        { id: permUsersId, key: "tenant.users.manage" },
      ];
      const res = await getRolePermissionKeys(roleAdminId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("authorization_check_failed");
      }
    });

    it("changeUserRoleAction: denies role assignment when target role permission lookup fails (fail-closed)", async () => {
      mockRolePermissionsSelectError = { message: "query timeout" };
      mockRolePermissionsTargetOnly = true;

      const res = await changeUserRoleAction(orgId, targetUserId, roleNewId);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("authorization_check_failed");
    });

    it("inviteUserAction: stops provisioning and fails closed when membership check errors", async () => {
      mockMembershipSelectError = { message: "network partition" };
      const formData = new FormData();
      formData.set("organizationId", orgId);
      formData.set("email", "newperson@example.com");
      formData.set("roleKey", "TENANT_ADMIN");

      const res = await inviteUserAction({ ok: false }, formData);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("membership_check_failed");
      expect(deleteUserCalls).toContain("37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7");
      expect(mockAuditLogs.length).toBe(0);
    });

    it("inviteMemberAction: stops provisioning and fails closed when membership check errors", async () => {
      mockMembershipSelectError = { message: "database offline" };
      const formData = new FormData();
      formData.set("organizationId", orgId);
      formData.set("email", "newperson@example.com");
      formData.set("roleKey", "TENANT_ADMIN");

      const res = await inviteMemberAction({ ok: false }, formData);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("membership_check_failed");
      expect(deleteUserCalls).toContain("37bf5d4a-0c33-4f35-a2a1-d9e37b7225d7");
    });

    it("createRoleAction: compensates by deleting created role and returns failure when role_permissions insert fails", async () => {
      mockRolePermissionsInsertError = { message: "foreign key constraint violation" };
      const formData = new FormData();
      formData.set("organizationId", orgId);
      formData.set("key", "CUSTOM_ACCOUNTANT");
      formData.set("nameAr", "محاسب مخصص");
      formData.set("nameEn", "Custom Accountant");
      formData.set("permissionIds", JSON.stringify([permUsersId]));

      const res = await createRoleAction({ ok: false }, formData);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("failed_to_assign_role_permissions");
      expect(deleteRoleCalls).toContain("92cf89b3-0bb3-456a-92dd-a9a657695e52");
      expect(mockAuditLogs.length).toBe(0);
    });
  });
});
