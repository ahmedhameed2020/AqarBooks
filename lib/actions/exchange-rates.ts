"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const PATH = "/[locale]/finance/exchange-rates";

/**
 * Authorization is the `exchange_rates_manage` RLS policy's. The rate's own
 * rules -- positive, three-letter ISO, not a currency against itself, one per
 * pair per day -- are database constraints, so calling this action directly
 * cannot get around them.
 */

const schema = z.object({
  organizationId: z.string().uuid(),
  // Uppercased here so "usd" and "USD" cannot become two different pairs; the
  // ISO check in the database only accepts uppercase.
  foreignCurrency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  baseCurrency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  rateDate: z.string().min(1),
  basePerUnit: z.coerce.number().positive(),
  source: z.string().max(200).optional(),
});

export async function recordExchangeRate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = schema.safeParse({
    organizationId: formData.get("organizationId"),
    foreignCurrency: formData.get("foreignCurrency"),
    baseCurrency: formData.get("baseCurrency"),
    rateDate: formData.get("rateDate"),
    basePerUnit: formData.get("basePerUnit"),
    source: (formData.get("source") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("exchange_rates").insert({
    organization_id: d.organizationId,
    foreign_currency: d.foreignCurrency,
    base_currency: d.baseCurrency,
    rate_date: d.rateDate,
    base_per_unit: d.basePerUnit,
    source: d.source ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
