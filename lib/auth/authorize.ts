import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";

export async function requirePlatformAdmin(locale: Locale) {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }
  const admin = user && (await isPlatformAdmin(user.id));
  if (!admin) {
    redirect({ href: "/dashboard", locale });
  }
  return user!;
}

export async function hasPermission(
  organizationId: string,
  permissionKey: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("has_permission", {
    p_user_id: user.id,
    p_organization_id: organizationId,
    p_permission_key: permissionKey,
  });
  if (error) return false;
  return Boolean(data);
}
