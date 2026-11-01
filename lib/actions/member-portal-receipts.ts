"use server";

import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { loadOwnPosition } from "@/lib/portal/own-position";
import type { OwnPosition } from "@/lib/portal/statement-position";
import type { PaymentReceiptAllocation } from "@/lib/reports/payment-receipt-pdf";

export type OwnPaymentReceiptResult =
  | {
      ok: true;
      details: {
        receiptNo: string;
        paymentDate: string;
        amount: number;
        unallocatedAmount: number;
        advanceAmount: number;
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
    .select("id, receipt_no, receipt_number, payment_date, amount, unallocated_amount, advance_amount, method, memo, member_id")
    .eq("id", paymentId)
    .eq("member_id", member.id)
    .maybeSingle();
  if (paymentErr) {
    console.error("[getOwnPaymentReceiptAction] payment query failed:", paymentErr.message);
    return { ok: false, error: "query_failed" };
  }
  if (!payment) return { ok: false, error: "not_found" };

  // Allocations IN FORCE only (receipt allocations + credit applications not reversed): they are what the receipt's total allocated
  // is made of. A credit application that was reversed is not an allocation any more; it is listed separately, flagged, with its
  // reversal date, and left out of the total.
  const { data: effective, error: allocErr } = await supabase
    .from("effective_payment_allocations")
    .select("id, due_id, amount, applied_on, kind")
    .eq("payment_id", paymentId);
  if (allocErr) {
    console.error("[getOwnPaymentReceiptAction] allocations query failed:", allocErr.message);
    return { ok: false, error: "query_failed" };
  }
  const { data: appLines, error: appErr } = await supabase.rpc("own_credit_application_lines", { p_org: member.organization_id });
  if (appErr) console.error("[getOwnPaymentReceiptAction] credit application lines failed:", appErr.message);
  const reversed = (appLines ?? []).filter((a) => a.payment_id === paymentId && a.reversed_on);

  const dueIds = [...new Set([...(effective ?? []).map((a) => a.due_id), ...reversed.map((a) => a.due_id)])];
  const { data: dueRows } = dueIds.length
    ? await supabase.from("dues").select("id, due_date, units(code), due_types(name_ar, name_en)").in("id", dueIds)
    : { data: [] };
  const dueById = new Map(
    ((dueRows ?? []) as unknown as Array<{
      id: string;
      due_date: string | null;
      units: { code: string | null } | null;
      due_types: { name_ar: string | null; name_en: string | null } | null;
    }>).map((d) => [d.id, d]),
  );
  const line = (dueId: string, amount: number): PaymentReceiptAllocation => {
    const due = dueById.get(dueId);
    return {
      unitCode: due?.units?.code ?? "",
      description: (locale === "ar" ? due?.due_types?.name_ar : due?.due_types?.name_en) ?? "",
      dueDate: due?.due_date ?? "",
      allocatedAmount: Number(amount),
    };
  };
  const allocations: PaymentReceiptAllocation[] = [
    ...(effective ?? []).map((a) => ({ ...line(a.due_id, a.amount), appliedOn: a.applied_on, credit: a.kind === "CREDIT_APPLICATION" })),
    // reversed applications: shown for history, never summed (the PDF skips any line that has reversedOn)
    ...reversed.map((a) => ({ ...line(a.due_id, a.amount), appliedOn: a.applied_on, credit: true, reversedOn: a.reversed_on })),
  ];

  return {
    ok: true,
    details: {
      receiptNo: payment.receipt_no ?? (payment.receipt_number ? `REC-${payment.receipt_number}` : ""),
      paymentDate: payment.payment_date,
      amount: Number(payment.amount),
      unallocatedAmount: Number(payment.unallocated_amount ?? 0),
      advanceAmount: Number(payment.advance_amount ?? 0),
      memberName: member.full_name,
      method: payment.method,
      memo: payment.memo,
      allocations,
    },
  };
}

export type OwnPositionResult = { ok: true; position: OwnPosition } | { ok: false; error: string };

/** The signed-in owner's arrears, available credit and net as of a date (the end of the statement window). */
export async function getOwnPositionAsOfAction(asOf: string): Promise<OwnPositionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) return { ok: false, error: "invalid_date" };
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const position = await loadOwnPosition(supabase, ctx.member.organization_id, ctx.member.id, asOf);
  return position ? { ok: true, position } : { ok: false, error: "unexpected" };
}
