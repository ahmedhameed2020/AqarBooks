"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Plus, Search, TicketCheck, UserRoundPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { revokeVisitorInvitationAction } from "@/lib/actions/visitors";
import { EmptyState, PortalPageHeader, SearchBox, Segmented, StatCard } from "../portal-ui";
import {
  getVisitorEffectiveStatus,
  VISITOR_STATUS_LABELS,
  VISITOR_USAGE_LABELS,
  type VisitorEffectiveStatus,
  type VisitorInvitationStatus,
  type VisitorUsagePolicy,
} from "./visitor-labels";

export interface PortalVisitorInvitationItem {
  id: string;
  invitationNo: string;
  guestName: string;
  validFrom: string;
  validUntil: string;
  usagePolicy: VisitorUsagePolicy;
  status: VisitorInvitationStatus;
  unitCode: string;
  propertyName: string;
}

function formatDateTime(value: string, locale: "ar" | "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PortalVisitorsClient({
  invitations,
  locale,
}: {
  invitations: PortalVisitorInvitationItem[];
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
      return [item.invitationNo, item.guestName, item.unitCode, item.propertyName]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [enriched, query, status]);

  const activeCount = enriched.filter((item) => item.effectiveStatus === "ACTIVE").length;
  const upcomingCount = enriched.filter((item) => item.effectiveStatus === "UPCOMING").length;

  function revoke(invitationId: string) {
    setPendingId(invitationId);
    startTransition(async () => {
      await revokeVisitorInvitationAction({ invitationId });
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "تصاريح الزوار" : "Visitor Passes"}
        description={
          isAr
            ? "أنشئ دعوات آمنة للزوار للوحدات المرتبطة بحسابك وتابع صلاحيتها من هنا."
            : "Create secure visitor invitations for your authorized units and track their validity here."
        }
      >
        <Link href="/portal/visitors/new" locale={locale} className={buttonVariants({ size: "sm", className: "h-9 gap-2 rounded-xl text-xs font-semibold" })}>
          <Plus className="size-4" />
          {isAr ? "دعوة زائر" : "Invite Guest"}
        </Link>
      </PortalPageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={isAr ? "كل التصاريح" : "All passes"} value={invitations.length} icon={<TicketCheck className="size-4" />} />
        <StatCard label={isAr ? "نشطة الآن" : "Active now"} value={activeCount} tone="positive" icon={<CalendarClock className="size-4" />} />
        <StatCard label={isAr ? "قادمة" : "Upcoming"} value={upcomingCount} tone="accent" icon={<UserRoundPlus className="size-4" />} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          ariaLabel={isAr ? "حالة التصريح" : "Pass status"}
          options={[
            { value: "ALL", label: isAr ? "الكل" : "All", count: invitations.length },
            { value: "ACTIVE", label: VISITOR_STATUS_LABELS.ACTIVE[isAr ? "ar" : "en"] },
            { value: "UPCOMING", label: VISITOR_STATUS_LABELS.UPCOMING[isAr ? "ar" : "en"] },
            { value: "EXPIRED", label: VISITOR_STATUS_LABELS.EXPIRED[isAr ? "ar" : "en"] },
            { value: "REVOKED", label: VISITOR_STATUS_LABELS.REVOKED[isAr ? "ar" : "en"] },
          ]}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          locale={locale}
          placeholder={isAr ? "ابحث باسم الزائر أو الوحدة" : "Search guest or unit"}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title={isAr ? "لا توجد تصاريح مطابقة" : "No matching visitor passes"}
          description={
            isAr
              ? "ابدأ بدعوة زائر للوحدة المناسبة، وسيظهر التصريح وحالته هنا."
              : "Invite a guest for the relevant unit, then track the pass and its status here."
          }
          action={
            <Link href="/portal/visitors/new" locale={locale} className={buttonVariants({ size: "sm", className: "rounded-xl text-xs font-semibold" })}>
              {isAr ? "دعوة زائر" : "Invite Guest"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {visible.map((item) => {
            const label = VISITOR_STATUS_LABELS[item.effectiveStatus];
            const canRevoke = item.status === "ACTIVE" && item.effectiveStatus !== "EXPIRED";
            return (
              <article key={item.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
                      <span className="text-[11px] font-semibold text-slate-400">{item.invitationNo}</span>
                    </div>
                    <Link href={`/portal/visitors/${item.id}`} locale={locale} className="block text-sm font-bold text-slate-950 hover:text-indigo-700 dark:text-white">
                      {item.guestName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {item.propertyName} · {item.unitCode} · {VISITOR_USAGE_LABELS[item.usagePolicy][isAr ? "ar" : "en"]}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateTime(item.validFrom, locale)} → {formatDateTime(item.validUntil, locale)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/portal/visitors/${item.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
                      {isAr ? "التفاصيل" : "Details"}
                    </Link>
                    {canRevoke ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending && pendingId === item.id}
                        onClick={() => revoke(item.id)}
                        className="h-8 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        {isAr ? "إلغاء" : "Revoke"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
