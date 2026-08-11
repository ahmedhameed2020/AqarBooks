"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const NAV_LINKS = [
  { href: "#platform", labelAr: "المنصة", labelEn: "Platform" },
  { href: "#accounting", labelAr: "المحاسبة", labelEn: "Accounting" },
  { href: "#security", labelAr: "الأمان", labelEn: "Security" },
  { href: "#pricing", labelAr: "الباقات", labelEn: "Pricing" },
  { href: "#faq", labelAr: "الأسئلة الشائعة", labelEn: "FAQ" },
] as const;

export function MarketingNav({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mk-border)] bg-[var(--mk-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" locale={locale} className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-[var(--mk-accent)] text-sm font-bold text-[var(--mk-bg)]">
            R
          </span>
          <span className="text-sm font-semibold tracking-tight text-[var(--mk-text)]">RESORTOS</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--mk-text-muted)] transition-colors hover:text-[var(--mk-text)]"
            >
              {isAr ? link.labelAr : link.labelEn}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={pathname}
            locale={isAr ? "en" : "ar"}
            className="text-sm text-[var(--mk-text-muted)] hover:text-[var(--mk-text)]"
          >
            {isAr ? "English" : "العربية"}
          </Link>
          <Link
            href="/login"
            locale={locale}
            className="text-sm text-[var(--mk-text-muted)] hover:text-[var(--mk-text)]"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link
            href="/demo"
            locale={locale}
            className="rounded-md bg-[var(--mk-accent)] px-4 py-2 text-sm font-medium text-[var(--mk-bg)] transition-opacity hover:opacity-90"
          >
            {isAr ? "طلب عرض توضيحي" : "Request a Demo"}
          </Link>
        </div>

        <button
          type="button"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-md border border-[var(--mk-border-strong)] md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{isAr ? "القائمة" : "Menu"}</span>
          <div className="flex flex-col gap-1">
            <span className="h-px w-4 bg-[var(--mk-text)]" />
            <span className="h-px w-4 bg-[var(--mk-text)]" />
            <span className="h-px w-4 bg-[var(--mk-text)]" />
          </div>
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--mk-border)] px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm text-[var(--mk-text-muted)]"
              >
                {isAr ? link.labelAr : link.labelEn}
              </a>
            ))}
            <div className="flex items-center gap-4 border-t border-[var(--mk-border)] pt-4">
              <Link href={pathname} locale={isAr ? "en" : "ar"} className="text-sm text-[var(--mk-text-muted)]">
                {isAr ? "English" : "العربية"}
              </Link>
              <Link href="/login" locale={locale} className="text-sm text-[var(--mk-text-muted)]">
                {isAr ? "تسجيل الدخول" : "Sign in"}
              </Link>
            </div>
            <Link
              href="/demo"
              locale={locale}
              className="rounded-md bg-[var(--mk-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--mk-bg)]"
            >
              {isAr ? "طلب عرض توضيحي" : "Request a Demo"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
