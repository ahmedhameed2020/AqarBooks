import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AccountClient } from "./account-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "إدارة الحساب الشخصي والأمان — AqarBooks"
      : "User Account & Security Settings — AqarBooks",
    description: isAr
      ? "إدارة الملف الشخصي، كلمة المرور، أمان الجلسات، وتفضيلات الإشعارات والتنبيهات."
      : "Manage your personal profile, security credentials, active sessions, and notification preferences.",
  };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: locale as Locale });
  }

  const [platformAdmin, organization] = await Promise.all([
    isPlatformAdmin(user!.id),
    getPrimaryOrganization(user!.id),
  ]);

  const supabase = await createClient();

  // Fetch user profile from database
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, locale")
    .eq("id", user!.id)
    .maybeSingle();

  // Fetch user role in the organization if available
  let userRole = isAr ? "عضو معتمد" : "Member";
  if (organization) {
    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("status")
      .eq("organization_id", organization.id)
      .eq("user_id", user!.id)
      .maybeSingle();

    if (membership?.status === "active") {
      userRole = isAr ? "مدير المنشأة / مالك" : "Organization Owner";
    }
  }

  return (
    <AccountClient
      user={{
        id: user!.id,
        email: user!.email ?? "",
        created_at: user!.created_at,
        last_sign_in_at: user!.last_sign_in_at,
        user_metadata: (user!.user_metadata as Record<string, any>) ?? {},
      }}
      profile={profile}
      organizationName={organization?.name || (isAr ? "المنشأة الرئيسية" : "Main Organization")}
      userRole={userRole}
      isPlatformAdmin={platformAdmin}
      locale={locale}
    />
  );
}
