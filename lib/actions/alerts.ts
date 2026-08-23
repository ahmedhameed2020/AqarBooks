"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";

export type AlertActionResult = { ok: true } | { ok: false; error: string };

/**
 * Silences one alert for the calling user only.
 *
 * The key carries the fact, not the alert type, so this is not "never show me
 * lease alerts again" -- it is "I have seen this lease, ending on this date".
 * Change the date and the alert returns, which is the behaviour someone
 * dismissing it actually wants.
 */
export async function dismissAlertAction(alertKey: string): Promise<AlertActionResult> {
  if (!z.string().min(1).max(200).safeParse(alertKey).success) {
    return { ok: false, error: "invalid_input" };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "no_organization" };

  const supabase = await createClient();
  const { error } = await supabase.from("alert_dismissals").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      alert_key: alertKey,
    },
    { onConflict: "user_id,alert_key" },
  );

  if (error) {
    console.error("[dismissAlertAction] failed:", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/notifications", "page");
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

/** Brings back every alert this user has silenced. */
export async function restoreAllAlertsAction(): Promise<AlertActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "no_organization" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("alert_dismissals")
    .delete()
    .eq("user_id", user.id)
    .eq("organization_id", organization.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/notifications", "page");
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

const settingsSchema = z.object({
  chequeLeadDays: z.number().int().min(1).max(180),
  leaseLeadDays: z.number().int().min(1).max(365),
  overdueMinDays: z.number().int().min(0).max(365),
  chequesEnabled: z.boolean(),
  leasesEnabled: z.boolean(),
  overdueEnabled: z.boolean(),
  unreachableOwnersEnabled: z.boolean(),
});

export type AlertSettingsInput = z.input<typeof settingsSchema>;

/**
 * Thresholds are per organization, not per user: "soon" for a cheque is a
 * property of how this business runs, and two people looking at the same
 * ledger should not disagree about what counts as urgent.
 *
 * Authorization is the alert_settings_manage RLS policy
 * (tenant.settings.manage); a denial surfaces here as a failed write rather
 * than a silent no-op.
 */
export async function saveAlertSettingsAction(
  input: AlertSettingsInput,
): Promise<AlertActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "no_organization" };

  const supabase = await createClient();
  const { error } = await supabase.from("alert_settings").upsert(
    {
      organization_id: organization.id,
      cheque_lead_days: parsed.data.chequeLeadDays,
      lease_lead_days: parsed.data.leaseLeadDays,
      overdue_min_days: parsed.data.overdueMinDays,
      cheques_enabled: parsed.data.chequesEnabled,
      leases_enabled: parsed.data.leasesEnabled,
      overdue_enabled: parsed.data.overdueEnabled,
      unreachable_owners_enabled: parsed.data.unreachableOwnersEnabled,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("[saveAlertSettingsAction] failed:", error.message);
    return { ok: false, error: "forbidden" };
  }

  revalidatePath("/[locale]/notifications", "page");
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}
