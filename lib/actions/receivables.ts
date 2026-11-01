"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { dbErrorCode } from "@/lib/actions/db-error-code";

const createDueTypeSchema = z.object({
  organizationId: z.string().uuid(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  defaultRevenueAccountId: z.string().uuid(),
});

export async function createDueTypeAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createDueTypeSchema.safeParse({
    organizationId: formData.get("organizationId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    defaultRevenueAccountId: formData.get("defaultRevenueAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("due_types").insert({
    organization_id: parsed.data.organizationId,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
    default_revenue_account_id: parsed.data.defaultRevenueAccountId,
  });

  if (error) return { ok: false, error: dbErrorCode(error.message) };
  revalidatePath("/[locale]/finance/dues", "page");
  return { ok: true };
}

const issueDueSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  unitId: z.string().uuid(),
  dueTypeId: z.string().uuid(),
  receivableAccountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  description: z.string().max(500).optional(),
  fiscalPeriodId: z.string().uuid(),
});

/** Carried on a SUCCESSFUL issue when a secondary step failed: the due exists, only the optional default was not saved. */
export type IssueDueData = {
  /** ISSUED: a new due was created and posted. ALREADY_EXISTS: an identical due was already there, nothing was created. */
  outcome?: "ISSUED" | "ALREADY_EXISTS";
  warning?: "DEFAULT_NOT_SAVED";
  detail?: string;
};

export async function issueDueAction(
  _prevState: ActionResult<IssueDueData>,
  formData: FormData,
): Promise<ActionResult<IssueDueData>> {
  const supabase = await createClient();
  // The receivable account must be chosen (or come from the organization's approved setting, which the form
  // preselects). It is never inferred here: this action used to fall back to the due type's REVENUE account and
  // then to the first ASSET account it found.
  const receivableAccountId = formData.get("receivableAccountId") as string;
  const orgId = formData.get("organizationId") as string;
  const dueTypeId = formData.get("dueTypeId") as string;
  if (!receivableAccountId || !z.string().uuid().safeParse(receivableAccountId).success) {
    return { ok: false, error: "RECEIVABLE_ACCOUNT_REQUIRED" };
  }

  const parsed = issueDueSchema.safeParse({
    organizationId: orgId,
    resortId: formData.get("resortId"),
    unitId: formData.get("unitId"),
    dueTypeId: dueTypeId,
    receivableAccountId: receivableAccountId,
    amount: formData.get("amount"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    description: formData.get("description") || undefined,
    fiscalPeriodId: formData.get("fiscalPeriodId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const { data: issueResult, error } = await supabase.rpc("issue_dues", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_unit_ids: [parsed.data.unitId],
    p_due_type_id: parsed.data.dueTypeId,
    p_receivable_account_id: parsed.data.receivableAccountId,
    p_amount: parsed.data.amount,
    p_issue_date: parsed.data.issueDate,
    p_due_date: parsed.data.dueDate,
    p_description: parsed.data.description ?? null,
  });

  if (error) return { ok: false, error: dbErrorCode(error.message) };

  // Optional: remember this choice as the property's approved receivable account (finance.accounts.manage only;
  // the database refuses everyone else and any account that is not an active postable asset of this organization).
  // The due is ALREADY issued and posted at this point. If only this optional step fails, the issue is reported as a
  // success with a separate warning (never as a failed issue - a retry of "issue" would only be skipped by the duplicate
  // guard and leave the user believing nothing happened). saveDefaultReceivableAccountAction retries just the setting.
  const counts = (issueResult ?? {}) as { issued_count?: number; skipped_count?: number };
  const outcome: IssueDueData["outcome"] = (counts.issued_count ?? 0) === 0 && (counts.skipped_count ?? 0) > 0 ? "ALREADY_EXISTS" : "ISSUED";
  let data: IssueDueData = { outcome };
  if (formData.get("saveAsDefault") === "true") {
    const saved = await supabase.rpc("set_default_receivable_account", {
      p_organization_id: parsed.data.organizationId,
      p_property_id: parsed.data.resortId,
      p_account_id: parsed.data.receivableAccountId,
    });
    if (saved.error) data = { ...data, warning: "DEFAULT_NOT_SAVED", detail: dbErrorCode(saved.error.message) };
  }

  revalidatePath("/[locale]/finance/dues", "page");
  revalidatePath("/[locale]/finance/einvoice", "page");
  return { ok: true, data };
}

/** Retry ONLY the "approve as default receivable account" step after an issue reported DEFAULT_NOT_SAVED. Issues nothing. */
export async function saveDefaultReceivableAccountAction(input: {
  organizationId: string;
  resortId: string;
  accountId: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ organizationId: z.string().uuid(), resortId: z.string().uuid(), accountId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_default_receivable_account", {
    p_organization_id: parsed.data.organizationId,
    p_property_id: parsed.data.resortId,
    p_account_id: parsed.data.accountId,
  });
  if (error) return { ok: false, error: dbErrorCode(error.message) };
  revalidatePath("/[locale]/finance/dues", "page");
  return { ok: true };
}

const allocationSchema = z.object({
  dueId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

const recordPaymentSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "ONLINE"]),
  paymentDate: z.string().min(1),
  depositAccountId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  allocations: z.array(allocationSchema),
});

