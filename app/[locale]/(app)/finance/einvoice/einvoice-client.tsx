"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileCheck2,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Landmark,
  FileText,
  Percent,
  Search,
  Scale,
  RefreshCw,
  Globe,
  Settings,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";

export type TaxDecisionItem = {
  id: string;
  source_type: string;
  source_id: string;
  unit_code?: string;
  nature_name: string;
  taxable_base: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  decided_at: string;
  is_exempt: boolean;
};

export type RevenueNatureItem = {
  code: string;
  name_ar: string;
  name_en: string;
  is_derived: boolean;
  standard_rate?: string;
};

const JURISDICTION_INFO: Record<
  string,
  {
    arName: string;
    enName: string;
    authorityAr: string;
    authorityEn: string;
    flag: string;
    standardVat: string;
  }
> = {
  EG: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing / E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
  },
  EG_ETA: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing / E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
  },
  SA: {
    nameAr: "المملكة العربية السعودية",
    nameEn: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
  },
  SA_ZATCA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
  },
  AE: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
  },
  AE_PEPPOL: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
  },
};

export function EInvoiceClient({
  taxDecisions,
  revenueNatures,
  organizationJurisdiction = "EG",
  organizationTaxId,
  currency = "EGP",
  locale,
}: {
  taxDecisions: TaxDecisionItem[];
  revenueNatures: RevenueNatureItem[];
  organizationJurisdiction?: string;
  organizationTaxId?: string | null;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [activeTab, setActiveTab] = useState<"DECISIONS" | "NATURES">("DECISIONS");
  const [searchQuery, setSearchQuery] = useState("");

  const currentJur = JURISDICTION_INFO[organizationJurisdiction] || JURISDICTION_INFO.EG;

  const filteredDecisions = useMemo(() => {
    if (!searchQuery.trim()) return taxDecisions;
    const q = searchQuery.toLowerCase().trim();
    return taxDecisions.filter(
      (td) =>
        (td.unit_code || "").toLowerCase().includes(q) ||
        td.nature_name.toLowerCase().includes(q) ||
        td.decided_at.includes(q)
    );
  }, [taxDecisions, searchQuery]);

  const filteredNatures = useMemo(() => {
    if (!searchQuery.trim()) return revenueNatures;
    const q = searchQuery.toLowerCase().trim();
    return revenueNatures.filter(
      (n) =>
        n.name_ar.includes(q) ||
        n.name_en.toLowerCase().includes(q) ||
        n.code.toLowerCase().includes(q)
    );
  }, [revenueNatures, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          ACTIVE TAX JURISDICTION COMPLIANCE BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-gradient-to-r from-purple-50/80 via-white to-indigo-50/40 dark:from-purple-950/30 dark:via-slate-900 dark:to-slate-900 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{currentJur.flag}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? currentJur.arName : currentJur.enName} — {isAr ? currentJur.authorityAr : currentJur.authorityEn}
                </h2>
                <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                  {isAr ? "✓ مربوط بإعدادات الكيان" : "Linked via Entity"}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                <span>
                  {isAr ? "الرقم الضريبي للمنشأة: " : "Tax ID: "}
                  <strong className="font-mono text-slate-900 dark:text-white">{organizationTaxId || "—"}</strong>
                </span>
                <span>•</span>
                <span>
                  {isAr ? "الضريبة القياسية: " : "Standard VAT: "}
                  <strong className="text-purple-700 dark:text-purple-300">{currentJur.standardVat}</strong>
                </span>
              </div>
            </div>
          </div>

          <Link href="/admin">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold h-8 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300">
              <Settings className="size-3.5" />
              <span>{isAr ? "إعدادات الربط بالكيان" : "Entity Tax Settings"}</span>
              <ExternalLink className="size-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & MODULE TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Module Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("DECISIONS")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "DECISIONS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <FileCheck2 className="size-3.5 text-blue-600" />
            <span>{isAr ? "سجل القرارات والفواتير الضريبية" : "Tax Decisions Register"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {taxDecisions.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("NATURES")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "NATURES"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Scale className="size-3.5 text-purple-600" />
            <span>{isAr ? "دليل تصنيفات الإيراد والقواعد الضريبية" : "Revenue Tax Rules"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {revenueNatures.length}
            </Badge>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث في القرارات أو التصنيفات..." : "Search decisions or natures..."}
            className="ps-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: TAX DECISIONS REGISTER
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "DECISIONS" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "الوحدة / المستند" : "Unit / Document"}</th>
                  <th className="p-3.5 text-start">{isAr ? "نوع الإيراد الضريبي" : "Revenue Tax Nature"}</th>
                  <th className="p-3.5 text-start">{isAr ? "تاريخ القرار" : "Decision Date"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الوعاء الخاضع (الصافي)" : "Taxable Base"}</th>
                  <th className="p-3.5 text-center">{isAr ? "النسبة" : "Rate"}</th>
                  <th className="p-3.5 text-end">{isAr ? "ضريبة القيمة المضافة" : "VAT Amount"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الإجمالي بالضريبة" : "Gross Total"}</th>
                  <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDecisions.length ? (
                  filteredDecisions.map((td) => (
                    <tr
                      key={td.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <FileCheck2 className="size-3.5 text-blue-600 shrink-0" />
                          <span>{td.unit_code || `#${td.source_id.slice(0, 8)}`}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                        {td.nature_name}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {td.decided_at}
                      </td>

                      <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                        {td.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold">
                        {td.is_exempt ? (
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600">
                            {isAr ? "معفى 0%" : "Exempt"}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                            {td.vat_rate}%
                          </Badge>
                        )}
                      </td>

                      <td className="p-3.5 text-end font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                        {td.vat_amount > 0 ? (
                          <>
                            {td.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {td.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                          {isAr ? "✓ قرار مختوم" : "Stamped"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد قرارات ضريبية مسجلة بعد" : "No tax decisions found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: REVENUE TAX NATURES & RULES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "NATURES" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "كود البند الضريبي" : "Nature Code"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالعربية)" : "Arabic Title"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالإنجليزية)" : "English Title"}</th>
                  <th className="p-3.5 text-center">{isAr ? "نوع التوريد" : "Supply Type"}</th>
                  <th className="p-3.5 text-end">{isAr ? "المعاملة الضريبية المعتمدة" : "Statutory Tax Rule"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredNatures.length ? (
                  filteredNatures.map((n) => (
                    <tr
                      key={n.code}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Scale className="size-3.5 text-slate-400" />
                          <span>{n.code}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {n.name_ar}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                        {n.name_en}
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {n.is_derived ? (isAr ? "مشتق من الأصل" : "Derived") : (isAr ? "توريد مباشر" : "Direct Supply")}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end font-semibold text-slate-800 dark:text-slate-200">
                        {n.code.includes("RESIDENTIAL_RENT") || n.code.includes("RESIDENTIAL_UNIT_SALE") ? (
                          <span className="text-slate-600 dark:text-slate-400 font-bold">
                            {isAr ? "معفى من الضريبة 0%" : "Tax Exempt (0%)"}
                          </span>
                        ) : (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {isAr ? "خاضع بالنسبة الأساسية 14%" : "Standard Rate 14%"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد تصنيفات ضريبية مطابقة" : "No tax natures found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
