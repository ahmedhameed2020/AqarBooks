"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";
import { Menu, X, ArrowUpRight } from "lucide-react";

const NAV_LINKS = [
  { href: "/#story", labelAr: "القصة المالية", labelEn: "The Story" },
  { href: "/#engine", labelAr: "المحرك المحاسبي", labelEn: "Accounting Engine" },
  { href: "/#follow-money", labelAr: "تتبع الحركة", labelEn: "Follow the Money" },
  { href: "/#operating-ledger", labelAr: "سجل التشغيل", labelEn: "Operating Ledger" },
  { href: "/#audit", labelAr: "الرقابة والتدقيق", labelEn: "Control & Audit" },
  { href: "/#reports", labelAr: "التقارير", labelEn: "Reports" },
  { href: "/#ai-layer", labelAr: "طبقة الذكاء", labelEn: "AI Intelligence" },
  { href: "/#entities", labelAr: "الهياكل العقارية", labelEn: "Entity Structures" },
] as const;

export function MarketingNav({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full px-4 sm:px-6 pt-3 pb-2 transition-all">
      {/* Machined Floating Control Bar Container */}
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl border transition-all duration-300 ${
          scrolled
            ? "border-slate-300/80 bg-white/95 shadow-md shadow-slate-900/5 backdrop-blur-md px-4 py-2"
            : "border-slate-200/90 bg-white/90 shadow-xs px-5 py-2.5"
        }`}
      >
        {/* Logo & Brand Identity */}
        <Link href="/" locale={locale} className="flex shrink-0 items-center gap-3 group">
          <LogoMark className="size-9.5 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-slate-950 font-heading">
                AqarBooks
              </span>
              <span className="inline-flex rounded-md bg-[#07425d]/10 text-[#07425d] border border-[#07425d]/20 text-[9px] font-black px-1.5 py-0.2">
                ERP
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap -mt-0.5">
              {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
            </span>
          </div>
        </Link>

        {/* Editorial Desktop Navigation */}
        <nav className="hidden items-center gap-1 lg:flex xl:gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              locale={locale}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100/80 hover:text-slate-950 active:scale-98"
            >
              {isAr ? link.labelAr : link.labelEn}
            </Link>
          ))}
          <Link
            href="/pricing"
            locale={locale}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100/80 hover:text-slate-950 active:scale-98"
          >
            {isAr ? "الأسعار" : "Pricing"}
          </Link>
        </nav>

        {/* Action Controls */}
        <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
          <Link
            href={pathname}
            locale={isAr ? "en" : "ar"}
            className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-white transition-all shadow-2xs active:translate-y-px"
          >
            {isAr ? "English" : "العربية"}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className="text-xs font-bold text-slate-700 hover:text-[#07425d] transition-colors px-2.5 py-1.5 active:translate-y-px"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>

          {/* Button-in-Button CTA Architecture */}
          <Link
            href="/demo"
            locale={locale}
            className="group relative inline-flex items-center gap-2 rounded-xl bg-[#07425d] ps-4 pe-2 py-1.5 text-xs font-bold text-white transition-all hover:bg-[#053247] shadow-xs active:translate-y-px"
          >
            <span>{isAr ? "جرّب العرض الحي" : "Explore Live Demo"}</span>
            <span className="flex size-6 items-center justify-center rounded-lg bg-white/15 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5">
              <ArrowUpRight className="size-3.5" />
            </span>
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs lg:hidden active:scale-95"
        >
          {open ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="mx-auto mt-2 max-w-7xl rounded-2xl border border-slate-200 bg-white/98 p-4 shadow-xl backdrop-blur-xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-1 pb-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                locale={locale}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-[#07425d] transition-colors"
              >
                {isAr ? link.labelAr : link.labelEn}
              </Link>
            ))}
            <Link
              href="/pricing"
              locale={locale}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-[#07425d] transition-colors"
            >
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
          </nav>
          <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={pathname}
                locale={isAr ? "en" : "ar"}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-2 text-center text-xs font-bold text-slate-700"
              >
                {isAr ? "English" : "العربية"}
              </Link>
              <Link
                href="/login"
                locale={locale}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700"
              >
                {isAr ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </div>
            <Link
              href="/demo"
              locale={locale}
              className="group flex items-center justify-center gap-2 rounded-xl bg-[#07425d] py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-[#053247]"
            >
              <span>{isAr ? "جرّب العرض الحي" : "Explore Live Demo"}</span>
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

