"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/einvoice";

// METADATA ONLY. No field here accepts a client secret, a certificate, or key
// material, and none is ever returned to the client. Credentials will arrive
// through a separate path that writes Vault secret ids, so that nothing
// security-critical passes through a form post or a server-action payload.
const profileSchema = z.object({
  organizationId: z.string().uuid(),
  jurisdiction: z.enum(["EG_ETA", "SA_ZATCA", "AE_PEPPOL"]),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  taxpayerId: z.string().max(50).optional(),
  branchCode: z.string().max(20).optional(),
  activityCode: z.string().max(20).optional(),
});

export async function saveEInvoiceProfile(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    organizationId: formData.get("organizationId"),
    jurisdiction: formData.get("jurisdiction"),
    environment: formData.get("environment"),
    taxpayerId: (formData.get("taxpayerId") as string) || undefined,
    branchCode: (formData.get("branchCode") as string) || undefined,
    activityCode: (formData.get("activityCode") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  // Authorization is the RPC's, not this action's: it re-checks
  // finance.einvoice.manage server-side, so a forged organizationId in the form
  // body cannot reach another tenant's settings.
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_einvoice_profile", {
    p_organization_id: d.organizationId,
    p_jurisdiction: d.jurisdiction,
    p_environment: d.environment,
    p_taxpayer_id: d.taxpayerId ?? null,
    p_branch_code: d.branchCode ?? null,
    p_activity_code: d.activityCode ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function setEInvoiceFilingEnabled(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profileId = formData.get("profileId");
  const enabled = formData.get("enabled") === "true";
  if (typeof profileId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_einvoice_profile_enabled", {
    p_profile_id: profileId,
    p_enabled: enabled,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
