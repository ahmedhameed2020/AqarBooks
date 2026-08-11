"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Receipt, Wallet, CreditCard, Plus, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Money } from "@/components/money";
import { OccupancyBadge, unitTypeLabel, type UnitRow } from "./units-table";
import { usePropertyNav } from "./property-nav-context";

export type UnitDrawerData = {
  id: string;
  code: string;
  unitType: UnitRow["unit_type"];
  customTypeLabel: string | null;
  buildingName: string | null;
  zoneName: string | null;
  occupancyStatus: UnitRow["occupancy_status"];
  ownerId: string | null;
  ownerName: string | null;
  balance: number;
  totalDue: number;
  totalPaid: number;
  dues: { id: string; date: string; type: string; amount: number; status: string }[];
  payments: { id: string; date: string; amount: number; method: string }[];
};

const DUE_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft" },
  ISSUED: { ar: "غير مدفوع", en: "Unpaid" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partial" },
  PAID: { ar: "مدفوع", en: "Paid" },
  OVERDUE: { ar: "متأخر", en: "Overdue" },
  VOID: { ar: "ملغى", en: "Void" },
};

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
};

export function UnitDrawer({
  data,
  locale,
  currency,
}: {
  data: UnitDrawerData | null;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const { pushParams } = usePropertyNav();
  const [open, setOpen] = useState(data !== null);
  const [lastData, setLastData] = useState(data);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(data !== null);
    if (data) setLastData(data);
  }, [data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) pushParams({ unit: undefined });
  }

  const shown = data ?? lastData;

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent className="sm:max-w-md">
        {shown && (
          <>
            <SheetHeader>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SheetTitle className="truncate font-mono text-xl">{shown.code}</SheetTitle>
                  <OccupancyBadge status={shown.occupancyStatus} locale={locale} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[shown.buildingName, shown.zoneName].filter(Boolean).join(" · ") || (isAr ? "بدون مبنى/منطقة" : "No building/zone")}
                  {" · "}
                  {unitTypeLabel({ unit_type: shown.unitType, custom_type_label: shown.customTypeLabel }, isAr)}
                </p>
              </div>
            </SheetHeader>

            <SheetBody className="space-y-6">
              {/* Financial Health Balance Card */}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/40 bg-card p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="size-3.5" />
                      {isAr ? "الرصيد القائم" : "Current Balance"}
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      <Money amount={shown.balance} currency={currency} locale={locale} tone={shown.balance > 0 ? "negative" : "positive"} />
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Receipt className="size-3.5" />
                      {isAr ? "إجمالي الفواتير" : "Total Due"}
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      <Money amount={shown.totalDue} currency={currency} locale={locale} />
                    </p>
                  </div>
                </div>

                {/* Quick Action Buttons inside Drawer */}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/finance/payments?unit=${shown.id}`}
                    locale={locale}
                    className={buttonVariants({ size: "sm", className: "flex-1 gap-1 text-xs" })}
                  >
                    <CreditCard className="size-3.5" />
                    {isAr ? "سداد دفعة" : "Record Payment"}
                  </Link>
                  <Link
                    href={`/finance/dues?unit=${shown.id}`}
                    locale={locale}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1 gap-1 text-xs" })}
                  >
                    <Plus className="size-3.5" />
                    {isAr ? "إصدار مستحق" : "Issue Due"}
                  </Link>
                </div>
              </div>

              {/* Owner Contact */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "المالك الحالي" : "Current Owner"}</h3>
                {shown.ownerId ? (
                  <Link
                    href={`/members/${shown.ownerId}`}
                    locale={locale}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3 text-sm font-semibold transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      {shown.ownerName}
                    </span>
                    <ArrowUpRight className="size-4 text-primary rtl:-scale-x-100" />
                  </Link>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                    {isAr ? "لا يوجد مالك مسجّل لهذه الوحدة" : "No owner registered for this unit"}
                  </div>
                )}
              </section>

              {/* Recent Dues */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "آخر الاستحقاقات" : "Recent Dues"}</h3>
                  <span className="text-[11px] text-muted-foreground">{shown.dues.length} {isAr ? "سجلات" : "records"}</span>
                </div>
                {shown.dues.length ? (
                  <ul className="space-y-2">
                    {shown.dues.map((d) => {
                      const label = DUE_STATUS_LABELS[d.status] ?? { ar: d.status, en: d.status };
                      return (
                        <li key={d.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{d.type}</p>
                            <p className="text-[10px] text-muted-foreground">{d.date}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-bold tabular-nums">
                              <Money amount={d.amount} locale={locale} />
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal">{isAr ? label.ar : label.en}</Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">{isAr ? "لا توجد استحقاقات مسجلة" : "No dues recorded"}</p>
                )}
              </section>

              {/* Recent Payments */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "آخر المقبوضات" : "Recent Payments"}</h3>
                  <span className="text-[11px] text-muted-foreground">{shown.payments.length} {isAr ? "سجلات" : "records"}</span>
                </div>
                {shown.payments.length ? (
                  <ul className="space-y-2">
                    {shown.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-3 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">{isAr ? METHOD_LABELS[p.method]?.ar : METHOD_LABELS[p.method]?.en}</p>
                          <p className="text-[10px] text-muted-foreground">{p.date}</p>
                        </div>
                        <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          <Money amount={p.amount} currency={currency} locale={locale} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">{isAr ? "لا توجد مقبوضات بعد" : "No payments recorded"}</p>
                )}
              </section>
            </SheetBody>

            <SheetFooter className="mt-4">
              <Link
                href={`/property/${shown.id}`}
                locale={locale}
                className={buttonVariants({ variant: "default", size: "sm", className: "w-full gap-1.5" })}
              >
                {isAr ? "عرض الملف الشامل والكامل" : "View Full Unit Profile"}
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
