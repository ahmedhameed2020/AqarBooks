"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Search, X, Filter, UserCheck, AlertCircle, Sparkles, Printer, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportMembersCsvAction } from "@/lib/actions/members-export";
import { useMembersNav } from "./members-nav-context";
import { buildMembersCsv, buildMembersXlsxBuffer, downloadCsv, downloadXlsxBuffer } from "./csv";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { useDemoMode } from "@/components/demo/demo-mode-context";
import { demoExportNotice } from "@/lib/demo/export-notice";

const ALL = "__all__";

export function MembersFilters({
  locale,
  organizationName = "AqarBooks",
  currency = "EGP",
}: {
  locale: string;
  organizationName?: string;
  currency?: string;
}) {
  const isAr = locale === "ar";

  // Demo exports carry a label and a filename prefix (spec §28). The flag is
  // presentation only -- it decides whether a spreadsheet says it is
  // fictional, and authorises nothing.
  const isDemo = useDemoMode();
  const notice = demoExportNotice(isDemo, isAr);
  const filePrefix = isDemo ? "DEMO-" : "";
  const { get, pushParams } = useMembersNav();
  const q = get("q");
  const ownership = get("ownership");
  const arrears = get("arrears");

  const [qDraft, setQDraft] = useState(q ?? "");
  const firstRender = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => pushParams({ q: qDraft || undefined, page: undefined }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const chips: { key: string; label: string }[] = [];
  if (q) chips.push({ key: "q", label: isAr ? `بحث: ${q}` : `Search: ${q}` });
  if (ownership === "owns") chips.push({ key: "ownership", label: isAr ? "يملكون وحدات" : "Owns units" });
  if (ownership === "none") chips.push({ key: "ownership", label: isAr ? "لا يملكون وحدات" : "Owns none" });
  if (arrears === "1") chips.push({ key: "arrears", label: isAr ? "عليهم متأخرات" : "Has arrears" });

  function removeChip(key: string) {
    if (key === "q") setQDraft("");
    pushParams({ [key]: undefined, page: undefined });
  }

  async function handleExportExcel() {
    startExport(async () => {
      const rows = await exportMembersCsvAction({ q, ownership, arrears });
      const buffer = await buildMembersXlsxBuffer(rows, isAr, notice);
      downloadXlsxBuffer(`Members_Owners_${new Date().toISOString().slice(0, 10)}.xlsx`, buffer);
    });
  }

  async function handleExportPdf() {
    startExport(async () => {
      const rows = await exportMembersCsvAction({ q, ownership, arrears });
      const totalBalance = rows.reduce((s, r) => s + (r.total_balance || 0), 0);
      const withArrears = rows.filter((r) => r.has_arrears).length;

      generateFinancialStatementPdf(
        {
          title: isAr ? "سجل الملاك والمستأجرين والأعضاء" : "Members & Owners Directory",
          subtitle: isAr
            ? "كشف ببيانات الأعضاء والملاك، عدد الوحدات المملوكة، والأرصدة والذمم المالية"
            : "Directory of members, owned property units, and financial balances",
          organizationName,
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "الاسم الكامل" : "Full Name", key: "name", align: "start", width: "26%" },
            { header: isAr ? "البريد الإلكتروني" : "Email", key: "email", align: "start", width: "22%" },
            { header: isAr ? "رقم الهاتف" : "Phone", key: "phone", align: "center", width: "16%" },
            { header: isAr ? "الوحدات" : "Units", key: "units", align: "center", isNumber: true, width: "10%" },
            { header: isAr ? "الرصيد المالي" : "Balance", key: "balance", align: "end", isNumber: true, width: "16%" },
            { header: isAr ? "الحالة" : "Status", key: "status", align: "center", width: "10%" },
          ],
          rows: rows.map((r) => ({
            name: r.full_name,
            email: r.email || "—",
            phone: r.phone || "—",
            units: r.units_count,
            balance: r.total_balance,
            status: r.has_arrears ? (isAr ? "متأخر" : "Arrears") : isAr ? "منتظم" : "Current",
          })),
          totalRow: {
            name: isAr ? "الإجمالي" : "Total",
            email: "",
            phone: "",
            units: rows.reduce((s, r) => s + (r.units_count || 0), 0),
            balance: totalBalance,
            status: "",
          },
          summaryCards: [
            { label: isAr ? "إجمالي الأعضاء" : "Total Members", value: rows.length },
            { label: isAr ? "عليهم متأخرات" : "With Arrears", value: withArrears },
            {
              label: isAr ? "إجمالي الأرصدة القائمة" : "Total Outstanding",
              value: `${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
              highlight: true,
            },
          ],
          includeCoverPage: false,
        },
        locale
      );
    });
  }

  return (
    <div className="space-y-2.5 p-4 rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* SEARCH INPUT */}
          <div className="relative max-w-sm w-full">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              ref={inputRef}
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder={isAr ? "بحث سريع بالاسم، الهاتف، أو البريد… (/)" : "Search by name, phone, or email… (/)"}
              className="w-full ps-9 h-10 text-xs font-bold rounded-xl bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
            />
          </div>

          {/* OWNERSHIP FILTER */}
          <Select
            value={ownership || undefined}
            onValueChange={(v) => pushParams({ ownership: (v === ALL ? undefined : v) as any, page: undefined })}
          >
            <SelectTrigger className="w-40 h-10 text-xs font-bold rounded-xl bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              <SelectValue placeholder={isAr ? "حالة الملكية" : "Ownership"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{isAr ? "الكل (ملاك وغيرهم)" : "All Members"}</SelectItem>
              <SelectItem value="owns">{isAr ? "يملكون وحدات" : "Owns Units"}</SelectItem>
              <SelectItem value="none">{isAr ? "بدون وحدات" : "No Units"}</SelectItem>
            </SelectContent>
          </Select>

          {/* ARREARS QUICK BUTTON */}
          <button
            type="button"
            onClick={() => pushParams({ arrears: arrears === "1" ? undefined : "1", page: undefined })}
            className={`flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              arrears === "1"
                ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 shadow-xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            <AlertCircle className="size-3.5 text-rose-600" />
            <span>{isAr ? "عليهم متأخرات فقط" : "Arrears Only"}</span>
          </button>
        </div>

        {/* EXPORT BUTTONS (PDF + EXCEL) */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={exporting}
            className="h-10 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 gap-1.5 cursor-pointer"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{exporting ? (isAr ? "جارٍ التوليد…" : "Generating…") : isAr ? "طباعة / PDF" : "Print / PDF"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={exporting}
            className="h-10 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 gap-1.5 cursor-pointer"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{exporting ? (isAr ? "جارٍ التصدير…" : "Exporting…") : isAr ? "تصدير Excel" : "Export Excel"}</span>
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 ps-2.5 pe-1.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={() => removeChip(chip.key)}
                className="rounded-md p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 cursor-pointer"
                aria-label={isAr ? "إزالة الفلتر" : "Remove filter"}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="link"
            size="sm"
            className="h-6 px-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
            onClick={() => { setQDraft(""); pushParams({ q: undefined, ownership: undefined, arrears: undefined, page: undefined }); }}
          >
            {isAr ? "مسح جميع الفلاتر" : "Clear all"}
          </Button>
        </div>
      )}
    </div>
  );
}
