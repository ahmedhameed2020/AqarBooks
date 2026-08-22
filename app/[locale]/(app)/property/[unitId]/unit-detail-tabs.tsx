"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  Wallet,
  Users,
  KeyRound,
  Landmark,
  History,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

export const UNIT_TABS = [
  "overview",
  "financials",
  "ownership",
  "lease",
  "installments",
  "activity",
] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

const TAB_ICONS: Record<UnitTab, LucideIcon> = {
  overview: LayoutGrid,
  financials: Wallet,
  ownership: Users,
  lease: KeyRound,
  installments: Landmark,
  activity: History,
};

const TAB_ACTIVE_COLORS: Record<UnitTab, string> = {
  overview: "data-active:text-indigo-600 dark:data-active:text-indigo-400",
  financials: "data-active:text-blue-600 dark:data-active:text-blue-400",
  ownership: "data-active:text-violet-600 dark:data-active:text-violet-400",
  lease: "data-active:text-amber-600 dark:data-active:text-amber-400",
  installments: "data-active:text-teal-600 dark:data-active:text-teal-400",
  activity: "data-active:text-rose-600 dark:data-active:text-rose-400",
};

export function resolveTab(raw: string | null | undefined): UnitTab {
  return (UNIT_TABS as readonly string[]).includes(raw ?? "") ? (raw as UnitTab) : "overview";
}

export function UnitDetailTabs({
  labels,
  overview,
  financials,
  ownership,
  lease,
  installments,
  activity,
}: {
  labels: Record<UnitTab, string>;
  overview: React.ReactNode;
  financials: React.ReactNode;
  ownership: React.ReactNode;
  lease: React.ReactNode;
  installments: React.ReactNode;
  activity: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolveTab(searchParams.get("tab"));
  const panels: Record<UnitTab, React.ReactNode> = {
    overview,
    financials,
    ownership,
    lease,
    installments,
    activity,
  };

  function onValueChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onValueChange} className="space-y-6">
      {/* High-Contrast Segmented Capsule Nav */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="w-max min-w-full gap-1 rounded-2xl border border-border/80 bg-slate-100 dark:bg-slate-900/90 p-1.5 shadow-xs">
          {UNIT_TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            const isActive = active === t;
            return (
              <TabsTrigger
                key={t}
                value={t}
                className={`group relative z-10 flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-border/60"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                } ${TAB_ACTIVE_COLORS[t]}`}
              >
                <Icon className={`size-4 transition-transform group-hover:scale-110 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`} />
                <span>{labels[t]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {/* Panels */}
      {UNIT_TABS.map((t) => (
        <TabsPanel key={t} value={t} className="focus:outline-hidden">
          {panels[t]}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
