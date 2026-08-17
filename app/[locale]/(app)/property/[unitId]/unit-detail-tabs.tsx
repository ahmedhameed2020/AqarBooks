"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

export const UNIT_TABS = ["overview", "financials", "ownership", "lease", "activity"] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

export function resolveTab(raw: string | null | undefined): UnitTab {
  return (UNIT_TABS as readonly string[]).includes(raw ?? "") ? (raw as UnitTab) : "overview";
}

export function UnitDetailTabs({
  labels,
  overview,
  financials,
  ownership,
  lease,
  activity,
}: {
  labels: Record<UnitTab, string>;
  overview: React.ReactNode;
  financials: React.ReactNode;
  ownership: React.ReactNode;
  lease: React.ReactNode;
  activity: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolveTab(searchParams.get("tab"));
  const panels: Record<UnitTab, React.ReactNode> = { overview, financials, ownership, lease, activity };

  function onValueChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onValueChange}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="w-max min-w-full">
          {UNIT_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="whitespace-nowrap">
              {labels[t]}
            </TabsTrigger>
          ))}
          <TabsIndicator />
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
