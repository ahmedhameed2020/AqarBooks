"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SiteHeader({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale)!;
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => setShowQuickCreate(false);
    if (showQuickCreate) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [showQuickCreate]);

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 backdrop-blur-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] dark:border-slate-800/80 dark:bg-slate-950/95">
      {/* ──────────────────────────────────────────────────────────────────────────
          LEFT / START: BRAND & LIVE STATUS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link href="/" locale={locale} className="flex items-center gap-2.5 group">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-slate-900 text-sm font-black text-white shadow-md shadow-indigo-600/20 transition-transform group-hover:scale-105">
            A
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "عقار بوكس" : "AqarBooks"}
              </span>
              <span className="hidden sm:inline-flex rounded-md bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[9px] font-extrabold px-1.5 py-0.2">
                PRO
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 font-mono -mt-0.5">
              {isAr ? "نظام المحاسبة وإدارة العقارات" : "Real Estate Accounting ERP"}
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

        {/* NOTIFICATIONS BELL */}
        <Link
          href="/dashboard"
          locale={locale}
          title={isAr ? "الإشعارات والتنبيهات" : "Notifications"}
          className="relative flex size-8 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-300 transition-colors"
        >
          <Bell className="size-4" />
          <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-indigo-600 ring-2 ring-white dark:ring-slate-900" />
        </Link>

        {/* LANGUAGE SWITCHER */}
        <Link
          href={pathname}
          locale={other}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
        >
          <Globe className="size-3.5 text-indigo-600" />
          <span>{other === "ar" ? "العربية" : "English"}</span>
        </Link>
      </div>
    </header>
  );
}
