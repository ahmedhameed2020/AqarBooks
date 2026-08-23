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
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  children: React.ReactNode;
}

export function AuthShell({
  brandName = "AqarBooks",
  eyebrow,
  title,
  subtitle,
  locale = "ar",
  maxWidth = "lg",
  children,
}: AuthShellProps) {
  const isAr = locale === "ar";

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
  }[maxWidth];

  return (
    <div
      className="flex min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Visual Brand Side Panel - 38% width on desktop */}
      <div className="relative hidden w-0 lg:block lg:w-[38%] xl:w-[36%] 2xl:w-[34%] shrink-0">
        <Link
          href="/"
          locale={locale as Locale}
          className="absolute inset-0 z-20"
          aria-label={brandName}
        />
        <BrandPanel isAr={isAr} brandName={brandName} />
      </div>

      {/* Spacious Main Working Surface - 62% width on desktop */}
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-5 py-8 sm:px-10 md:px-12 lg:px-14 xl:px-16">
        <div className={`mx-auto w-full ${maxWidthClasses} space-y-6 sm:space-y-8`}>
          {/* Header Section */}
          <div className="space-y-3 text-start">
            <Link
              href="/"
              locale={locale as Locale}
              className="mb-4 inline-flex items-center gap-2.5 lg:hidden"
            >
              <LogoMark className="size-8" />
              <span className="text-lg font-extrabold tracking-tight text-slate-900">
                {brandName}
              </span>
            </Link>

            {eyebrow && (
              <span
                className={`inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-[#1A3C2E] border border-emerald-200/80 ${
                  isAr ? "tracking-[0.02em]" : "uppercase tracking-[0.08em]"
                }`}
                style={{ fontFamily: isAr ? "var(--font-plex-arabic)" : "var(--font-plex-mono)" }}
              >
                {eyebrow}
              </span>
            )}

            <h1 className="text-balance text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl lg:text-[32px]">
              {title}
            </h1>

            {subtitle && (
              <p className="text-pretty text-sm leading-relaxed text-slate-500">{subtitle}</p>
            )}
          </div>

          {/* Form / Wizard Container Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
