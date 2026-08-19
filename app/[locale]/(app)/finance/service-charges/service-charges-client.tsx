"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Layers,
  Plus,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  ChevronRight,
  Scale,
  DollarSign,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { CreateLevyDialog, type Option } from "./service-charges-dialog";

export type LevyItem = {
  id: string;
  name: string;
  property_id: string;
  property_name?: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  allocation_basis: "AREA" | "EQUAL" | "CUSTOM" | string;
  status: "DRAFT" | "ISSUED" | string;
};

const BASIS_MAP: Record<string, { ar: string; en: string }> = {
  AREA: { ar: "بالمساحة (م²)", en: "By Area" },
  EQUAL: { ar: "بالتساوي", en: "Equal Split" },
  CUSTOM: { ar: "أوزان مخصصة", en: "Custom Weights" },
};

export function ServiceChargesClient({
  levies,
  properties,
  dueTypes,
  receivableAccounts,
  organizationId,
  canManage,
  currency = "EGP",
  locale,
}: {
  levies: LevyItem[];
  properties: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  organizationId: string;
  canManage: boolean;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ISSUED" | "DRAFT">("ALL");
  const [createLevyOpen, setCreateLevyOpen] = useState(false);

  // Filtered Levies
  const filteredLevies = useMemo(() => {
    return levies.filter((l) => {
      if (statusFilter === "ISSUED" && l.status !== "ISSUED") return false;
      if (statusFilter === "DRAFT" && l.status !== "DRAFT") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = l.name.toLowerCase();
        const prop = (l.property_name || "").toLowerCase();
        const dates = `${l.period_start} ${l.period_end}`;
        return name.includes(q) || prop.includes(q) || dates.includes(q);
      }

      return true;
    });
  }, [levies, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & FILTERS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث باسم التحصيلة أو العقار..." : "Search levies..."}
            className="ps-9 text-xs h-9"
          />
        </div>

        {/* Filters & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {(
              [
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "ISSUED", labelAr: "صادرة ومعتمدة", labelEn: "Issued" },
                { key: "DRAFT", labelAr: "مسودات", labelEn: "Drafts" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === tab.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>

          {canManage && (
            <Button
              onClick={() => setCreateLevyOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "إنشاء تحصيلة جديدة" : "New Levy"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST LEVIES TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "مسمى التحصيلة" : "Levy Title"}</th>
                <th className="p-3.5 text-start">{isAr ? "المشروع / العقار" : "Property"}</th>
                <th className="p-3.5 text-start">{isAr ? "فترة التغطية" : "Period"}</th>
                <th className="p-3.5 text-start">{isAr ? "أساس التوزيع" : "Allocation Basis"}</th>
                <th className="p-3.5 text-end">{isAr ? "المبلغ الإجمالي" : "Total Amount"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLevies.length ? (
                filteredLevies.map((levy) => {
                  const isIssued = levy.status === "ISSUED";

                  return (
                    <tr
                      key={levy.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <Link
                          href={`/finance/service-charges/${levy.id}`}
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          <Layers className="size-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                          <span>{levy.name}</span>
                        </Link>
                      </td>

                      <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {levy.property_name || "—"}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {levy.period_start} → {levy.period_end}
                      </td>

                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px] font-bold border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                          {isAr ? BASIS_MAP[levy.allocation_basis]?.ar : BASIS_MAP[levy.allocation_basis]?.en}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {levy.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isIssued
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {isIssued ? (isAr ? "✓ صادرة للوحدات" : "Issued") : (isAr ? "مسودة قيد الحساب" : "Draft")}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end">
                        <Link href={`/finance/service-charges/${levy.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs font-bold gap-1 text-slate-700 hover:bg-slate-100 dark:text-slate-300"
                          >
                            <span>{isAr ? "توزيع الأنصبة" : "View Shares"}</span>
                            <ChevronRight className="size-3 rtl:rotate-180" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد تحصيلات رسوم خدمة مطابقة لمعايير البحث" : "No service charge levies found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog Modal */}
      <CreateLevyDialog
        open={createLevyOpen}
        onOpenChange={setCreateLevyOpen}
        organizationId={organizationId}
        properties={properties}
        dueTypes={dueTypes}
        receivableAccounts={receivableAccounts}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
