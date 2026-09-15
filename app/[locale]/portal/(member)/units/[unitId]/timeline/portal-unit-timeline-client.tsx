"use client";

import { Bell, CarFront, CreditCard, DoorOpen, Receipt, TicketCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PortalPageHeader } from "../../../portal-ui";
import { formatPortalDate } from "../../../vehicles/vehicle-labels";

export interface PortalTimelineEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  iconKey: string;
  statusKey: string | null;
  sourceType: string;
  amount: number | null;
  currency: string | null;
}

function iconFor(key: string) {
  const cls = "size-4";
  if (key === "car") return <CarFront className={cls} />;
  if (key === "wrench") return <Wrench className={cls} />;
  if (key === "ticket-check") return <TicketCheck className={cls} />;
  if (key === "door-open") return <DoorOpen className={cls} />;
  if (key === "receipt") return <Receipt className={cls} />;
  if (key === "credit-card") return <CreditCard className={cls} />;
  return <Bell className={cls} />;
}

function formatMoney(amount: number, currency: string | null, locale: "ar" | "en") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency: currency ?? "EGP",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function PortalUnitTimelineClient({
  unitCode,
  events,
  locale,
}: {
  unitCode: string;
  events: PortalTimelineEvent[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? `نشاط الوحدة ${unitCode}` : `Unit ${unitCode} Activity`}
        description={
          isAr
            ? "سجل موحد وآمن لأهم أحداث الوحدة من الصيانة والزوار والمركبات والمعاملات المالية."
            : "A secure unified view of maintenance, visitors, vehicles, and finance activity for this unit."
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title={isAr ? "لا يوجد نشاط بعد" : "No activity yet"}
          description={isAr ? "ستظهر هنا الأحداث المهمة المرتبطة بهذه الوحدة." : "Important events for this unit will appear here."}
        />
      ) : (
        <div className="relative space-y-3 before:absolute before:bottom-0 before:start-5 before:top-0 before:w-px before:bg-border/70">
          {events.map((event) => {
            const title = isAr ? event.titleAr : event.titleEn;
            const summary = isAr ? event.summaryAr : event.summaryEn;
            return (
              <article key={event.eventId} className="relative ps-12">
                <span className="absolute start-0 top-4 z-10 flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card text-indigo-600 shadow-2xs">
                  {iconFor(event.iconKey)}
                </span>
                <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
                    <span className="text-[11px] font-semibold text-slate-400">{formatPortalDate(event.occurredAt, locale)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{summary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{event.eventType}</Badge>
                    {event.statusKey ? <Badge variant="outline" className="text-[10px]">{event.statusKey}</Badge> : null}
                    {event.amount !== null ? (
                      <Badge variant="outline" className="text-[10px]">
                        {formatMoney(event.amount, event.currency, locale)}
                      </Badge>
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
