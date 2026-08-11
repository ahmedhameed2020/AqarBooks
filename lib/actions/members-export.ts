"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type MemberRow = Database["public"]["Views"]["members_with_financials"]["Row"];

// Mirrors (does not modify) the filter logic in members/page.tsx, unpaginated
// (capped at 5000) -- used only by the "export CSV" toolbar action so the
// export covers the full filtered result, not just the current page.
export async function exportMembersCsvAction(filters: {
  q?: string;
  ownership?: string;
  arrears?: string;
}): Promise<MemberRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return [];

  const supabase = await createClient();
  let query = supabase.from("members_with_financials").select("*").eq("organization_id", organization.id);

  if (filters.q) {
    const term = filters.q.replace(/"/g, "");
    query = query.or(`full_name.ilike."%${term}%",phone.ilike."%${term}%",email.ilike."%${term}%"`);
  }
  if (filters.ownership === "owns") query = query.gt("units_count", 0);
  else if (filters.ownership === "none") query = query.eq("units_count", 0);
  if (filters.arrears === "1") query = query.eq("has_arrears", true);

  const { data } = await query.order("full_name").limit(5000);
  return data ?? [];
}
