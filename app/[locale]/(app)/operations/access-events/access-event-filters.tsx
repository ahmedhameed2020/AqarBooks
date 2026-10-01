"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportAccessEvidenceCsvAction } from "@/lib/actions/gate-evidence";

type Filters = {
  property?: string;
  gate?: string;
  decision?: string;
  reason?: string;
  direction?: string;
  invitation?: string;
  guest?: string;
  operator?: string;
  from?: string;
  to?: string;
};

export function AccessEventFilters({
  initial,
  properties,
  gates,
  page,
  pageSize,
  total,
  locale,
}: {
  initial: Filters;
  properties: Array<{ id: string; label: string }>;
  gates: Array<{ id: string; label: string }>;
  page: number;
  pageSize: number;
  total: number;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function paramsFor(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value?.trim()) params.set(key, value.trim());
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    return params;
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportCsv() {
    setMessage("");
    startTransition(async () => {
      const result = await exportAccessEvidenceCsvAction(Object.fromEntries(paramsFor(1)));
      if (!result.ok) {
        setMessage(result.error === "invalid_filters"
          ? (isAr ? "حدد نطاقاً زمنياً لا يتجاوز 31 يوماً." : "Choose a date range of no more than 31 days.")
          : (isAr ? "تعذر تصدير الأدلة." : "Could not export evidence."));
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(result.truncated
        ? (isAr ? "تم تصدير أول 25,000 صف فقط." : "Exported the first 25,000 rows only.")
        : (isAr ? `تم تصدير ${result.rowCount} صف.` : `Exported ${result.rowCount} rows.`));
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => { event.preventDefault(); router.push(`${pathname}?${paramsFor(1)}`); }} className="space-y-3 rounded-2xl border border-border/70 bg-card p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={filters.guest ?? ""} onChange={(event) => set("guest", event.target.value)} placeholder={isAr ? "اسم الزائر" : "Guest name"} className="h-10 rounded-xl ps-9" /></div>
          <Input value={filters.invitation ?? ""} onChange={(event) => set("invitation", event.target.value)} placeholder={isAr ? "رقم التصريح" : "Invitation number"} className="h-10 rounded-xl" />
          <Input value={filters.operator ?? ""} onChange={(event) => set("operator", event.target.value)} placeholder={isAr ? "اسم المشغل" : "Operator name"} className="h-10 rounded-xl" />
          <Input value={filters.reason ?? ""} onChange={(event) => set("reason", event.target.value)} placeholder={isAr ? "رمز السبب" : "Reason code"} className="h-10 rounded-xl" />
        </div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <select value={filters.property ?? ""} onChange={(event) => set("property", event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل العقارات" : "All properties"}</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select value={filters.gate ?? ""} onChange={(event) => set("gate", event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل البوابات" : "All gates"}</option>{gates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select value={filters.decision ?? ""} onChange={(event) => set("decision", event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل القرارات" : "All decisions"}</option><option value="ALLOW">ALLOW</option><option value="DENY">DENY</option><option value="RECONCILE">RECONCILE</option></select>
          <select value={filters.direction ?? ""} onChange={(event) => set("direction", event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل الاتجاهات" : "All directions"}</option><option value="ENTRY">{isAr ? "دخول" : "Entry"}</option><option value="EXIT">{isAr ? "خروج" : "Exit"}</option></select>
          <Input type="date" aria-label={isAr ? "من تاريخ" : "From date"} value={filters.from ?? ""} onChange={(event) => set("from", event.target.value)} className="h-10 rounded-xl" />
          <Input type="date" aria-label={isAr ? "إلى تاريخ" : "To date"} value={filters.to ?? ""} onChange={(event) => set("to", event.target.value)} className="h-10 rounded-xl" />
          <Button type="submit" className="h-10 rounded-xl">{isAr ? "تصفية" : "Filter"}</Button>
          <Button type="button" variant="outline" onClick={exportCsv} disabled={pending} className="h-10 gap-2 rounded-xl">{pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{isAr ? "CSV" : "Export CSV"}</Button>
        </div>
        {message ? <p role="status" className="text-xs font-semibold text-slate-500">{message}</p> : null}
      </form>
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{isAr ? `${total} حدث · صفحة ${page} من ${pageCount}` : `${total} events · Page ${page} of ${pageCount}`}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => router.push(`${pathname}?${paramsFor(page - 1)}`)}>{isAr ? "السابق" : "Previous"}</Button><Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => router.push(`${pathname}?${paramsFor(page + 1)}`)}>{isAr ? "التالي" : "Next"}</Button></div></div>
    </div>
  );
}
