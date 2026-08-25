"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const PATH = "/[locale]/admin/finance/accounting-accounts";

/**
 * These designate WHERE certain results land in the ledger. The RPCs behind
 * them re-check `finance.accounts.manage`, validate the account's category, and
 * write an audit row, so none of that is repeated here.
 *
 * Both pairs accept the SAME account for gain and loss on purpose: an
 * organisation that wants one net "differences" line sets both to it. Forcing
 * the split would be choosing an accounting policy on the customer's behalf.
 */

const pairSchema = z.object({
  organizationId: z.string().uuid(),
  // Empty string means "clear it", which is how a designation is removed.
  gainAccountId: z.string().uuid().or(z.literal("")).optional(),
  lossAccountId: z.string().uuid().or(z.literal("")).optional(),
});

function parsePair(formData: FormData) {
  return pairSchema.safeParse({
    organizationId: formData.get("organizationId"),
    gainAccountId: (formData.get("gainAccountId") as string) ?? "",
    lossAccountId: (formData.get("lossAccountId") as string) ?? "",
  });
}

export async function saveFxDifferenceAccounts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = parsePair(formData);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_fx_difference_accounts", {
    p_organization_id: parsed.data.organizationId,
    p_gain_account_id: parsed.data.gainAccountId || null,
    p_loss_account_id: parsed.data.lossAccountId || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function saveAssetDisposalAccounts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = parsePair(formData);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_asset_disposal_accounts", {
    p_organization_id: parsed.data.organizationId,
    p_gain_account_id: parsed.data.gainAccountId || null,
    p_loss_account_id: parsed.data.lossAccountId || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
