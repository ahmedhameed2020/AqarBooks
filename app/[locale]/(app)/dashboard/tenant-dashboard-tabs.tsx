"use client";

import { useState } from "react";
import { LayoutDashboard, CheckSquare, Building, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabsProps {
  overviewContent: React.ReactNode;
  tasksContent: React.ReactNode;
  operationsContent: React.ReactNode;
  isAr: boolean;
  unpostedCount: number;
  overdueCount: number;
}

export function TenantDashboardTabs({
  overviewContent,
  tasksContent,
  operationsContent,
  isAr,
  unpostedCount,
  overdueCount,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "operations">("overview");

  const totalUrgent = unpostedCount + overdueCount;

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex space-x-1.5 sm:space-x-2 rtl:space-x-reverse">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold motion-color cursor-pointer press-feedback",
              activeTab === "overview"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <LayoutDashboard className="size-4" />
            <span>{isAr ? "النظرة التنفيذية" : "Executive Overview"}</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold motion-color cursor-pointer press-feedback",
              activeTab === "tasks"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <CheckSquare className="size-4" />
            <span>{isAr ? "المهام والاعتمادات" : "Tasks & Approvals"}</span>
            {totalUrgent > 0 && (
              <span
                className={cn(
                  "ms-1 flex size-5 items-center justify-center rounded-full text-[10px] font-black tabular-nums",
                  activeTab === "tasks"
                    ? "bg-amber-400 text-slate-950"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                )}
              >
                {totalUrgent}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("operations")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold motion-color cursor-pointer press-feedback",
              activeTab === "operations"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Building className="size-4" />
            <span>{isAr ? "التشغيل والوحدات" : "Operations & Units"}</span>
          </button>
        </div>

        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <Building className="size-3.5 text-primary" />
          <span className="font-semibold">{isAr ? "منظومة AqarBooks المحاسبية" : "AqarBooks Financial Suite"}</span>
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "overview" && <div className="space-y-6">{overviewContent}</div>}
        {activeTab === "tasks" && <div className="space-y-6">{tasksContent}</div>}
        {activeTab === "operations" && <div className="space-y-6">{operationsContent}</div>}
      </div>
    </div>
  );
}
