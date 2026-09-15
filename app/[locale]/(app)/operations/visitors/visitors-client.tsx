"use client";

import { useMemo, useState, useTransition } from "react";
import { Ban, Search, TicketCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revokeVisitorInvitationAction } from "@/lib/actions/visitors";
import {
  getVisitorEffectiveStatus,
  VISITOR_STATUS_LABELS,
  VISITOR_USAGE_LABELS,
  type VisitorEffectiveStatus,
  type VisitorInvitationStatus,
  type VisitorUsagePolicy,
} from "@/app/[locale]/portal/(member)/visitors/visitor-labels";

export interface StaffVisitorInvitationItem {
  id: string;
  invitationNo: string;
  guestName: string;
  validFrom: string;
  validUntil: string;
  usagePolicy: VisitorUsagePolicy;
  status: VisitorInvitationStatus;
  unitCode: string;
  propertyName: string;
  memberName: string;
}

export function StaffVisitorsClient({
  invitations,
  canManage,
  locale,
}: {
  invitations: StaffVisitorInvitationItem[];
  canManage: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | VisitorEffectiveStatus>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const enriched = useMemo(
    () => invitations.map((item) => ({ ...item, effectiveStatus: getVisitorEffectiveStatus({
      status: item.status,
      valid_from: item.validFrom,
      valid_until: item.validUntil,
    }) })),
    [invitations],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((item) => {
      if (status !== "ALL" && item.effectiveStatus !== status) return false;
      if (!q) return true;
      return [item.invitationNo, item.guestName, item.unitCode, item.propertyName, item.memberName]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [enriched, query, status]);

  function revoke(invitationId: string) {
    setPendingId(invitationId);
    startTransition(async () => {
      await revokeVisitorInvitationAction({ invitationId });
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {isAr ? "تصاريح الزوار" : "Visitor Passes"}
        </h1>
        <p className="text-xs font-medium text-slate-500">
          {isAr ? "دعوات الزوار الصادرة من بوابة الملاك بدون عمليات بوابة أو سجل دخول." : "Owner-issued visitor invitations without gate operations or access events."}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isAr ? "بحث بالتصريح أو الزائر أو الوحدة" : "Search pass, guest, or unit"}
            className="h-10 rounded-xl ps-9 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "ALL" | VisitorEffectiveStatus)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="ALL">{isAr ? "كل الحالات" : "All statuses"}</option>
          {Object.entries(VISITOR_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{isAr ? label.ar : label.en}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs">
        <div className="hidden grid-cols-[1fr_1fr_.8fr_.8fr_.8fr_auto] gap-3 border-b border-border/70 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500 lg:grid">
          <span>{isAr ? "التصريح" : "Pass"}</span>
          <span>{isAr ? "الموقع" : "Location"}</span>
          <span>{isAr ? "العضو" : "Member"}</span>
          <span>{isAr ? "الحالة" : "Status"}</span>
          <span>{isAr ? "الصلاحية" : "Validity"}</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-slate-50 text-slate-400">
              <TicketCheck className="size-5" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد تصاريح مطابقة" : "No matching passes"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {visible.map((item) => {
              const label = VISITOR_STATUS_LABELS[item.effectiveStatus];
              const canRevoke = canManage && item.status === "ACTIVE" && item.effectiveStatus !== "EXPIRED";
              return (
                <div key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1fr_.8fr_.8fr_.8fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-400">{item.invitationNo}</p>
                    <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{item.guestName}</p>
                    <p className="text-[11px] text-slate-500">{VISITOR_USAGE_LABELS[item.usagePolicy][isAr ? "ar" : "en"]}</p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{item.propertyName} · {item.unitCode}</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.memberName}</p>
                  <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
                  <p className="text-[11px] text-slate-500">{new Date(item.validUntil).toLocaleString(isAr ? "ar-EG" : "en-US")}</p>
                  <div className="flex items-center gap-2">
                    <Link href={`/operations/visitors/${item.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
                      {isAr ? "فتح" : "Open"}
                    </Link>
                    {canRevoke ? (
                      <Button type="button" variant="outline" size="sm" disabled={isPending && pendingId === item.id} onClick={() => revoke(item.id)} className="h-8 gap-1 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                        <Ban className="size-3.5" />
                        {isAr ? "إلغاء" : "Revoke"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
