"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Building2,
  ExternalLink,
  Phone,
  MessageCircle,
  Mail,
  User,
  Building,
  Receipt,
  CircleCheck,
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
import { UnitBalanceBadge } from "../property/unit-balance-badge";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(data !== null);
    if (data) setLastData(data);
  }, [data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) pushParams({ member: undefined });
  }

  const shown = data ?? lastData;
  const whatsappNumber = shown?.phone ? shown.phone.replace(/\D/g, "") : null;
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;

  return (
    <Sheet open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <SheetContent className="sm:max-w-md p-6">
        {shown && (
          <>
            <SheetHeader className="space-y-3 pb-2">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-lg shadow-md ring-4 ring-indigo-500/10 shrink-0">
                  {shown.fullName.trim().slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-xl font-black text-slate-900 dark:text-white">
                    {shown.fullName}
                  </SheetTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {[shown.email, shown.phone].filter(Boolean).join(" • ") ||
                      (isAr ? "بلا بيانات تواصل" : "No contact info")}
                  </p>
                </div>
              </div>

              {/* Quick Communication Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {shown.phone && (
                  <a
                    href={`tel:${shown.phone}`}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    <Phone className="size-3 text-indigo-500" />
                    <span>{shown.phone}</span>
                  </a>
                )}
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                  >
                    <MessageCircle className="size-3 fill-emerald-500 text-emerald-500" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </SheetHeader>

            <SheetBody className="space-y-5 pt-2">
              {/* Financial Balance & Units Bento Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-2xs">
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <Wallet className="size-3.5 text-indigo-500" />
                    {isAr ? "الرصيد الإجمالي" : "Total Balance"}
                  </p>
                  <p className="mt-1 text-lg font-black tracking-tight">
                    <Money
                      amount={shown.totalBalance}
                      currency={currency}
                      locale={locale}
                      tone={shown.totalBalance > 0 ? "negative" : "positive"}
                    />
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-2xs">
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <Building2 className="size-3.5 text-purple-500" />
                    {isAr ? "الوحدات المملوكة" : "Owned Units"}
                  </p>
                  <p className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    {shown.unitsCount} <span className="text-xs font-semibold text-slate-400">{isAr ? "وحدة" : "units"}</span>
                  </p>
                </div>
              </div>

              {/* Owned Units List */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? "الوحدات والعقارات المسجلة" : "Registered Units"}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {shown.units.length} {isAr ? "وحدات" : "units"}
                  </span>
                </div>

                {shown.units.length ? (
                  <ul className="space-y-2">
                    {shown.units.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card shadow-2xs"
                      >
                        <Link
                          href={`/property/${u.id}`}
                          locale={locale}
                          className="font-bold text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                        >
                          <Building2 className="size-3.5" />
                          <span>{u.code}</span>
                        </Link>
                        <UnitBalanceBadge balance={u.balance} currency={currency} locale={locale} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-border/40 text-xs text-slate-400">
                    {isAr ? "لا توجد وحدات مسجلة باسم هذا العضو" : "No registered units"}
                  </div>
                )}
              </section>
            </SheetBody>

            <SheetFooter className="mt-4 pt-2 border-t border-border/60">
              <Link
                href={`/members/${shown.id}`}
                locale={locale}
                className={buttonVariants({
                  variant: "default",
                  size: "sm",
                  className:
                    "w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black shadow-md gap-2",
                })}
              >
                <span>{isAr ? "عرض الملف الشامل والكامل للمالك" : "View Full Owner Profile"}</span>
                <ExternalLink className="size-4" />
              </Link>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
