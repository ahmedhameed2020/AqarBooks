import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { RolesClient, type RoleItem, type PermissionItem } from "./roles-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "إدارة الأدوار وصلاحيات المستخدمين — عقار بوكس"
      : "Roles & Permissions Governance — AqarBooks",
    description: isAr
      ? "حوكمة صلاحيات الوصول، توزيع المهام الرقابية والمالية وفحص مصفوفة الأذونات المعتمدة."
      : "Manage authorization boundaries, internal controls, and user access privileges.",
  };
}

export default async function RolesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "tenant.roles.manage", locale);
  if (denied) return denied;

  const supabase = await createClient();

  // 1. Fetch organization roles and system roles
  const { data: rolesData } = await supabase
    .from("roles")
    .select("id, key, name_ar, name_en, is_system")
    .or(`organization_id.eq.${organization.id},organization_id.is.null`)
    .order("created_at", { ascending: true });

  const roleList = rolesData ?? [];
  const roleIds = roleList.map((r) => r.id);

  // 2. Fetch all permissions catalog
  const { data: allPermsData } = await supabase
    .from("permissions")
    .select("id, key, description")
    .order("key");

  const permissions: PermissionItem[] = (allPermsData ?? []).map((p) => ({
    id: p.id,
    key: p.key,
    description: p.description || p.key,
    module: p.key.split(".")[0] || "general",
  }));

  // 3. Fetch role_permissions grants
  const permissionsByRoleId = new Map<string, string[]>();
  if (roleIds.length) {
    const { data: rolePermissions } = await supabase
      .from("role_permissions")
      .select("role_id, permission_id")
      .in("role_id", roleIds);

    for (const rp of rolePermissions ?? []) {
      const list = permissionsByRoleId.get(rp.role_id) || [];
      list.push(rp.permission_id);
      permissionsByRoleId.set(rp.role_id, list);
    }
  }

  // 4. Fetch user assignments count per role
  const userCountByRole = new Map<string, number>();
  if (roleIds.length) {
    const { data: assignments } = await supabase
      .from("user_role_assignments")
      .select("role_id")
      .in("role_id", roleIds);

    for (const a of assignments ?? []) {
      userCountByRole.set(a.role_id, (userCountByRole.get(a.role_id) ?? 0) + 1);
    }
  }

  const roleItems: RoleItem[] = roleList.map((r) => ({
    id: r.id,
    key: r.key,
    name_ar: r.name_ar,
    name_en: r.name_en,
    is_system: r.is_system,
    permissionIds: permissionsByRoleId.get(r.id) || [],
    userCount: userCountByRole.get(r.id) || 0,
  }));

  return (
    <RolesClient
      roles={roleItems}
      allPermissions={permissions}
      organizationId={organization.id}
      organizationName={organization.name}
      taxId={organization.tax_id}
      locale={locale}
    />
  );
}
