"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";

const NAV_LINKS = [
  { href: "#entities", labelAr: "الكيانات الخمسة", labelEn: "5 Entity Types" },
  { href: "#accounting-engine", labelAr: "المحرك والضرائب", labelEn: "Accounting Engine & VAT" },
  { href: "#features", labelAr: "الموديولات", labelEn: "Modules" },
  { href: "#security", labelAr: "الأمان والتدقيق", labelEn: "Security & Audit" },
  { href: "#pricing", labelAr: "الباقات", labelEn: "Pricing" },
  { href: "#faq", labelAr: "الأسئلة الشائعة", labelEn: "FAQ" },
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
      className={`sticky top-0 z-50 border-b bg-[#060a18]/90 backdrop-blur-xl transition-all duration-300 ${
        scrolled ? "border-[var(--mk-border-strong)] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]" : "border-transparent"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 ${
          scrolled ? "py-2.5" : "py-3.5"
        }`}
      >
        <Link href="/" locale={locale} className="flex items-center gap-2.5 group">
          <LogoMark className="size-9 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-white">
                {isAr ? "عقار بوكس" : "AqarBooks"}
              </span>
              <span className="inline-flex rounded-full bg-purple-500/15 text-purple-300 border border-purple-400/30 text-[9px] font-black px-1.5 py-0.2 shadow-2xs">
                PRO
              </span>
            </div>
            <span
              className="text-[10px] font-bold text-slate-400 whitespace-nowrap tracking-wide -mt-0.5"
            >
              {isAr ? "نـظـام الـمـحـاسـبـة وإدارة الـعـقـارات" : "Real Estate Accounting & Management System"}
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 xl:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative whitespace-nowrap text-xs font-bold text-slate-300 transition-colors hover:text-cyan-300 after:absolute after:inset-x-0 after:-bottom-1.5 after:h-px after:origin-start after:scale-x-0 after:bg-cyan-400 after:transition-transform after:duration-300 after:content-[''] hover:after:scale-x-100"
            >
              {isAr ? link.labelAr : link.labelEn}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3.5 xl:flex">
          <Link
            href={pathname}
            locale={isAr ? "en" : "ar"}
            className="whitespace-nowrap rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-blue-500/50 hover:text-white transition-colors"
          >
            {isAr ? "English" : "العربية"}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className="whitespace-nowrap text-xs font-bold text-slate-300 hover:text-white transition-colors px-2"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link
            href="/demo"
            locale={locale}
            className="glow-btn-primary whitespace-nowrap rounded-xl px-4.5 py-2 text-xs font-bold transition-transform active:scale-95 shadow-md"
          >
            {isAr ? "طلب عرض تجريبي" : "Request a Demo"}
          </Link>
        </div>

        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 xl:hidden"
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
        <div className="border-t border-slate-800 bg-[#070c1e]/98 px-6 py-5 xl:hidden backdrop-blur-2xl shadow-xl">
          <nav className="flex flex-col gap-3.5">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-bold text-slate-200 hover:text-cyan-400"
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

