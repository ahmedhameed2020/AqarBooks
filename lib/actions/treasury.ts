"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const createCashboxSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  name: z.string().min(1).max(200),
  glAccountId: z.string().uuid(),
});

export async function createCashboxAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createCashboxSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    name: formData.get("name"),
    glAccountId: formData.get("glAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("cashboxes").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    name: parsed.data.name,
    gl_account_id: parsed.data.glAccountId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/cashier", "page");
  return { ok: true };
}

const openSessionSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  cashboxId: z.string().uuid(),
  openingBalance: z.coerce.number().nonnegative().default(0),
});

export async function openCashierSessionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = openSessionSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    cashboxId: formData.get("cashboxId"),
    openingBalance: formData.get("openingBalance") || 0,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cashier_session", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_cashbox_id: parsed.data.cashboxId,
    p_opening_balance: parsed.data.openingBalance,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/cashier", "page");
  return { ok: true };
}

const closeSessionSchema = z.object({
  sessionId: z.string().uuid(),
  actualClosingBalance: z.coerce.number(),
});

export async function closeCashierSessionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = closeSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    actualClosingBalance: formData.get("actualClosingBalance"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cashier_session", {
    p_session_id: parsed.data.sessionId,
    p_actual_closing_balance: parsed.data.actualClosingBalance,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/cashier", "page");
  return { ok: true };
}

const payFromSessionSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  sessionId: z.string().uuid(),
  unitId: z.string().uuid().nullish(),
  depositAccountId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1),
  dueId: z.string().uuid(),
});

export async function payDueFromCashierAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = payFromSessionSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    sessionId: formData.get("sessionId"),
    unitId: formData.get("unitId") || undefined,
    depositAccountId: formData.get("depositAccountId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
    dueId: formData.get("dueId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();

  let resolvedUnitId = parsed.data.unitId;
  if (!resolvedUnitId) {
    const { data: due } = await supabase
      .from("dues")
      .select("unit_id")
      .eq("id", parsed.data.dueId)
      .maybeSingle();
    resolvedUnitId = due?.unit_id || null;
  }

  const { data: paymentId, error } = await supabase.rpc("record_payment", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_member_id: null,
    p_unit_id: resolvedUnitId,
    p_amount: parsed.data.amount,
    p_method: "CASH",
    p_payment_date: parsed.data.paymentDate,
    p_deposit_account_id: parsed.data.depositAccountId,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_allocations: [{ due_id: parsed.data.dueId, amount: parsed.data.amount }],
    p_idempotency_key: randomUUID(),
    p_cashier_session_id: parsed.data.sessionId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/cashier", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  revalidatePath("/[locale]/finance/payments", "page");
  revalidatePath("/ar/finance/cashier", "page");
  revalidatePath("/en/finance/cashier", "page");
  return { ok: true, data: { paymentId } };
}

const createBankAccountSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  bankId: z.string().uuid(),
  accountName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(60),
  glAccountId: z.string().uuid(),
});

export async function createBankAccountAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createBankAccountSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    bankId: formData.get("bankId"),
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    glAccountId: formData.get("glAccountId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    bank_id: parsed.data.bankId,
    account_name: parsed.data.accountName,
    account_number: parsed.data.accountNumber,
    gl_account_id: parsed.data.glAccountId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/banks", "page");
  return { ok: true };
}

const createBankSchema = z.object({
  organizationId: z.string().uuid(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
});

export async function createBankAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createBankSchema.safeParse({
    organizationId: formData.get("organizationId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("banks").insert({
    organization_id: parsed.data.organizationId,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/banks", "page");
  return { ok: true };
}

const recordChequeSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  chequeNumber: z.string().min(1).max(60),
  amount: z.coerce.number().positive(),
  memberId: z.string().uuid().optional(),
  chequeDate: z.string().min(1),
  dueDate: z.string().min(1),
});

export async function recordIncomingChequeAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = recordChequeSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    bankAccountId: formData.get("bankAccountId"),
    chequeNumber: formData.get("chequeNumber"),
    amount: formData.get("amount"),
    memberId: formData.get("memberId") || undefined,
    chequeDate: formData.get("chequeDate"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_incoming_cheque", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_bank_account_id: parsed.data.bankAccountId,
    p_cheque_number: parsed.data.chequeNumber,
    p_amount: parsed.data.amount,
    p_member_id: parsed.data.memberId ?? null,
    p_cheque_date: parsed.data.chequeDate,
    p_due_date: parsed.data.dueDate,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/banks", "page");
  return { ok: true };
}

const setChequeStatusSchema = z.object({
  chequeId: z.string().uuid(),
  status: z.enum(["DRAFT", "ISSUED", "RECEIVED", "DEPOSITED", "CLEARED", "RETURNED", "CANCELLED"]),
  note: z.string().max(500).optional(),
});

export async function setChequeStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = setChequeStatusSchema.safeParse({
    chequeId: formData.get("chequeId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_cheque_status", {
    p_cheque_id: parsed.data.chequeId,
    p_new_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/banks", "page");
  return { ok: true };
}

const clearChequeSchema = z.object({
  chequeId: z.string().uuid(),
  clearingDate: z.string().min(1),
  fiscalPeriodId: z.string().uuid(),
  dueId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export async function clearIncomingChequeAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = clearChequeSchema.safeParse({
    chequeId: formData.get("chequeId"),
    clearingDate: formData.get("clearingDate"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    dueId: formData.get("dueId"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_incoming_cheque", {
    p_cheque_id: parsed.data.chequeId,
    p_clearing_date: parsed.data.clearingDate,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_allocations: [{ due_id: parsed.data.dueId, amount: parsed.data.amount }],
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/banks", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  return { ok: true };
}
