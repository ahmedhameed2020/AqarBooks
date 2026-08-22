"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Receipt,
  Wallet,
  CreditCard,
  Plus,
  CheckCircle2,
  Building,
  User,
  ExternalLink,
  Phone,
  MessageCircle,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

const DUE_STATUS_LABELS: Record<string, { ar: string; en: string; variant: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft", variant: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  ISSUED: { ar: "مستحق", en: "Unpaid", variant: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partial", variant: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  PAID: { ar: "مسدد بالكامل", en: "Paid", variant: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  OVERDUE: { ar: "متأخر السداد", en: "Overdue", variant: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  VOID: { ar: "ملغى", en: "Void", variant: "bg-slate-100 text-slate-400 dark:bg-slate-800" },
};

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك بنكي", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
  ONLINE: { ar: "دفع إلكتروني", en: "Online Payment" },
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
  const settled = (shown?.balance ?? 0) <= 0;

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent className="sm:max-w-md p-6">
        {shown && (
          <>
            <SheetHeader className="space-y-2 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="size-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-mono font-black text-sm">
                    {shown.code.slice(0, 3)}
                  </div>
                  <div>
                    <SheetTitle className="font-mono font-black text-xl text-slate-900 dark:text-white">
                      {shown.code}
                    </SheetTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {unitTypeLabel(
                        { unit_type: shown.unitType, custom_type_label: shown.customTypeLabel },
                        isAr
                      )}
                      {" • "}
                      {[shown.buildingName, shown.zoneName].filter(Boolean).join(" • ") ||
                        (isAr ? "الكيان الرئيسي" : "Main Property")}
                    </p>
                  </div>
                </div>

                <OccupancyBadge status={shown.occupancyStatus} locale={locale} />
              </div>
            </SheetHeader>

            <SheetBody className="space-y-5 pt-2">
              {/* Financial Health Balance Bento Card */}
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  settled
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-rose-500/30 bg-rose-500/[0.04]"
                }`}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-card p-3 shadow-2xs">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <Wallet className="size-3.5 text-indigo-500" />
                      {isAr ? "الرصيد القائم" : "Current Balance"}
                    </p>
                    <p className="mt-1 text-lg font-black tracking-tight">
                      <Money
                        amount={shown.balance}
                        currency={currency}
                        locale={locale}
                        tone={shown.balance > 0 ? "negative" : "positive"}
                      />
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card p-3 shadow-2xs">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <Receipt className="size-3.5 text-purple-500" />
                      {isAr ? "إجمالي الفواتير" : "Total Due"}
                    </p>
                    <p className="mt-1 text-lg font-black tracking-tight">
                      <Money amount={shown.totalDue} currency={currency} locale={locale} />
                    </p>
                  </div>
                </div>

                {/* Quick Action Buttons inside Drawer */}
                <div className="flex gap-2 pt-1">
                  <Link
                    href={`/finance/payments?unit=${shown.id}`}
                    locale={locale}
                    className={buttonVariants({
                      size: "sm",
                      className:
                        "flex-1 gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs",
                    })}
                  >
                    <CreditCard className="size-3.5" />
                    {isAr ? "سداد دفعة" : "Record Payment"}
                  </Link>
                  <Link
                    href={`/finance/dues?unit=${shown.id}`}
                    locale={locale}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "flex-1 gap-1.5 text-xs font-bold rounded-xl",
                    })}
                  >
                    <Plus className="size-3.5 text-indigo-500" />
                    {isAr ? "إصدار مستحق" : "Issue Due"}
                  </Link>
                </div>
              </div>

              {/* Current Owner Card */}
              <section className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? "المالك الحالي للوحدة" : "Current Owner"}
                </h3>
                {shown.ownerId ? (
                  <Link
                    href={`/members/${shown.ownerId}`}
                    locale={locale}
                    className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-3.5 shadow-2xs transition-all hover:border-indigo-500/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                        {shown.ownerName?.slice(0, 1) || "U"}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                          {shown.ownerName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {isAr ? "مالك مسجل معتمد" : "Verified Registered Owner"}
                        </p>
                      </div>
                    </div>
                    <div className="size-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <ExternalLink className="size-3.5" />
                    </div>
                  </Link>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 p-4 text-center text-xs text-slate-400 bg-slate-50/30 dark:bg-slate-900/30 space-y-1">
                    <User className="size-5 mx-auto opacity-40" />
                    <p className="font-semibold">
                      {isAr ? "لا يوجد مالك مسجل لهذه الوحدة" : "No owner assigned yet"}
                    </p>
                  </div>
                )}
              </section>

              {/* Recent Dues */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? "آخر الاستحقاقات والمطالبات" : "Recent Dues"}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {shown.dues.length} {isAr ? "سجلات" : "records"}
                  </span>
                </div>
                {shown.dues.length ? (
                  <ul className="space-y-2">
                    {shown.dues.slice(0, 4).map((d) => {
                      const statusInfo = DUE_STATUS_LABELS[d.status] || {
                        ar: d.status,
                        en: d.status,
                        variant: "bg-slate-100 text-slate-600",
                      };
                      return (
                        <li
                          key={d.id}
                          className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-3 text-xs shadow-2xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate">
                              {d.type}
                            </p>
                            <p className="text-[10px] text-slate-400">{d.date}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-black text-slate-900 dark:text-white tabular-nums">
                              <Money amount={d.amount} locale={locale} />
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold py-0.5 px-2 rounded-md ${statusInfo.variant}`}
                            >
                              {isAr ? statusInfo.ar : statusInfo.en}
                            </Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-border/40 text-xs text-slate-400">
                    {isAr ? "لا توجد استحقاقات مسجلة" : "No dues recorded"}
                  </div>
                )}
              </section>

              {/* Recent Payments */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? "آخر المقبوضات والتحصيلات" : "Recent Payments"}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {shown.payments.length} {isAr ? "سجلات" : "records"}
                  </span>
                </div>
                {shown.payments.length ? (
                  <ul className="space-y-2">
                    {shown.payments.slice(0, 4).map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-3 text-xs shadow-2xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {isAr
                              ? METHOD_LABELS[p.method]?.ar || p.method
                              : METHOD_LABELS[p.method]?.en || p.method}
                          </p>
                          <p className="text-[10px] text-slate-400">{p.date}</p>
                        </div>
                        <span className="font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          +<Money amount={p.amount} currency={currency} locale={locale} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-border/40 text-xs text-slate-400">
                    {isAr ? "لا توجد مقبوضات بعد" : "No payments recorded"}
                  </div>
                )}
              </section>
            </SheetBody>

            <SheetFooter className="mt-4 pt-2 border-t border-border/60">
              <Link
                href={`/property/${shown.id}`}
                locale={locale}
                className={buttonVariants({
                  variant: "default",
                  size: "sm",
                  className:
                    "w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black shadow-md gap-2",
                })}
              >
                <span>{isAr ? "عرض الملف الشامل والكامل للوحدة" : "View Full Unit Profile"}</span>
                <ExternalLink className="size-4" />
              </Link>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
