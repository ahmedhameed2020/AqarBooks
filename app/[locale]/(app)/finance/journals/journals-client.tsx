"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileText,
  Plus,
  Search,
  Calendar,
  Layers,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  Printer,
  ChevronRight,
  ExternalLink,
  DollarSign,
  Building2,
  ArrowUpRight,
  Brain,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrencyLabel } from "@/lib/currency";
import { generateJournalVoucherPdf } from "@/lib/reports/journal-voucher-pdf";
import { TenantPolicyMemoryDialog } from "@/components/ai/tenant-policy-memory-dialog";

export type JournalEntryItem = {
  id: string;
  entry_number?: string | null;
  entry_date: string;
  description: string;
  status: "DRAFT" | "UNDER_REVIEW" | "POSTED" | "REVERSED" | string;
  source_type: string;
  total_debit: number;
  total_credit: number;
  lines_count: number;
};

export function JournalsClient({
  entries,
  organizationName,
  resortName,
  currency = "EGP",
  locale,
}: {
  entries: JournalEntryItem[];
  organizationName: string;
  resortName?: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "POSTED" | "DRAFT_OR_REVIEW" | "REVERSED">("ALL");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("ALL");
  const [policyMemoryOpen, setPolicyMemoryOpen] = useState(false);

  // Source Types list
  const sourceTypes = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.source_type) set.add(e.source_type);
    });
    return Array.from(set);
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Status filter
      if (statusFilter === "POSTED" && entry.status !== "POSTED") return false;
      if (statusFilter === "DRAFT_OR_REVIEW" && entry.status !== "DRAFT" && entry.status !== "UNDER_REVIEW") return false;
      if (statusFilter === "REVERSED" && entry.status !== "REVERSED") return false;

      // Source type filter
      if (sourceTypeFilter !== "ALL" && entry.source_type !== sourceTypeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (entry.entry_number || "").toLowerCase();
        const desc = (entry.description || "").toLowerCase();
        const date = (entry.entry_date || "").toLowerCase();
        const src = (entry.source_type || "").toLowerCase();
        return num.includes(q) || desc.includes(q) || date.includes(q) || src.includes(q);
      }

      return true;
    });
  }, [entries, statusFilter, sourceTypeFilter, searchQuery]);

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
            placeholder={isAr ? "بحث برقم القيد، البيان، أو التاريخ..." : "Search entries..."}
            className="ps-9 text-xs h-9"
          />
        </div>

        {/* Filters & Action */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {(
              [
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "POSTED", labelAr: "مرحل", labelEn: "Posted" },
                { key: "DRAFT_OR_REVIEW", labelAr: "مسودات ومراجعة", labelEn: "Drafts" },
                { key: "REVERSED", labelAr: "قيود عكسية", labelEn: "Reversed" },
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

          {/* Source Type Filter */}
          {sourceTypes.length > 1 && (
            <Select value={sourceTypeFilter} onValueChange={(val) => setSourceTypeFilter(val ?? "ALL")} items={[{ value: "ALL", label: isAr ? "كل المصادر" : "All Sources" }, ...sourceTypes.map((src) => ({ value: src, label: src })) ]}>
              <SelectTrigger className="w-36 text-xs h-9">
                <SelectValue placeholder={isAr ? "مصدر القيد" : "Source"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{isAr ? "كل المصادر" : "All Sources"}</SelectItem>
                {sourceTypes.map((src) => (
                  <SelectItem key={src} value={src}>
                    {src}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Policy Memory Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setPolicyMemoryOpen(true)}
            className="border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 font-bold text-xs gap-1.5 h-9 shadow-xs cursor-pointer"
          >
            <Brain className="size-3.5 text-purple-600" />
            <span>{isAr ? "ذاكرة السياسات المحاسبية" : "Policy Memory"}</span>
          </Button>

          {/* New Entry Button */}
          <Link href="/finance/journals/new">
            <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 h-9 shadow-sm dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
              <Plus className="size-3.5" />
              <span>{isAr ? "قيد يومية جديد" : "New Journal Entry"}</span>
            </Button>
          </Link>
        </div>
      </div>

      <TenantPolicyMemoryDialog
        open={policyMemoryOpen}
        onOpenChange={setPolicyMemoryOpen}
        organizationId={entries[0]?.id || "org"}
        locale={locale}
      />

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST JOURNAL ENTRIES TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "رقم القيد" : "Entry #"}</th>
                <th className="p-3.5 text-start">{isAr ? "تاريخ القيد" : "Date"}</th>
                <th className="p-3.5 text-start">{isAr ? "المصدر" : "Source"}</th>
                <th className="p-3.5 text-start">{isAr ? "البيان والشرح العام" : "Description / Memo"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي القيد" : "Total Amount"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEntries.length ? (
                filteredEntries.map((entry) => {
                  const isPosted = entry.status === "POSTED";
                  const isDraft = entry.status === "DRAFT";
                  const isUnderReview = entry.status === "UNDER_REVIEW";
                  const isReversed = entry.status === "REVERSED";

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <Link
                          href={`/finance/journals/${entry.id}`}
                          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          <FileText className="size-3.5 text-slate-400 group-hover:text-blue-600" />
                          <span>{entry.entry_number ? `#${entry.entry_number}` : (isAr ? "مسودة" : "Draft")}</span>
                        </Link>
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {entry.entry_date}
                      </td>

                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px] font-mono border-slate-200 dark:border-slate-800">
                          {entry.source_type || "MANUAL"}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-slate-800 dark:text-slate-200 font-medium max-w-xs truncate">
                        {entry.description || "—"}
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {entry.total_debit > 0 ? (
                          <>
                            {entry.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isPosted
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : isDraft
                              ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              : isUnderReview
                              ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {isPosted && (isAr ? "✓ مرحل ومعتمد" : "Posted")}
                          {isDraft && (isAr ? "مسودة" : "Draft")}
                          {isUnderReview && (isAr ? "قيد المراجعة" : "Under Review")}
                          {isReversed && (isAr ? "قيد عكسي" : "Reversed")}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/finance/journals/${entry.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 gap-1"
                            >
                              <span>{isAr ? "عرض" : "View"}</span>
                              <ChevronRight className="size-3 rtl:rotate-180" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد قيود يومية مطابقة لمعايير البحث" : "No journal entries found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
