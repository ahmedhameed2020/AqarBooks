"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/commissions";

const brokerSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  brokerType: z.enum(["INTERNAL", "EXTERNAL"]),
  taxId: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  defaultWhtRate: z.coerce.number().min(0).max(100),
});

export async function createBroker(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = brokerSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    brokerType: formData.get("brokerType"),
    taxId: (formData.get("taxId") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    email: (formData.get("email") as string) || undefined,
    defaultWhtRate: formData.get("defaultWhtRate") || 0,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("brokers").insert({
    organization_id: d.organizationId,
    name: d.name,
    broker_type: d.brokerType,
    tax_id: d.taxId ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    default_wht_rate: d.defaultWhtRate,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate_broker" };
    return { ok: false, error: error.message };
  }
  revalidatePath(PATH, "page");
  return { ok: true };
}

const accrueSchema = z.object({
  organizationId: z.string().uuid(),
  brokerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  basisAmount: z.coerce.number().min(0),
  ratePercent: z.string().optional(),
  grossAmount: z.string().optional(),
  whtRate: z.string().optional(),
  whtAccountId: z.string().optional(),
  earnedDate: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function accrueCommissionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accrueSchema.safeParse({
    organizationId: formData.get("organizationId"),
    brokerId: formData.get("brokerId"),
    propertyId: formData.get("propertyId"),
    basisAmount: formData.get("basisAmount") || 0,
    ratePercent: (formData.get("ratePercent") as string) || undefined,
    grossAmount: (formData.get("grossAmount") as string) || undefined,
    whtRate: (formData.get("whtRate") as string) || undefined,
    whtAccountId: (formData.get("whtAccountId") as string) || undefined,
    earnedDate: formData.get("earnedDate"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const rate = d.ratePercent ? Number(d.ratePercent) : null;
  const gross = d.grossAmount ? Number(d.grossAmount) : null;
  // The database enforces this too, but saying it here avoids a round trip
  // to be told something the form already knows.
  if (rate === null && gross === null) return { ok: false, error: "amount_required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accrue_commission", {
    p_organization_id: d.organizationId,
    p_broker_id: d.brokerId,
    p_property_id: d.propertyId,
    p_source_type: "MANUAL",
    p_basis_amount: d.basisAmount,
    p_rate_percent: rate,
    p_gross_amount: gross,
    p_wht_rate: d.whtRate ? Number(d.whtRate) : null,
    p_wht_account_id: d.whtAccountId || null,
    p_earned_date: d.earnedDate,
    p_note: d.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function payCommissionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const commissionId = formData.get("commissionId");
  const cashAccountId = formData.get("cashAccountId");
  const paidDate = formData.get("paidDate");
  if (typeof commissionId !== "string" || typeof cashAccountId !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_commission", {
    p_commission_id: commissionId,
    p_cash_account_id: cashAccountId,
    p_paid_date: typeof paidDate === "string" && paidDate ? paidDate : undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH, "page");
  return { ok: true };
}
