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

export const UNIT_TABS = ["overview", "financials", "ownership", "lease", "installments", "activity"] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

const TAB_ICONS: Record<UnitTab, LucideIcon> = {
  overview: LayoutGrid,
  financials: Wallet,
  ownership: Users,
  lease: KeyRound,
  installments: Landmark,
  activity: History,
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
  const panels: Record<UnitTab, React.ReactNode> = { overview, financials, ownership, lease, installments, activity };

  function onValueChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onValueChange}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="w-max min-w-full gap-0.5 rounded-xl border-none bg-muted/50 p-1">
          {UNIT_TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <TabsTrigger
                key={t}
                value={t}
                className="relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-muted-foreground data-active:text-foreground"
              >
                <Icon className="size-3.5" />
                {labels[t]}
              </TabsTrigger>
            );
          })}
          <TabsIndicator className="top-1 bottom-1 h-auto rounded-lg bg-card shadow-xs ring-1 ring-border/60" />
        </TabsList>
      </div>
      {UNIT_TABS.map((t) => (
        <TabsPanel key={t} value={t}>
          {panels[t]}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
