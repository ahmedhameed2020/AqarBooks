"use server";

// Server actions for customer advances. They run with the SIGNED-IN USER's session (createClient from lib/supabase/server), so
// every permission check inside the database functions stays in force (receivables.payments.create,
// receivables.allocations.manage, finance.accounts.manage); no service-role client is imported here.
//
// IDEMPOTENCY: these actions never generate a key. The caller passes `operationKey` (a UUID created once per operation by
// lib/finance/operation-key.ts), the action forwards it unchanged, and the database answers a retry of the same request with the
// original result. A new operation = a new key chosen by the caller; the same key with different content is refused.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import {
  advanceAccountInput,
  advanceErrorCode,
  applyCreditInput,
  recordAdvanceInput,
  reverseApplicationInput,
} from "@/lib/finance/customer-advances";

const money = (n: number) => Math.round(n * 10_000) / 10_000;

function refresh() {
  revalidatePath("/[locale]/finance/payments", "page");
  revalidatePath("/[locale]/finance/dues", "page");
  revalidatePath("/[locale]/property", "page");
  revalidatePath("/[locale]/portal", "layout");
}

function fail(error: { message?: string | null; code?: string | null } | null | undefined): { ok: false; error: string } {
  const code = advanceErrorCode(error);
  // only the stable code is logged: never the database text, which can carry identifiers
  console.error("[customer-advances] rejected:", code, error?.code ?? "");
  return { ok: false, error: code };
}

type Json = Record<string, unknown> | null;

export async function recordAdvancePaymentAction(input: unknown): Promise<ActionResult<{ paymentId: string; allocatedAmount: number; advanceAmount: number; replay: boolean }>> {
  const parsed = recordAdvanceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_advance_payment", {
      p_organization_id: v.organizationId,
      p_resort_id: v.resortId,
      p_member_id: v.memberId,
      p_unit_id: v.unitId,
      p_amount: money(v.amount),
      p_method: v.method,
      p_payment_date: v.paymentDate,
      p_deposit_account_id: v.depositAccountId,
      p_fiscal_period_id: v.fiscalPeriodId,
      p_allocations: v.allocations.map((a) => ({ due_id: a.dueId, amount: money(a.amount) })),
      p_idempotency_key: v.operationKey,
      p_cashier_session_id: v.cashierSessionId ?? null,
    });
    if (error) return fail(error);
    const r = data as Json;
    refresh();
    return {
      ok: true,
      data: {
        paymentId: String(r?.payment_id ?? ""),
        allocatedAmount: Number(r?.allocated_amount ?? 0),
        advanceAmount: Number(r?.advance_amount ?? 0),
        replay: Boolean(r?.replay),
      },
    };
  } catch {
    return { ok: false, error: "unexpected" };
  }
}

export async function applyPaymentCreditAction(
  input: unknown,
): Promise<ActionResult<{ appliedTotal: number; remaining: number; allocationIds: string[]; replay: boolean }>> {
  const parsed = applyCreditInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("apply_payment_credit", {
      p_organization_id: v.organizationId,
      p_payment_id: v.paymentId,
      p_allocations: v.allocations.map((a) => ({ due_id: a.dueId, amount: money(a.amount) })),
      p_application_date: v.applicationDate,
      p_fiscal_period_id: v.fiscalPeriodId,
      p_idempotency_key: v.operationKey,
    });
    if (error) return fail(error);
    const r = data as Json;
    refresh();
    return {
      ok: true,
      data: {
        appliedTotal: Number(r?.applied_total ?? 0),
        remaining: Number(r?.remaining ?? 0),
        allocationIds: ((r?.allocations as { allocation_id: string }[] | undefined) ?? []).map((a) => a.allocation_id),
        replay: Boolean(r?.replay),
      },
    };
  } catch {
    return { ok: false, error: "unexpected" };
  }
}

export async function reverseCreditApplicationAction(
  input: unknown,
): Promise<ActionResult<{ remaining: number; reversalJournalEntryId: string; replay: boolean }>> {
  const parsed = reverseApplicationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reverse_credit_application", {
      p_organization_id: v.organizationId,
      p_allocation_id: v.allocationId,
      p_reason: v.reason,
      p_reversal_date: v.reversalDate,
      p_fiscal_period_id: v.fiscalPeriodId,
      p_idempotency_key: v.operationKey,
    });
    if (error) return fail(error);
    const r = data as Json;
    refresh();
    return {
      ok: true,
      data: {
        remaining: Number(r?.remaining ?? 0),
        reversalJournalEntryId: String(r?.reversal_journal_entry_id ?? ""),
        replay: Boolean(r?.replay),
      },
    };
  } catch {
    return { ok: false, error: "unexpected" };
  }
}

/** Approve the liability account used for NEW advance receipts of a site (receipts already recorded keep their own account). */
export async function setCustomerAdvanceAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = advanceAccountInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_default_customer_advance_account", {
      p_organization_id: parsed.data.organizationId,
      p_property_id: parsed.data.resortId,
      p_account_id: parsed.data.accountId,
    });
    if (error) return fail(error);
    revalidatePath("/[locale]/finance/payments", "page");
    return { ok: true };
  } catch {
    return { ok: false, error: "unexpected" };
  }
}
