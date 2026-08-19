"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Scale,
  Building2,
  Plus,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ChevronRight,
  Landmark,
  FileSpreadsheet,
  Layers,
  FileCheck,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { CreateStatementDialog, type BankAccountOption } from "./reconciliation-dialogs";

export type StatementRow = {
  id: string;
  bank_account_id: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_name?: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  status: "DRAFT" | "RECONCILED" | string;
  note?: string | null;
};

export function ReconciliationClient({
  statements,
  bankAccounts,
  organizationId,
  canManage,
  currency = "EGP",
  locale,
}: {
  statements: StatementRow[];
  bankAccounts: BankAccountOption[];
  organizationId: string;
  canManage: boolean;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "RECONCILED">("ALL");
  const [createStatementOpen, setCreateStatementOpen] = useState(false);

  // Filtered Statements
  const filteredStatements = useMemo(() => {
    return statements.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const acc = (s.bank_account_name || "").toLowerCase();
        const num = (s.bank_account_number || "").toLowerCase();
        const bank = (s.bank_name || "").toLowerCase();
        const note = (s.note || "").toLowerCase();
        const dates = `${s.period_start} ${s.period_end}`;
        return acc.includes(q) || num.includes(q) || bank.includes(q) || note.includes(q) || dates.includes(q);
      }
      return true;
    });
  }, [statements, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          TOOLBAR & FILTERS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث في كشوف الحسابات..." : "Search statements..."}
            className="ps-9 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
          {/* Status Tabs */}
          <div className="flex items-center gap-1">
            {(
              [
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "DRAFT", labelAr: "قيد المطابقة", labelEn: "In Progress" },
                { key: "RECONCILED", labelAr: "مطابقة ومعتمدة", labelEn: "Reconciled" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === tab.key
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>

          {canManage && (
            <Button
              onClick={() => setCreateStatementOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm ms-auto sm:ms-2"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "إنشاء كشف حساب جديد" : "New Statement"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST STATEMENTS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3 text-start">{isAr ? "الحساب البنكي" : "Bank Account"}</th>
                <th className="p-3 text-start">{isAr ? "فترة كشف الحساب" : "Statement Period"}</th>
                <th className="p-3 text-end">{isAr ? "الرصيد الافتتاحي" : "Opening"}</th>
                <th className="p-3 text-end">{isAr ? "الرصيد الختامي" : "Closing (Bank)"}</th>
                <th className="p-3 text-center">{isAr ? "حالة المطابقة" : "Status"}</th>
                <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStatements.length ? (
                filteredStatements.map((stmt) => {
                  const isReconciled = stmt.status === "RECONCILED";

                  return (
                    <tr
                      key={stmt.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Landmark className="size-4 text-blue-600 shrink-0" />
                          <div>
                            <div className="text-xs font-extrabold">{stmt.bank_account_name || (isAr ? "حساب بنكي" : "Bank Account")}</div>
                            <div className="text-[11px] font-mono text-slate-400 font-normal">
                              {stmt.bank_account_number || ""} {stmt.bank_name ? `(${stmt.bank_name})` : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 font-mono text-[11px]">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold">
                          <Calendar className="size-3 text-slate-400" />
                          <span>{stmt.period_start}</span>
                          <span className="text-slate-400">→</span>
                          <span>{stmt.period_end}</span>
                        </div>
                        {stmt.note && <div className="text-[10px] text-slate-400 font-sans mt-0.5 line-clamp-1">{stmt.note}</div>}
                      </td>

                      <td className="p-3 text-end font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {stmt.opening_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                      </td>

                      <td className="p-3 text-end font-mono font-black text-sm text-blue-700 dark:text-blue-400">
                        {stmt.closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isReconciled
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          {isReconciled ? (isAr ? "✓ مطابَق ومعتمَد" : "Reconciled") : (isAr ? "قيد المطابقة والتسوية" : "In Progress")}
                        </Badge>
                      </td>

                      <td className="p-3 text-end">
                        <Link href={`/finance/banks/reconciliation/${stmt.id}`}>
                          <Button
                            size="sm"
                            className={`h-7 px-3 text-xs font-bold gap-1 shadow-sm ${
                              isReconciled
                                ? "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                            }`}
                          >
                            <Scale className="size-3" />
                            <span>{isReconciled ? (isAr ? "عرض تقرير المطابقة" : "View Statement") : (isAr ? "بدء المطابقة" : "Reconcile")}</span>
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد كشوف حسابات بنكية مطابقة لمعايير البحث" : "No bank statements found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog Modal */}
      <CreateStatementDialog
        open={createStatementOpen}
        onOpenChange={setCreateStatementOpen}
        organizationId={organizationId}
        bankAccounts={bankAccounts}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
