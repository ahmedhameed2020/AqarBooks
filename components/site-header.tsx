"use client";

import { useState, useEffect } from "react";
import type { OperationalAlert } from "@/lib/alerts/operational-alerts";
import {
  Globe,
  Search,
  Bell,
  Plus,
  Receipt,
  Scale,
  MapPinned,
  Sparkles,
  Command,
  HelpCircle,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  CreditCard,
  ChevronRight,
  Clock,
  Menu,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/marketing/logo-mark";

export function SiteHeader({
  locale,
  alerts,
}: {
  locale: Locale;
  /** Derived on the server from live data; never a literal. */
  alerts: OperationalAlert[];
}) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale)!;
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const toggleMobileNav = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aqarbooks:toggle-mobile-sidebar"));
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = () => {
      setShowQuickCreate(false);
      setShowNotifications(false);
    };
    if (showQuickCreate || showNotifications) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [showQuickCreate, showNotifications]);

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 sm:px-6 backdrop-blur-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] dark:border-slate-800/80 dark:bg-slate-950/95">
      {/* ──────────────────────────────────────────────────────────────────────────
          LEFT / START: BRAND & LIVE STATUS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label={isAr ? "القائمة الرئيسية" : "Main Navigation"}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden cursor-pointer"
        >
          <Menu className="size-5" />
        </button>

        <Link href="/" locale={locale} className="flex items-center gap-2.5 group">
          <LogoMark className="size-8.5 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black tracking-tight text-slate-950 dark:text-white font-heading">
                AqarBooks
              </span>
              <span className="inline-flex rounded-md bg-[#1A3C2E]/10 dark:bg-emerald-950/60 border border-[#1A3C2E]/20 dark:border-emerald-800 text-[#1A3C2E] dark:text-emerald-300 text-[9px] font-black px-1.5 py-0.2 shadow-2xs">
                ERP
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap tracking-wide -mt-0.5">
              {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
            </span>
          </div>
        </Link>

        {/* Real-time sync badge */}
        <div className="hidden lg:flex items-center gap-1.5 ms-4 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 dark:bg-emerald-950/40 dark:border-emerald-900/60 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{isAr ? "سحابي مباشر" : "Live Cloud Sync"}</span>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          CENTER: QUICK COMMAND TRIGGER (Desktop)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-2 max-w-md w-full mx-4">
        <button
          type="button"
          onClick={() => {
            const searchInput = document.querySelector('input[placeholder*="بحث"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
          }}
          className="w-full flex items-center justify-between h-8.5 px-3 rounded-xl bg-slate-100/80 hover:bg-slate-200/70 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="size-3.5" />
            <span>{isAr ? "بحث سريع في الحسابات، الوحدات، والتقارير..." : "Search accounts, units, reports..."}</span>
          </div>
          <kbd className="flex items-center gap-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 font-bold shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          RIGHT / END: QUICK ACTIONS, NOTIFICATIONS & LOCALE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* QUICK CREATE DROPDOWN */}
        <div className="relative">
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickCreate(!showQuickCreate);
              setShowNotifications(false);
            }}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-8 px-3 rounded-xl shadow-xs gap-1"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{isAr ? "إجراء سريع" : "Quick Action"}</span>
          </Button>

          {showQuickCreate && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute end-0 top-full mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                {isAr ? "إنشاء معاملة جديدة" : "Create New"}
              </div>

              <div className="space-y-0.5 pt-1">
                <Link
                  href="/finance/payments"
                  locale={locale}
                  onClick={() => setShowQuickCreate(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <Receipt className="size-4 text-emerald-600" />
                  <span>{isAr ? "إصدار سند قبض وتحصيل" : "New Receipt Voucher"}</span>
                </Link>

                <Link
                  href="/finance/journals"
                  locale={locale}
                  onClick={() => setShowQuickCreate(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <Scale className="size-4 text-purple-600" />
                  <span>{isAr ? "تسجيل قيد يومية محاسبي" : "New Journal Entry"}</span>
                </Link>

                <Link
                  href="/property"
                  locale={locale}
                  onClick={() => setShowQuickCreate(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <MapPinned className="size-4 text-blue-600" />
                  <span>{isAr ? "إضافة وحدة عقارية" : "New Real Estate Unit"}</span>
                </Link>

                <Link
                  href="/import"
                  locale={locale}
                  onClick={() => setShowQuickCreate(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <Sparkles className="size-4 text-amber-600" />
                  <span>{isAr ? "استيراد ملفات بالذكاء الاصطناعي" : "AI Smart Data Import"}</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* NOTIFICATIONS BELL DROPDOWN */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowNotifications(!showNotifications);
              setShowQuickCreate(false);
            }}
            title={isAr ? "الإشعارات والتنبيهات" : "Notifications"}
            className="relative flex size-8 touch:size-11 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <Bell className="size-4" />
            {/* No badge at all when nothing is wrong -- a red "0" is an alarm
                that says there is no alarm. */}
            {alerts.length > 0 && (
              <span
                aria-label={isAr ? `${alerts.length} تنبيه نشط` : `${alerts.length} active alerts`}
                className="absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-rose-600 font-mono text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900"
              >
                {alerts.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute end-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 px-1">
                <div className="flex items-center gap-1.5">
                  <Bell className="size-3.5 text-indigo-600" />
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? "التنبيهات العاجلة" : "Urgent Alerts"}
                  </span>
                  {alerts.length > 0 && (
                    <Badge className="border-rose-200 bg-rose-50 py-0 text-[9px] font-bold text-rose-700">
                      {alerts.length} {isAr ? "نشِط" : "active"}
                    </Badge>
                  )}
                </div>
                <Link
                  href="/notifications"
                  locale={locale}
                  onClick={() => setShowNotifications(false)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  {isAr ? "عرض الكل" : "View All"}
                </Link>
              </div>

              {/* Live alerts. What stood here was three hand-written entries
                  -- a bank the cheques table has no column for, a tenant who
                  does not exist, a VAT period derived from nothing -- identical
                  for every tenant and impossible to clear, because there was
                  nothing behind them to clear. */}
              <div className="space-y-1.5 py-2">
                {alerts.length === 0 ? (
                  <div className="px-2 py-6 text-center">
                    <CheckCircle2 className="mx-auto mb-1.5 size-6 text-emerald-500" />
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {isAr ? "لا توجد تنبيهات" : "Nothing needs attention"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {isAr
                        ? "لا مطالبات متأخرة ولا شيكات أو عقود تستحق قريبًا."
                        : "No overdue dues, and no cheques or leases falling due soon."}
                    </p>
                  </div>
                ) : (
                  alerts.slice(0, 4).map((alert) => (
                    <Link
                      key={alert.key}
                      href={alert.href}
                      locale={locale}
                      onClick={() => setShowNotifications(false)}
                      className="flex items-start gap-2.5 rounded-xl p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                          alert.severity === "CRITICAL"
                            ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                            : alert.severity === "WARNING"
                              ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        <AlertTriangle className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {isAr ? alert.titleAr : alert.titleEn}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {isAr ? alert.bodyAr : alert.bodyEn}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/notifications"
                  locale={locale}
                  onClick={() => setShowNotifications(false)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl"
                >
                  <span>{isAr ? "فتح مركز الإشعارات الكامل" : "Open Notifications Center"}</span>
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* LANGUAGE SWITCHER */}
        <Link
          href={pathname}
          locale={other}
          className="flex items-center gap-1.5 h-8 touch:min-h-11 px-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
        >
          <Globe className="size-3.5 text-indigo-600" />
          <span>{other === "ar" ? "العربية" : "English"}</span>
        </Link>
      </div>
    </header>
  );
}
