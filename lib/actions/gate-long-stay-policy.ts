"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";

export async function saveGateLongStayPolicy(hours: number, enabled: boolean) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 168 || typeof enabled !== "boolean") return { ok: false };
  const user = await getCurrentUser();
  const org = user ? await getPrimaryOrganization(user.id) : null;
  if (!org || !(await hasPermission(org.id, "operations.gates.manage"))) return { ok: false };
  const db = await createClient();
  const { error } = await db.rpc("set_gate_long_stay_policy", {
    p_organization_id: org.id, p_threshold_hours: hours, p_notifications_enabled: enabled,
  });
  if (error) return { ok: false };
  revalidatePath("/[locale]/operations/gates", "page");
  revalidatePath("/[locale]/operations/gate/occupancy", "page");
  revalidatePath("/[locale]/operations/gates/long-stay-policy", "page");
  return { ok: true };
}
