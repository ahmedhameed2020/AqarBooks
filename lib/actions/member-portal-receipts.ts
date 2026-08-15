"use server";

import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { PaymentReceiptAllocation } from "@/lib/reports/payment-receipt-pdf";

export type OwnPaymentReceiptResult =
  | {
      ok: true;
      details: {
        receiptNo: string;
        paymentDate: string;
        amount: number;
        unallocatedAmount: number;
        memberName: string;
        method: string;
        memo: string | null;
        allocations: PaymentReceiptAllocation[];
      };
    }
  | { ok: false; error: string };

// Portal-scoped equivalent of getPaymentAllocationDetailsAction
// (lib/actions/receivables.ts) -- that one authorizes via
// finance.payments.read + org_id; this one authorizes via
// getPortalMemberContext() + an explicit member_id scope, defense-in-depth
// on top of payments_select_own / payment_allocations_select_own RLS
// (Task 10).
export async function getOwnPaymentReceiptAction(
  paymentId: string,
  locale: "ar" | "en",
): Promise<OwnPaymentReceiptResult> {
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") return { ok: false, error: "unauthenticated" };
  const { member } = ctx;

  const supabase = await createClient();

  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, receipt_no, receipt_number, payment_date, amount, unallocated_amount, method, memo, member_id")
    .eq("id", paymentId)
    .eq("member_id", member.id)
    .maybeSingle();
  if (paymentErr) {
    console.error("[getOwnPaymentReceiptAction] payment query failed:", paymentErr.message);
    return { ok: false, error: paymentErr.message };
  }
  if (!payment) return { ok: false, error: "not_found" };

  const { data: allocRows, error: allocErr } = await supabase
    .from("payment_allocations")
    .select("id, amount, dues(due_date, units(code), due_types(name_ar, name_en))")
    .eq("payment_id", paymentId);
  if (allocErr) {
    console.error("[getOwnPaymentReceiptAction] allocations query failed:", allocErr.message);
  }

  const allocations: PaymentReceiptAllocation[] = (allocRows ?? []).map((a: any) => ({
    unitCode: a.dues?.units?.code ?? "",
    description: (locale === "ar" ? a.dues?.due_types?.name_ar : a.dues?.due_types?.name_en) ?? "",
    dueDate: a.dues?.due_date ?? "",
    allocatedAmount: Number(a.amount),
  }));

  return {
    ok: true,
    details: {
      receiptNo: payment.receipt_no ?? (payment.receipt_number ? `REC-${payment.receipt_number}` : ""),
      paymentDate: payment.payment_date,
      amount: Number(payment.amount),
      unallocatedAmount: Number(payment.unallocated_amount ?? 0),
      memberName: member.full_name,
      method: payment.method,
      memo: payment.memo,
      allocations,
    },
  };
}
