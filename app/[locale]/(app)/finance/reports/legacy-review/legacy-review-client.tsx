"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface LegacyReviewFinding {
  finding_id: number;
  entry_id: string;
  entry_number: number;
  entry_date: string;
  entry_description: string;
  finding_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  description_amount: number | null;
  posted_amount: number;
  difference: number;
  requested_evidence: string;
  evidence: unknown;
  created_at: string;
}

const money = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export function LegacyReviewClient({
  findings,
  organizationName,
  currency,
  locale,
}: {
  findings: LegacyReviewFinding[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const rows = useMemo(
    () =>
      findings.filter((f) => {
        const q = query.trim().toLowerCase();
        const matchesText =
          !q ||
          String(f.entry_number).includes(q) ||
          f.entry_description.toLowerCase().includes(q) ||
          f.requested_evidence.toLowerCase().includes(q);
        return matchesText && (status === "ALL" || f.status === status);
      }),
    [findings, query, status],
  );

  const openCount = findings.filter((f) => f.status === "OPEN").length;
  const highCount = findings.filter(
    (f) => f.status === "OPEN" && f.severity === "HIGH",
  ).length;
  const totalDifference = findings
    .filter((f) => f.status === "OPEN")
    .reduce((sum, f) => sum + Math.abs(f.difference), 0);
  const exportRows = rows.map((f) => ({
    entry: f.entry_number,
    date: f.entry_date,
    status: f.status,
    severity: f.severity,
    description: f.entry_description,
    stated: f.description_amount ?? 0,
    posted: f.posted_amount,
    difference: f.difference,
    evidence: f.requested_evidence,
  }));

  const handlePdf = () =>
    generateFinancialStatementPdf({
      title: isAr
        ? "سجل مراجعة البيانات المالية القديمة"
        : "Legacy Financial Review Register",
      subtitle: isAr
        ? "استثناءات الترحيل التي تتطلب مستندًا معتمدًا قبل أي تصحيح"
        : "Migration findings requiring approved evidence before correction",
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "القيد" : "Entry", key: "entry", align: "center" },
        { header: isAr ? "التاريخ" : "Date", key: "date", align: "center" },
        {
          header: isAr ? "المذكور" : "Stated",
          key: "stated",
          align: "end",
          isNumber: true,
        },
        {
          header: isAr ? "المرحّل" : "Posted",
          key: "posted",
          align: "end",
          isNumber: true,
        },
        {
          header: isAr ? "الفرق" : "Difference",
          key: "difference",
          align: "end",
          isNumber: true,
        },
        {
          header: isAr ? "المستند المطلوب" : "Evidence Required",
          key: "evidence",
          align: "start",
        },
      ],
      rows: exportRows,
      summaryCards: [
        {
          label: isAr ? "استثناءات مفتوحة" : "Open Findings",
          value: String(openCount),
        },
        {
          label: isAr ? "عالية الخطورة" : "High Severity",
          value: String(highCount),
        },
        {
          label: isAr ? "قيمة الفرق محل الفحص" : "Difference Under Review",
          value: `${money(totalDifference, locale)} ${currencyLabel}`,
        },
      ],
      filename: `Legacy_Financial_Review_${new Date().toISOString().slice(0, 10)}.pdf`,
    });

  const handleExcel = () =>
    exportFinancialStatementToExcel({
      title: isAr
        ? "سجل مراجعة البيانات المالية القديمة"
        : "Legacy Financial Review Register",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "رقم القيد" : "Entry Number", key: "entry" },
        { header: isAr ? "التاريخ" : "Date", key: "date" },
        { header: isAr ? "الحالة" : "Status", key: "status" },
        { header: isAr ? "الخطورة" : "Severity", key: "severity" },
        { header: isAr ? "البيان" : "Description", key: "description" },
        {
          header: isAr ? "المبلغ المذكور" : "Stated Amount",
          key: "stated",
          isNumber: true,
        },
        {
          header: isAr ? "المبلغ المرحّل" : "Posted Amount",
          key: "posted",
          isNumber: true,
        },
        {
          header: isAr ? "الفرق" : "Difference",
          key: "difference",
          isNumber: true,
        },
        {
          header: isAr ? "المستند المطلوب" : "Evidence Required",
          key: "evidence",
        },
      ],
      rows: exportRows,
      filename: `Legacy_Financial_Review_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });

  return (
    <div className="space-y-5 pb-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/finance/reports"
              className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline"
            >
              <ChevronLeft className="size-3.5 rtl:rotate-180" />{" "}
              {isAr ? "مركز التقارير المالية" : "Financial Reports"}
            </Link>
            <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {isAr
                ? "مراجعة البيانات المالية القديمة"
                : "Legacy Financial Review"}
            </h1>
            <p className="mt-1 max-w-3xl text-xs font-medium text-slate-500">
              {isAr
                ? "سجل رقابي للاستثناءات المثبتة أثناء الترحيل. لا يُعدّل أي قيد قبل استلام مستند معتمد ومراجعته."
                : "Controlled migration findings register. No ledger entry is changed before approved evidence is received and reviewed."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExcel} variant="outline" size="sm">
              <FileSpreadsheet className="me-1.5 size-4 text-emerald-600" />
              {isAr ? "تصدير Excel" : "Excel"}
            </Button>
            <Button onClick={handlePdf} variant="outline" size="sm">
              <FileText className="me-1.5 size-4 text-rose-600" />
              {isAr ? "تصدير PDF" : "PDF"}
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            label={isAr ? "الاستثناءات المفتوحة" : "Open Findings"}
            value={String(openCount)}
            tone="rose"
          />
          <Metric
            label={isAr ? "عالية الخطورة" : "High Severity"}
            value={String(highCount)}
            tone="amber"
          />
          <Metric
            label={isAr ? "الفرق محل الفحص" : "Difference Under Review"}
            value={`${money(totalDifference, locale)} ${currencyLabel}`}
            tone="slate"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            {isAr
              ? "هذا السجل للرقابة والمتابعة فقط، وليس سندًا لتغيير القيود أو الملكيات. الحسم يتطلب صورة القيد أو مذكرة تسوية معتمدة."
              : "This register is for control and follow-up only. Corrections require an approved journal document or reconciliation memo."}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row dark:border-slate-800 dark:bg-slate-900">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="ALL">{isAr ? "كل الحالات" : "All statuses"}</option>
          <option value="OPEN">{isAr ? "مفتوح" : "Open"}</option>
          <option value="RESOLVED">{isAr ? "تم الحسم" : "Resolved"}</option>
          <option value="DISMISSED">{isAr ? "مستبعد" : "Dismissed"}</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 ps-9 text-xs"
            placeholder={
              isAr
                ? "بحث برقم القيد أو البيان..."
                : "Search entry or description..."
            }
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-xs">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="p-3 text-start">
                  {isAr ? "القيد والتاريخ" : "Entry / Date"}
                </th>
                <th className="p-3 text-start">
                  {isAr ? "البيان" : "Description"}
                </th>
                <th className="p-3 text-end">{isAr ? "المذكور" : "Stated"}</th>
                <th className="p-3 text-end">{isAr ? "المرحّل" : "Posted"}</th>
                <th className="p-3 text-end">
                  {isAr ? "الفرق" : "Difference"}
                </th>
                <th className="p-3 text-start">
                  {isAr ? "المستند المطلوب" : "Evidence Required"}
                </th>
                <th className="p-3 text-center">
                  {isAr ? "الحالة" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? (
                rows.map((f) => (
                  <tr
                    key={f.finding_id}
                    className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="p-3 font-bold">
                      <div>#{f.entry_number}</div>
                      <div className="mt-1 text-slate-500">{f.entry_date}</div>
                    </td>
                    <td className="max-w-xs p-3 font-medium text-slate-700 dark:text-slate-200">
                      {f.entry_description}
                    </td>
                    <td className="p-3 text-end font-mono">
                      {f.description_amount == null
                        ? "—"
                        : money(f.description_amount, locale)}
                    </td>
                    <td className="p-3 text-end font-mono">
                      {money(f.posted_amount, locale)}
                    </td>
                    <td className="p-3 text-end font-mono font-black text-rose-600">
                      {money(f.difference, locale)}
                    </td>
                    <td className="max-w-sm p-3 font-medium text-amber-800 dark:text-amber-300">
                      {f.requested_evidence}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant="outline"
                        className={
                          f.status === "OPEN"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        <AlertTriangle className="me-1 size-3" />
                        {f.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="p-12 text-center font-bold text-slate-500"
                  >
                    {isAr ? "لا توجد نتائج مطابقة." : "No matching findings."}
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

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber" | "slate";
}) {
  const colors = {
    rose: "text-rose-600",
    amber: "text-amber-600",
    slate: "text-slate-900 dark:text-white",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${colors[tone]}`}>{value}</p>
    </div>
  );
}
