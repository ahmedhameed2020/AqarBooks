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
    <header className="flex items-center justify-between border-b bg-card px-6 py-3.5">
      <Link href="/" locale={locale} className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          R
        </span>
        <span className="text-sm font-semibold tracking-tight">{t("name")}</span>
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
