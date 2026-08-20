import React from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";
import { BrandPanel } from "@/components/auth/brand-panel";

export interface AuthShellProps {
  brandName?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  locale?: string;
  children: React.ReactNode;
}

export function AuthShell({
  brandName = "AqarBooks",
  eyebrow,
  title,
  subtitle,
  locale = "ar",
  children,
}: AuthShellProps) {
  const isAr = locale === "ar";

  return (
    <div
      className="flex min-h-screen bg-white text-slate-900 selection:bg-blue-100 selection:text-blue-900"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="relative hidden w-0 flex-1 lg:block">
        <Link href="/" locale={locale as Locale} className="absolute inset-0 z-20" aria-label={brandName} />
        <BrandPanel isAr={isAr} brandName={brandName} />
      </div>

      {/* Working surface */}
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-5 py-12 sm:px-8 lg:w-[520px] lg:flex-none xl:w-[580px]">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-3 text-start">
            <Link
              href="/"
              locale={locale as Locale}
              className="mb-6 inline-flex items-center gap-2.5 lg:hidden"
            >
              <LogoMark className="size-9" />
              <span className="text-lg font-extrabold tracking-tight text-slate-900">
                {brandName}
              </span>
            </Link>

            {eyebrow && (
              <span
                className={`block text-[11px] font-semibold text-blue-600 ${
                  isAr ? "tracking-[0.02em]" : "uppercase tracking-[0.12em]"
                }`}
                style={{ fontFamily: isAr ? "var(--font-plex-arabic)" : "var(--font-plex-mono)" }}
              >
                {eyebrow}
              </span>
            )}

            <h1 className="text-balance text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[32px]">
              {title}
            </h1>

            {subtitle && (
              <p className="text-pretty text-sm leading-relaxed text-slate-500">{subtitle}</p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
