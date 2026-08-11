"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type UnitRow = Database["public"]["Views"]["units_with_financials"]["Row"];

// Mirrors (does not modify) the filter logic in property/page.tsx,
// unpaginated (capped at 5000) -- used only by the "export CSV" toolbar
// action so the export covers the full filtered result, not just the
// current page.
export async function exportUnitsCsvAction(filters: {
  resortId: string;
  q?: string;
  building?: string;
  zone?: string;
  type?: string;
  occupancy?: string;
  arrears?: string;
}): Promise<UnitRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return [];

  const supabase = await createClient();
  let query = supabase
    .from("units_with_financials")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("resort_id", filters.resortId);

  if (filters.q) {
    const term = filters.q.replace(/"/g, "");
    query = query.or(`code.ilike."%${term}%",owner_name.ilike."%${term}%"`);
  }
  if (filters.building) query = query.eq("building_id", filters.building);
  if (filters.zone) query = query.eq("zone_id", filters.zone);
  if (filters.type) query = query.eq("unit_type", filters.type as UnitRow["unit_type"]);
  if (filters.occupancy) query = query.eq("occupancy_status", filters.occupancy as UnitRow["occupancy_status"]);
  if (filters.arrears === "1") query = query.eq("has_arrears", true);

  const { data } = await query.order("code").limit(5000);
  return data ?? [];
}
