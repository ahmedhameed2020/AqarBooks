"use client";

import { useEffect, useState } from "react";
import { Wallet, Building2, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Money } from "@/components/money";
import { UnitBalanceBadge } from "../property/unit-balance-badge";
import { MemberAvatar } from "./member-avatar";
import { useMembersNav } from "./members-nav-context";

export type MemberDrawerData = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  unitsCount: number;
  totalBalance: number;
  units: { id: string; code: string; balance: number }[];
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

export function MemberDrawer({
  data,
  locale,
  currency,
}: {
  data: MemberDrawerData | null;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const { pushParams } = useMembersNav();
  const [open, setOpen] = useState(data !== null);
  const [lastData, setLastData] = useState(data);

  useEffect(() => {
    // Mirrors server-driven `data` (URL state) into local open/lastData so
    // the Sheet's own close animation can run immediately on user action
    // (ESC/backdrop/close button) without waiting on the server round-trip
    // that actually removes ?member= from the URL -- see handleOpenChange.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(data !== null);
    if (data) setLastData(data);
  }, [data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) pushParams({ member: undefined });
  }

  const shown = data ?? lastData;

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent>
        {shown && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <MemberAvatar id={shown.id} name={shown.fullName} className="size-10 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{shown.fullName}</SheetTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {[shown.email, shown.phone].filter(Boolean).join(" · ") || (isAr ? "بلا بيانات تواصل" : "No contact info")}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <SheetBody className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wallet className="size-3.5" />
                    {isAr ? "الرصيد الإجمالي" : "Total balance"}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    <Money
                      amount={shown.totalBalance}
                      currency={currency}
                      locale={locale}
                      tone={shown.totalBalance > 0 ? "negative" : "positive"}
                    />
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="size-3.5" />
                    {isAr ? "الوحدات" : "Units"}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{shown.unitsCount}</p>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "الوحدات المملوكة" : "Owned units"}</h3>
                {shown.units.length ? (
                  <ul className="space-y-1.5">
                    {shown.units.map((u) => (
                      <li key={u.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <Link href={`/property/${u.id}`} locale={locale} className="font-medium hover:underline">
                          {u.code}
                        </Link>
                        <UnitBalanceBadge balance={u.balance} currency={currency} locale={locale} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد وحدات مملوكة" : "No owned units"}</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "آخر الاستحقاقات" : "Recent dues"}</h3>
                {shown.dues.length ? (
                  <ul className="space-y-1.5">
                    {shown.dues.map((d) => {
                      const label = DUE_STATUS_LABELS[d.status] ?? { ar: d.status, en: d.status };
                      return (
                        <li key={d.id} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="truncate">{d.type}</p>
                            <p className="text-xs text-muted-foreground">{d.date}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-medium">
                              <Money amount={d.amount} locale={locale} />
                            </span>
                            <Badge variant="outline" className="text-[10px]">{isAr ? label.ar : label.en}</Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد استحقاقات" : "No dues"}</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "آخر الدفعات" : "Recent payments"}</h3>
                {shown.payments.length ? (
                  <ul className="space-y-1.5">
                    {shown.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p>{isAr ? METHOD_LABELS[p.method]?.ar : METHOD_LABELS[p.method]?.en}</p>
                          <p className="text-xs text-muted-foreground">{p.date}</p>
                        </div>
                        <span className="font-medium">
                          <Money amount={p.amount} currency={currency} locale={locale} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد دفعات" : "No payments"}</p>
                )}
              </section>
            </SheetBody>

            <SheetFooter>
              <Link
                href={`/members/${shown.id}`}
                locale={locale}
                className={buttonVariants({ variant: "default", size: "sm", className: "w-full" })}
              >
                {isAr ? "الملف الكامل" : "Full profile"}
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
