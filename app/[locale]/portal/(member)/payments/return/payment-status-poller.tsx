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
}: {
  transactionId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (status !== "PENDING" || pollCount >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("online_payment_transactions")
        .select("status")
        .eq("id", transactionId)
        .single();
      if (data) setStatus(data.status);
      setPollCount((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status, pollCount, transactionId]);

  if (status === "PAID") return <div>تم الدفع بنجاح</div>;
  if (status === "FAILED" || status === "EXPIRED") {
    return <div>لم تكتمل عملية الدفع، يرجى المحاولة مرة أخرى</div>;
  }
  if (pollCount >= MAX_POLLS) {
    return <div>لا تزال المعاملة قيد المعالجة، يرجى مراجعة صفحة المدفوعات لاحقًا</div>;
  }
  return <div>جارٍ التحقق من حالة الدفع...</div>;
}
