import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function isPlatformAdmin(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin", {
    p_user_id: userId,
  });
  if (error) return false;
  return Boolean(data);
}
