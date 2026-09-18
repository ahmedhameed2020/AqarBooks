"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, FileClock, KeyRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PortalPageHeader, SearchBox, Segmented, StatCard } from "../portal-ui";
import { formatLeaseDate, LEASE_RENEWAL_STATUS_COPY, type LeaseRenewalStatus } from "@/lib/lease-renewal-ui";

export interface PortalLeaseItem {
  leaseId: string;
  unitLabel: string;
  relationship: "TENANT" | "OWNER";
  leaseStatus: "ACTIVE" | "SCHEDULED" | "ENDED";
  startsOn: string | null;
  endsOn: string | null;
  successorStartsOn: string | null;
  requestStatus: LeaseRenewalStatus | null;
}

type Filter = "ALL" | "CURRENT" | "SCHEDULED" | "REQUESTED";

export function PortalLeasesClient({ items, locale }: { items: PortalLeaseItem[]; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => items.filter((item) => {
    if (filter === "CURRENT" && item.leaseStatus !== "ACTIVE") return false;
    if (filter === "SCHEDULED" && !item.successorStartsOn && item.leaseStatus !== "SCHEDULED") return false;
    if (filter === "REQUESTED" && item.requestStatus !== "REQUESTED") return false;
    return !query.trim() || item.unitLabel.toLowerCase().includes(query.trim().toLowerCase());
  }), [filter, items, query]);

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "العقود والتجديد" : "Leases & renewals"}
        description={isAr ? "تابع العقد الجاري، العقد المجدول، وحالة طلب التجديد من مكان واحد." : "Track the current lease, scheduled successor, and renewal request status in one place."}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={isAr ? "عقود جارية" : "Current leases"} value={items.filter((i) => i.leaseStatus === "ACTIVE").length} icon={<KeyRound className="size-4" />} />
        <StatCard label={isAr ? "تجديدات قيد المراجعة" : "Under review"} value={items.filter((i) => i.requestStatus === "REQUESTED").length} tone="accent" icon={<FileClock className="size-4" />} />
        <StatCard label={isAr ? "عقود قادمة" : "Scheduled successors"} value={items.filter((i) => i.successorStartsOn || i.leaseStatus === "SCHEDULED").length} tone="positive" icon={<CalendarClock className="size-4" />} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          ariaLabel={isAr ? "تصفية العقود" : "Filter leases"}
          options={[
            { value: "ALL", label: isAr ? "الكل" : "All", count: items.length },
            { value: "CURRENT", label: isAr ? "جارية" : "Current" },
            { value: "REQUESTED", label: isAr ? "قيد المراجعة" : "Under review" },
            { value: "SCHEDULED", label: isAr ? "قادمة" : "Scheduled" },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} locale={locale} placeholder={isAr ? "ابحث بالوحدة" : "Search by unit"} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={isAr ? "لا توجد عقود مطابقة" : "No matching leases"}
          description={isAr ? "ستظهر هنا العقود وطلبات التجديد المتاحة لحسابك." : "Leases and renewal requests available to your account will appear here."}
          icon={<KeyRound className="size-5" />}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label={isAr ? "العقود" : "Leases"}>
          {visible.map((item) => {
            const requestCopy = item.requestStatus ? LEASE_RENEWAL_STATUS_COPY[item.requestStatus] : null;
            return (
              <li key={`${item.relationship}-${item.leaseId}`} className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.unitLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.relationship === "TENANT" ? (isAr ? "طرف العقد" : "Contract tenant") : (isAr ? "مالك حالي — عرض حالة فقط" : "Current owner — status only")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.leaseStatus === "ACTIVE" ? "success" : "info"}>
                      {item.leaseStatus === "ACTIVE" ? (isAr ? "جارٍ" : "Current") : item.leaseStatus === "SCHEDULED" ? (isAr ? "مجدول" : "Scheduled") : (isAr ? "منتهٍ" : "Ended")}
                    </Badge>
                    {requestCopy ? <Badge variant={requestCopy.tone}>{isAr ? requestCopy.ar : requestCopy.en}</Badge> : null}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
                  <div><dt className="text-slate-500">{isAr ? "الفترة الحالية" : "Current term"}</dt><dd className="mt-1 font-medium">{formatLeaseDate(item.startsOn, locale)} – {formatLeaseDate(item.endsOn, locale)}</dd></div>
                  <div><dt className="text-slate-500">{isAr ? "بداية العقد القادم" : "Successor starts"}</dt><dd className="mt-1 font-medium">{item.successorStartsOn ? formatLeaseDate(item.successorStartsOn, locale) : "—"}</dd></div>
                </dl>
                <Link href={`/portal/leases/${item.leaseId}/renewal`} locale={locale} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                  <CheckCircle2 className="size-3.5" />
                  {isAr ? "عرض حالة التجديد" : "View renewal status"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
