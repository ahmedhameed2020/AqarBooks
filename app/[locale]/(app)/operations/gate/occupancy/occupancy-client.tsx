"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Clock3, Search, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CurrentVisitorItem } from "@/lib/actions/gate-evidence";
import {
  ManualExceptionDialog,
  PendingExceptionApprovals,
  ReconcileVisitorDialog,
  type PendingExceptionItem,
  type SupervisionGateOption,
  type SupervisionInvitationOption,
} from "./supervision-dialogs";

type Option = { id: string; label: string };

function elapsedLabel(enteredAt: string | null, now: Date, isAr: boolean) {
  if (!enteredAt) return isAr ? "وقت الدخول غير متاح" : "Entry time unavailable";
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(enteredAt).getTime()) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days) return isAr ? `${days} ي ${hours} س` : `${days}d ${hours}h`;
  return isAr ? `${hours} س ${rest} د` : `${hours}h ${rest}m`;
}

export function OccupancyClient({
  rows,
  total,
  page,
  pageSize,
  longStayHours,
  nowIso,
  locale,
  filters,
  properties,
  gates,
  invitations,
  pendingExceptions,
  canCreateException,
  canReconcile,
  canApprove,
}: {
  rows: CurrentVisitorItem[];
  total: number;
  page: number;
  pageSize: number;
  longStayHours: number;
  nowIso: string;
  locale: "ar" | "en";
  filters: { q?: string; property?: string; gate?: string };
  properties: Option[];
  gates: SupervisionGateOption[];
  invitations: SupervisionInvitationOption[];
  pendingExceptions: PendingExceptionItem[];
  canCreateException: boolean;
  canReconcile: boolean;
  canApprove: boolean;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [q, setQ] = useState(filters.q ?? "");
  const [property, setProperty] = useState(filters.property ?? "");
  const [gate, setGate] = useState(filters.gate ?? "");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const warningCount = rows.filter((row) => row.longStay || row.expiredInside).length;

  const groups = useMemo(() => {
    const grouped = new Map<string, { propertyName: string; gateName: string; rows: CurrentVisitorItem[] }>();
    for (const row of rows) {
      const gateName = row.gateCode
        ? `${row.gateCode} · ${isAr ? row.gateNameAr : row.gateNameEn}`
        : "—";
      const key = `${row.propertyId}:${row.gateId ?? "unknown"}`;
      const current = grouped.get(key) ?? { propertyName: row.propertyName, gateName, rows: [] };
      current.rows.push(row);
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }, [isAr, rows]);

  function navigate(nextPage = 1) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (property) params.set("property", property);
    if (gate) params.set("gate", gate);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{isAr ? "الزوار الموجودون حالياً" : "Live visitor occupancy"}</h1>
          <p className="text-xs font-medium text-slate-500">{isAr ? `تحذير الإقامة الطويلة بعد ${longStayHours} ساعة.` : `Long-stay warnings begin after ${longStayHours} hours.`}</p>
        </div>
        {canCreateException ? <ManualExceptionDialog gates={gates} invitations={invitations} locale={locale} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-4"><UsersRound className="mb-2 size-5 text-sky-600" /><p className="text-2xl font-black">{total}</p><p className="text-xs text-slate-500">{isAr ? "زائر بالداخل" : "Visitors inside"}</p></div>
        <div className="rounded-2xl border border-border/70 bg-card p-4"><AlertTriangle className="mb-2 size-5 text-amber-600" /><p className="text-2xl font-black">{warningCount}</p><p className="text-xs text-slate-500">{isAr ? "تحذيرات في هذه الصفحة" : "Warnings on this page"}</p></div>
        <div className="rounded-2xl border border-border/70 bg-card p-4"><Clock3 className="mb-2 size-5 text-slate-500" /><p className="text-sm font-black">{new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(now)}</p><p className="text-xs text-slate-500">{isAr ? "آخر تحديث" : "Last refreshed"}</p></div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); navigate(); }} className="grid gap-3 rounded-2xl border border-border/70 bg-card p-3 md:grid-cols-[1fr_.7fr_.7fr_auto]">
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={isAr ? "بحث بالزائر أو رقم التصريح" : "Search visitor or pass"} className="h-10 rounded-xl ps-9" /></div>
        <select value={property} onChange={(event) => { setProperty(event.target.value); setGate(""); }} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل العقارات" : "All properties"}</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select value={gate} onChange={(event) => setGate(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "كل البوابات" : "All gates"}</option>{gates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <Button type="submit" className="h-10 rounded-xl">{isAr ? "تصفية" : "Filter"}</Button>
      </form>

      {canApprove ? <PendingExceptionApprovals items={pendingExceptions} locale={locale} /> : null}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-12 text-center"><UsersRound className="mx-auto mb-3 size-8 text-slate-400" /><p className="text-sm font-bold">{isAr ? "لا يوجد زوار مطابقون بالداخل" : "No matching visitors are inside"}</p></div>
      ) : groups.map((group) => (
        <section key={`${group.propertyName}:${group.gateName}`} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="border-b border-border/70 bg-slate-50 px-4 py-3 dark:bg-slate-900"><h2 className="text-sm font-black">{group.propertyName}</h2><p className="text-xs text-slate-500">{group.gateName} · {group.rows.length}</p></div>
          <div className="divide-y divide-border/70">{group.rows.map((row) => (
            <div key={row.invitationId} className="grid gap-3 p-4 lg:grid-cols-[1fr_.8fr_.8fr_auto] lg:items-center">
              <div><p className="text-[11px] font-bold text-slate-400">{row.invitationNo}</p><p className="text-sm font-black text-slate-950 dark:text-white">{row.guestName}</p><p className="text-xs text-slate-500">{isAr ? "الوحدة" : "Unit"} {row.unitCode}</p></div>
              <div className="text-xs"><p className="font-bold">{elapsedLabel(row.enteredAt, now, isAr)}</p><p className="text-slate-500">{row.enteredAt ? new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.enteredAt)) : "—"}</p></div>
              <div className="space-y-1"><p className="text-xs text-slate-500">{isAr ? "انتهاء التصريح" : "Pass expires"}: {new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.validUntil))}</p><div className="flex flex-wrap gap-1">{row.longStay ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{isAr ? "إقامة طويلة" : "Long stay"}</Badge> : null}{row.expiredInside ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{isAr ? "انتهى وهو بالداخل" : "Expired while inside"}</Badge> : null}</div></div>
              {canReconcile ? <ReconcileVisitorDialog invitationId={row.invitationId} visitorLabel={`${row.guestName} · ${row.invitationNo}`} gateId={row.gateId} gates={gates} locale={locale} /> : null}
            </div>
          ))}</div>
        </section>
      ))}

      <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{isAr ? `صفحة ${page} من ${pageCount}` : `Page ${page} of ${pageCount}`}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate(page - 1)}>{isAr ? "السابق" : "Previous"}</Button><Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => navigate(page + 1)}>{isAr ? "التالي" : "Next"}</Button></div></div>
    </div>
  );
}
