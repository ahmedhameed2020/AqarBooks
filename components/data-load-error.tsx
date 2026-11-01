"use client";

import { startTransition, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown by the route `error.tsx` files when a page could not read its data (see lib/supabase/assert-read.ts). It says so plainly instead
 * of rendering an empty or partial page, and offers a retry. `digest` is Next's correlation id for the server log entry.
 */
export function DataLoadErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const router = useRouter();
  const isAr = params?.locale !== "en";
  useEffect(() => {
    console.error("[data-load] route error boundary:", error.digest ?? error.name);
  }, [error]);
  return (
    <section role="alert" data-testid="data-load-error" className="mx-auto my-10 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-start dark:border-rose-900/50 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
        <div className="space-y-2">
          <h1 className="text-base font-black text-rose-900 dark:text-rose-200">
            {isAr ? "تعذّر تحميل بيانات هذه الصفحة" : "This page's data could not be loaded"}
          </h1>
          <p className="text-sm text-rose-800 dark:text-rose-300">
            {isAr
              ? "لم نعرض أرقامًا ناقصة أو قوائم فارغة لأنها قد تكون مضلِّلة. أعد المحاولة؛ وإن تكرر الأمر فأبلغ الدعم مع الرمز أدناه."
              : "We did not show partial numbers or empty lists because they could be misleading. Try again; if it keeps happening, tell support and quote the code below."}
          </p>
          {error.digest && <p className="font-mono text-xs text-rose-700" dir="ltr">{error.digest}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => {
              // a server-rendered page only re-reads its data on a refresh; reset() alone re-renders the old failure
              startTransition(() => {
                router.refresh();
                reset();
              });
            }} className="gap-1.5" data-testid="data-load-retry">
            <RefreshCw className="size-3.5" />
            {isAr ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      </div>
    </section>
  );
}
