import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getPrimaryOrganization(userId: string) {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug, status, default_currency")
    .eq("id", membership.organization_id)
    .single();

  return organization;
}
