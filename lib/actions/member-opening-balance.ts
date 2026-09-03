"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordOpeningBalance } from "@/lib/finance/opening-balance";
import type { ActionResult } from "@/lib/actions/platform";

const recordSchema = z.object({
  organizationId: z.string().uuid(),
  memberId: z.string().uuid(),
  unitId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receivableAccountId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

/**
 * Records an existing client's carried-in debt against one of their units.
 * Used from the member page for clients who were created before their
 * balance was known; the create-member flow does the same through
 * createMemberAction in one step.
 */
export async function recordMemberOpeningBalanceAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = recordSchema.safeParse({
    organizationId: formData.get("organizationId"),
    memberId: formData.get("memberId"),
    unitId: formData.get("unitId"),
    amount: formData.get("amount"),
    asOfDate: formData.get("asOfDate"),
    receivableAccountId: formData.get("receivableAccountId") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const result = await recordOpeningBalance(supabase, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/[locale]/members", "page");
  revalidatePath("/[locale]/members/[memberId]", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  revalidatePath("/[locale]/property", "page");
  return { ok: true, id: result.id };
}
