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
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 dark:border-slate-800">
        <div className="flex space-x-1.5 sm:space-x-2 rtl:space-x-reverse">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 cursor-pointer",
              activeTab === "overview"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/25"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <LayoutDashboard className="size-4" />
            <span>{isAr ? "النظرة التنفيذية" : "Executive Overview"}</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 cursor-pointer",
              activeTab === "tasks"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/25"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
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
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 cursor-pointer",
              activeTab === "operations"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/25"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <Building className="size-4" />
            <span>{isAr ? "التشغيل والوحدات" : "Operations & Units"}</span>
          </button>
        </div>

        <div className="hidden items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 md:flex">
          <Sparkles className="size-3.5 text-purple-600 dark:text-purple-400" />
          <span className="font-bold">{isAr ? "منظومة AqarBooks المحاسبية" : "AqarBooks Financial Suite"}</span>
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
