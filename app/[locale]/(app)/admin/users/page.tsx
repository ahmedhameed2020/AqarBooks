import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";
import { UsersClient, type UserItem, type RoleOption } from "./users-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "إدارة فريق العمل والمستخدمين — عقار بوكس"
      : "Team Members & User Access — AqarBooks",
    description: isAr
      ? "إدارة مستخدمي المنشأة، توزيع الأدوار والصلاحيات، إرسال الدعوات والتحكم في تفعيل الحسابات."
      : "Manage team members, roles, invitations, and access privileges.",
  };
}

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const currentUser = await getCurrentUser();
  const organization = currentUser ? await getPrimaryOrganization(currentUser.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [
    { data: memberships },
    { data: rolesData },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id, user_id, status, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("roles")
      .select("id, key, name_ar, name_en")
      .or(`organization_id.eq.${organization.id},organization_id.is.null`)
      .order("name_en"),
    supabase
      .from("user_role_assignments")
      .select("user_id, role_id")
      .eq("organization_id", organization.id),
  ]);

  const roles: RoleOption[] = (rolesData ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name_ar: r.name_ar,
    name_en: r.name_en,
  }));

  const roleMap = new Map(roles.map((r) => [r.id, r]));

  const userRoleMap = new Map<string, RoleOption>();
  for (const a of assignments ?? []) {
    const r = roleMap.get(a.role_id);
    if (r) userRoleMap.set(a.user_id, r);
  }

  // Fetch emails and profile names
  const userIds = (memberships ?? []).map((m) => m.user_id);
  const emailMap = new Map<string, string>();
  const profileMap = new Map<string, { fullName: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id, { fullName: p.full_name });
    }

    await Promise.allSettled(
      userIds.map(async (uid) => {
        const { data } = await adminClient.auth.admin.getUserById(uid);
        if (data?.user?.email) {
          emailMap.set(uid, data.user.email);
        }
      })
    );
  }

  const userItems: UserItem[] = (memberships ?? []).map((m) => {
    const role = userRoleMap.get(m.user_id);
    const profile = profileMap.get(m.user_id);
    const email =
      emailMap.get(m.user_id) ||
      (currentUser?.id === m.user_id ? currentUser.email || "" : "") ||
      (isAr ? "مستخدم بدون بريد" : "No email registered");

    return {
      id: m.id,
      userId: m.user_id,
      email,
      fullName: profile?.fullName ?? null,
      status: (m.status as UserItem["status"]) || "active",
      roleId: role?.id ?? null,
      roleKey: role?.key ?? null,
      roleNameAr: role?.name_ar ?? null,
      roleNameEn: role?.name_en ?? null,
      createdAt: m.created_at,
      isCurrentUser: currentUser?.id === m.user_id,
    };
  });

  return (
    <UsersClient
      users={userItems}
      roles={roles}
      organizationId={organization.id}
      organizationName={organization.name}
      locale={locale}
    />
  );
}