export async function recordPaymentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let allocationsRaw: unknown = [];
  try {
    const raw = formData.get("allocations");
    if (raw) allocationsRaw = JSON.parse(String(raw));
  } catch {
    return { ok: false, error: "invalid_input" };
  }

  const parsed = recordPaymentSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    memberId: formData.get("memberId") || undefined,
    unitId: formData.get("unitId") || undefined,
    amount: formData.get("amount"),
    method: formData.get("method") || "CASH",
    paymentDate: formData.get("paymentDate"),
    depositAccountId: formData.get("depositAccountId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    allocations: Array.isArray(allocationsRaw) ? allocationsRaw : [],
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const mappedAllocations = parsed.data.allocations.map((a) => ({
    due_id: a.dueId,
    amount: a.amount,
  }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_member_id: parsed.data.memberId ?? null,
    p_unit_id: parsed.data.unitId ?? null,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_payment_date: parsed.data.paymentDate,
    p_deposit_account_id: parsed.data.depositAccountId,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_allocations: mappedAllocations,
    p_idempotency_key: randomUUID(),
  });

  if (error) return { ok: false, error: dbErrorCode(error.message) };
  revalidatePath("/[locale]/finance/payments", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  return { ok: true };
}

const voidPaymentSchema = z.object({
  organizationId: z.string().uuid(),
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export async function voidPaymentAction(input: {
  organizationId: string;
  paymentId: string;
  reason: string;
}): Promise<ActionResult<{ reversalJournalEntryId?: string }>> {
  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_payment", {
    p_organization_id: parsed.data.organizationId,
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
    p_ip_address: null,
    p_user_agent: null,
  });
  if (error) return { ok: false, error: dbErrorCode(error.message) };

  revalidatePath("/[locale]/finance/payments", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  revalidatePath("/[locale]/property", "page");
  return {
    ok: true,
    data: { reversalJournalEntryId: (data as { reversal_journal_entry_id?: string } | null)?.reversal_journal_entry_id },
  };
}

const issueCreditNoteSchema = z.object({
  dueId: z.string().uuid(),
  grossAmount: z.coerce.number().positive(),
  reason: z.string().min(1).max(500),
  creditDate: z.string().min(1),
});

export async function issueCreditNoteAction(
  _prevState: ActionResult<{ creditNoteId?: string }>,
  formData: FormData,
): Promise<ActionResult<{ creditNoteId?: string }>> {
  const parsed = issueCreditNoteSchema.safeParse({
    dueId: formData.get("dueId"),
    grossAmount: formData.get("grossAmount"),
    reason: formData.get("reason"),
    creditDate: formData.get("creditDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_credit_note", {
    p_due_id: parsed.data.dueId,
    p_gross_amount: parsed.data.grossAmount,
    p_reason: parsed.data.reason,
    p_credit_date: parsed.data.creditDate,
  });

  if (error) return { ok: false, error: dbErrorCode(error.message) };
  revalidatePath("/[locale]/finance/credit-notes", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  return { ok: true, data: { creditNoteId: data } };
}
