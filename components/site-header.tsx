"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = useTranslations("app");
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale)!;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-card/95 backdrop-blur-md px-6 shadow-2xs">
      <Link href="/" locale={locale} className="flex items-center gap-2.5 group">
        <span className="flex size-7.5 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-blue-600 text-sm font-extrabold text-white shadow-xs transition-transform group-hover:scale-105">
          A
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-extrabold tracking-tight text-foreground">
            {locale === "ar" ? "عقار بوكس" : "AqarBooks"}
          </span>
          <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 -mt-0.5 font-mono">
            {locale === "ar" ? "نظام المحاسبة العقارية" : "Real Estate Accounting ERP"}
          </span>
        </div>
      </Link>
      <Link
        href={pathname}
        locale={other}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Globe className="size-3.5" />
        {other === "ar" ? "العربية" : "English"}
      </Link>
    </header>
  );
}
