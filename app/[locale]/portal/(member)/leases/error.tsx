"use client";

import { Button } from "@/components/ui/button";

export default function PortalLeasesError({ reset }: { error: Error; reset: () => void }) {
  return <section role="alert" className="rounded-xl border border-rose-200 bg-card p-6"><h1 className="font-bold">تعذر تحميل العقود / Could not load leases</h1><Button type="button" variant="outline" className="mt-4" onClick={reset}>إعادة المحاولة / Retry</Button></section>;
}
