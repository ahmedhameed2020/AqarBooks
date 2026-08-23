"use client";

import {
  LayoutDashboard,
  FileText,
  Receipt,
  Landmark,
  Building2,
  FolderOpen,
  UserRound,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Navigation lives in its own client module for one reason: the portal had no
// active-route state at all, so an owner three pages deep had nothing telling
// them where they were. That needs usePathname, which needs a client boundary.
//
// The link table is defined *inside* this "use client" module and only the
// components are exported to the server shell. Exporting the array itself and
// importing it from a Server Component would silently resolve to undefined --
// Next's RSC compiler turns every export of a "use client" module into a
// client reference, data exports included.

interface NavLink {
  href: string;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  titleAr: string;
  titleEn: string;
  links: NavLink[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleAr: "نظرة عامة",
    titleEn: "Overview",
    links: [
      {
        href: "/portal",
        labelAr: "الرئيسية",
        labelEn: "Dashboard",
        descAr: "الملخص المالي",
        descEn: "Financial summary",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    titleAr: "الشؤون المالية",
    titleEn: "Finance",
    links: [
      {
        href: "/portal/statement",
        labelAr: "كشف الحساب",
        labelEn: "Account Statement",
        descAr: "الحركات والرصيد الجاري",
        descEn: "Movements & running balance",
        icon: FileText,
      },
      {
        href: "/portal/dues",
        labelAr: "المستحقات والسداد",
        labelEn: "Dues & Payment",
        descAr: "المطالبات المفتوحة",
        descEn: "Open charges",
        icon: Landmark,
      },
      {
        href: "/portal/payments",
        labelAr: "سجل السندات",
        labelEn: "Receipts",
        descAr: "إيصالات السداد",
        descEn: "Payment receipts",
        icon: Receipt,
      },
    ],
  },
  {
    titleAr: "المحفظة العقارية",
    titleEn: "Portfolio",
    links: [
      {
        href: "/portal/units",
        labelAr: "الوحدات والعقارات",
        labelEn: "Units & Properties",
        descAr: "الأصول ونسب الملكية",
        descEn: "Assets & ownership",
        icon: Building2,
      },
      {
        href: "/portal/documents",
        labelAr: "المستندات",
        labelEn: "Documents",
        descAr: "المرفقات والتقارير",
        descEn: "Files & reports",
        icon: FolderOpen,
      },
    ],
  },
  {
    titleAr: "الحساب",
    titleEn: "Account",
    links: [
      {
        href: "/portal/profile",
        labelAr: "بياناتي",
        labelEn: "My Profile",
        descAr: "البيانات وكلمة المرور",
        descEn: "Details & password",
        icon: UserRound,
      },
    ],
  },
];

// "/portal" must match only itself -- a prefix test would light up the
// dashboard on every child route.
function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
}

export function PortalNav({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const isActive = useIsActive();

  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.titleEn} className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {isAr ? group.titleAr : group.titleEn}
          </p>
          {group.links.map((l) => {
            const Icon = l.icon;
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                locale={locale}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-800 dark:group-hover:bg-slate-700",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{isAr ? l.labelAr : l.labelEn}</span>
                  <span
                    className={cn(
                      "block truncate text-[10px] font-normal",
                      active ? "text-indigo-500/80 dark:text-indigo-400/70" : "text-slate-400",
                    )}
                  >
                    {isAr ? l.descAr : l.descEn}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Small-screen counterpart. Accounting screens are desktop-first, but an owner
 * checking a balance from a phone is the portal's single most likely visit, so
 * every destination stays reachable in one tap rather than behind a menu.
 */
export function PortalMobileNav({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const isActive = useIsActive();
  const links = NAV_GROUPS.flatMap((g) => g.links);

  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-border/70 bg-slate-50 p-2 dark:bg-slate-900/50">
      {links.map((l) => {
        const Icon = l.icon;
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            locale={locale}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-indigo-500/50 bg-indigo-600 text-white"
                : "border-border/60 bg-card text-slate-700 dark:text-slate-300",
            )}
          >
            <Icon className={cn("size-3.5", active ? "text-white" : "text-indigo-500")} />
            <span>{isAr ? l.labelAr : l.labelEn}</span>
          </Link>
        );
      })}
    </div>
  );
}
