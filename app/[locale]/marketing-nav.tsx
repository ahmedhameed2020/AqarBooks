"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Building, Sparkles } from "lucide-react";

const NAV_LINKS = [
  { href: "#entities", labelAr: "الكيانات الخمسة", labelEn: "5 Entity Types" },
  { href: "#accounting-engine", labelAr: "المحرك المحاسبي والضرائب", labelEn: "Accounting Engine & VAT" },
  { href: "#features", labelAr: "الموديولات", labelEn: "Modules" },
  { href: "#security", labelAr: "الأمان والتدقيق", labelEn: "Security & Audit" },
  { href: "#pricing", labelAr: "الباقات", labelEn: "Pricing" },
  { href: "#faq", labelAr: "الأسئلة الشائعة", labelEn: "FAQ" },
] as const;

export function MarketingNav({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mk-border)] bg-[#060a18]/90 backdrop-blur-xl transition-all">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" locale={locale} className="flex items-center gap-2.5 group">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-blue-600 text-white shadow-md shadow-purple-900/50 transition-transform group-hover:scale-105">
            <Building className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold tracking-tight text-white">
              {isAr ? "عقار بوكس" : "AqarBooks"}
            </span>
            <span className="text-[10px] font-bold text-purple-400 -mt-1 font-mono tracking-wide">
              {isAr ? "نظام المحاسبة العقارية المتكامل" : "Real Estate Accounting ERP"}
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-bold text-slate-300 transition-colors hover:text-purple-300"
            >
              {isAr ? link.labelAr : link.labelEn}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3.5 md:flex">
          <Link
            href={pathname}
            locale={isAr ? "en" : "ar"}
            className="rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-purple-500/50 hover:text-white transition-colors"
          >
            {isAr ? "English" : "العربية"}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className="text-xs font-bold text-slate-300 hover:text-white transition-colors px-2"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link
            href="/demo"
            locale={locale}
            className="glow-btn-primary rounded-xl px-4.5 py-2 text-xs font-bold transition-transform active:scale-95 shadow-md"
          >
            {isAr ? "طلب عرض تجريبي" : "Request a Demo"}
          </Link>
        </div>

        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{isAr ? "القائمة" : "Menu"}</span>
          <div className="flex flex-col gap-1">
            <span className="h-0.5 w-4 bg-slate-300" />
            <span className="h-0.5 w-4 bg-slate-300" />
            <span className="h-0.5 w-4 bg-slate-300" />
          </div>
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-800 bg-[#070c1e]/98 px-6 py-5 md:hidden backdrop-blur-2xl shadow-xl">
          <nav className="flex flex-col gap-3.5">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-bold text-slate-200 hover:text-purple-400"
              >
                {isAr ? link.labelAr : link.labelEn}
              </a>
            ))}
            <div className="flex items-center gap-4 border-t border-slate-800 pt-4">
              <Link href={pathname} locale={isAr ? "en" : "ar"} className="text-xs font-bold text-slate-300">
                {isAr ? "English" : "العربية"}
              </Link>
              <Link href="/login" locale={locale} className="text-xs font-bold text-slate-300">
                {isAr ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </div>
            <Link
              href="/demo"
              locale={locale}
              className="glow-btn-primary mt-2 rounded-xl px-4 py-2.5 text-center text-xs font-bold"
            >
              {isAr ? "طلب عرض تجريبي" : "Request a Demo"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

