"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute budget

// Polls the DB row's own status column -- never reads window.location or
// any redirect query parameter for anything beyond the transaction id
// already resolved server-side in page.tsx. Nothing here can flip `status`
// to "PAID" other than the DB read below reporting it -- there is no
// client-side success shortcut.
export function PaymentStatusPoller({
  transactionId,
  initialStatus,
  locale,
}: {
  transactionId: string;
  initialStatus: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [status, setStatus] = useState(initialStatus);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (status !== "PENDING" || pollCount >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("online_payment_transactions")
          .select("status")
          .eq("id", transactionId)
          .single();
        if (data) setStatus(data.status);
      } catch {
        // transient read failure -- still counts toward the poll budget
        // below, will retry on the next tick rather than freezing here
      } finally {
        setPollCount((n) => n + 1);
      }
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status, pollCount, transactionId]);

  if (status === "PAID") {
    return <div>{isAr ? "تم الدفع بنجاح" : "Payment successful"}</div>;
  }
  if (status === "FAILED" || status === "EXPIRED") {
    return (
      <div>
        {isAr ? "لم تكتمل عملية الدفع، يرجى المحاولة مرة أخرى" : "Payment did not complete, please try again"}
      </div>
    );
  }
  if (pollCount >= MAX_POLLS) {
    return (
      <div>
        {isAr
          ? "لا تزال المعاملة قيد المعالجة، يرجى مراجعة صفحة المدفوعات لاحقًا"
          : "Still processing, please check the payments page later"}
      </div>
    );
  }
  return <div>{isAr ? "جارٍ التحقق من حالة الدفع..." : "Checking payment status..."}</div>;
}
