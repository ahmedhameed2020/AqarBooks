"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Building2, Sparkles, Languages, ArrowRight, ArrowLeft } from "lucide-react";

const NAV_LINKS = [
  { href: "#features", labelAr: "المزايا المحاسبية", labelEn: "Accounting Features" },
  { href: "#entities", labelAr: "الكيانات العقارية", labelEn: "Real Estate Entities" },
  { href: "#accounting-engine", labelAr: "الضرائب والفوترة", labelEn: "Tax & ZATCA" },
  { href: "#pricing", labelAr: "الباقات والأسعار", labelEn: "Pricing" },
  { href: "#faq", labelAr: "الأسئلة الشائعة", labelEn: "FAQ" },
] as const;

export function MarketingNav({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const alternateLocale: Locale = isAr ? "en" : "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <header className="sticky top-0 z-50 px-4 sm:px-6 py-3 transition-all">
      <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-[#070c1e]/85 backdrop-blur-xl px-5 py-3 shadow-2xl shadow-black/40 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link href="/" locale={locale} className="flex items-center gap-3 group">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 transition-transform group-hover:scale-105">
            <Building2 className="size-5.5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-white">
                {isAr ? "عقار بوكس" : "AqarBooks"}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/20">
                FINANCE
              </span>
            </div>
            <span className="text-[9px] font-medium text-slate-400 font-mono tracking-wide">
              {isAr ? "منظومة المحاسبة العقارية المتكاملة" : "Enterprise Real Estate OS"}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              {isAr ? link.labelAr : link.labelEn}
            </a>
          ))}
        </nav>

        {/* Desktop Action Buttons */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Language Switcher */}
          <Link
            href={pathname}
            locale={alternateLocale}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-slate-900/80 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition-all"
          >
            <Languages className="size-3.5 text-blue-400" />
            <span>{isAr ? "English" : "العربية"}</span>
          </Link>

          {/* Sign In Link */}
          <Link
            href="/login"
            locale={locale}
            className="text-xs font-bold text-slate-300 hover:text-white transition-colors px-2"
          >
            {isAr ? "تسجيل الدخول" : "Sign In"}
          </Link>

          {/* Demo CTA */}
          <Link
            href="/demo"
            locale={locale}
            className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <span>{isAr ? "طلب عرض تجريبي" : "Request Demo"}</span>
            <Arrow className="size-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 md:hidden text-slate-300 hover:text-white cursor-pointer"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{isAr ? "القائمة" : "Menu"}</span>
          <div className="flex flex-col gap-1">
            <span className={`h-0.5 w-4 bg-slate-300 transition-transform ${open ? "rotate-45 translate-y-1.5" : ""}`} />
            <span className={`h-0.5 w-4 bg-slate-300 transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`h-0.5 w-4 bg-slate-300 transition-transform ${open ? "-rotate-45 -translate-y-1.5" : ""}`} />
          </div>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {open && (
        <div className="mx-auto max-w-6xl mt-2 rounded-2xl border border-white/10 bg-[#070c1e]/98 p-5 md:hidden backdrop-blur-2xl shadow-2xl space-y-4">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-slate-200 hover:text-blue-400 py-1"
              >
                {isAr ? link.labelAr : link.labelEn}
              </a>
            ))}
            
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <Link 
                href={pathname} 
                locale={alternateLocale} 
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300"
              >
                <Languages className="size-3.5 text-blue-400" />
                <span>{isAr ? "English" : "العربية"}</span>
              </Link>
              
              <Link 
                href="/login" 
                locale={locale} 
                className="text-xs font-bold text-slate-300 hover:text-white"
              >
                {isAr ? "تسجيل الدخول" : "Sign In"}
              </Link>
            </div>

            <Link
              href="/demo"
              locale={locale}
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-center text-xs shadow-md"
            >
              {isAr ? "طلب عرض تجريبي مخصص" : "Request Demo"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
