"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";
import { Menu, X, ArrowUpRight } from "lucide-react";

const NAV_LINKS = [
  { href: "#story", labelAr: "القصة المالية", labelEn: "The Story" },
  { href: "#engine", labelAr: "المحرك المحاسبي", labelEn: "Accounting Engine" },
  { href: "#follow-money", labelAr: "تتبع الحركة", labelEn: "Follow the Money" },
  { href: "#operating-ledger", labelAr: "سجل التشغيل", labelEn: "Operating Ledger" },
  { href: "#audit", labelAr: "الرقابة والتدقيق", labelEn: "Control & Audit" },
  { href: "#reports", labelAr: "التقارير", labelEn: "Reports" },
  { href: "#ai-layer", labelAr: "طبقة الذكاء", labelEn: "AI Intelligence" },
  { href: "#entities", labelAr: "الهياكل العقارية", labelEn: "Entity Structures" },
] as const;

export function MarketingNav({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-slate-200/90 bg-white/95 backdrop-blur-xl shadow-xs"
          : "border-b border-slate-100/80 bg-white/80 backdrop-blur-md"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-6 transition-all duration-300 ${
          scrolled ? "py-3" : "py-4"
        }`}
      >
        {/* Logo & Brand Identity */}
        <Link href="/" locale={locale} className="flex items-center gap-3 group">
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
        <nav className="hidden items-center gap-5.5 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative text-xs font-bold text-slate-600 transition-colors hover:text-[#07425d] py-1 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-start after:scale-x-0 after:bg-[#07425d] after:transition-transform hover:after:scale-x-100"
            >
              {isAr ? link.labelAr : link.labelEn}
            </a>
          ))}
        </nav>

        {/* Action Controls */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={pathname}
            locale={isAr ? "en" : "ar"}
            className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-white transition-all shadow-2xs"
          >
            {isAr ? "English" : "العربية"}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className="text-xs font-bold text-slate-700 hover:text-[#07425d] transition-colors px-2 py-1.5"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link
            href="/demo"
            locale={locale}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#07425d] text-white px-4.5 py-2 text-xs font-bold transition-all hover:bg-[#053247] active:scale-95 shadow-sm shadow-[#07425d]/20"
          >
            <span>{isAr ? "استكشف النظام" : "Explore ERP"}</span>
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="border-b border-slate-200 bg-white/98 px-6 pt-3 pb-6 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col gap-2.5 pb-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-[#07425d] transition-colors"
              >
                {isAr ? link.labelAr : link.labelEn}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={pathname}
                locale={isAr ? "en" : "ar"}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-center text-xs font-bold text-slate-700"
              >
                {isAr ? "English" : "العربية"}
              </Link>
              <Link
                href="/login"
                locale={locale}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-center text-xs font-bold text-slate-700"
              >
                {isAr ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </div>
            <Link
              href="/demo"
              locale={locale}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#07425d] py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-[#053247]"
            >
              <span>{isAr ? "استكشف النظام" : "Explore ERP"}</span>
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

