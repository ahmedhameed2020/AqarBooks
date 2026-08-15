"use client";

import { useTransition } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generatePaymentReceiptPdf } from "@/lib/reports/payment-receipt-pdf";
import { getOwnPaymentReceiptAction } from "@/lib/actions/member-portal-receipts";

// Portal-side mirror of PrintReceiptRowButton
// (app/[locale]/(app)/finance/payments/print-receipt-button.tsx) -- fetches
// the member's own allocation details on click (via
// getOwnPaymentReceiptAction) before printing, same "never claim no
// allocations just because they weren't preloaded" reasoning.
export function PortalPrintReceiptButton({
  paymentId,
  locale,
  currency,
  organizationName,
}: {
  paymentId: string;
  locale: string;
  currency: string;
  organizationName: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await getOwnPaymentReceiptAction(paymentId);
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّر تحميل بيانات الإيصال" : "Could not load receipt data",
          type: "error",
        });
        return;
      }
      const win = generatePaymentReceiptPdf(
        {
          organizationName,
          resortName: "",
          currency,
          receiptNo: res.details.receiptNo,
          paymentDate: res.details.paymentDate,
          amount: res.details.amount,
          unallocatedAmount: res.details.unallocatedAmount,
          memberName: res.details.memberName,
          method: res.details.method,
          memo: res.details.memo,
          createdByName: null,
          allocations: res.details.allocations,
        },
        locale,
      );
      if (!win) {
        toast.add({
          title: isAr ? "المتصفح منع فتح نافذة الطباعة" : "The browser blocked the print window",
          description: isAr
            ? "اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة."
            : "Allow pop-ups for this site, then try again.",
          type: "warning",
        });
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick} className="gap-1.5">
      {pending ? <RefreshCw className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
      {isAr ? "طباعة الإيصال" : "Print receipt"}
    </Button>
  );
}
