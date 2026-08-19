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
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { getCurrencyLabel } from "@/lib/currency";
import type { Jurisdiction } from "@/lib/einvoice/types";
import {
  deriveProfileState,
  JURISDICTION_LABELS,
  STATE_GUIDANCE,
  STATE_LABELS,
  type EInvoiceProfileState,
} from "@/lib/einvoice/profile-status";
import { FilingToggle, ProfileForm } from "./einvoice-forms";

export type EInvoiceProfileData = {
  id: string;
  jurisdiction: Jurisdiction;
  environment: "SANDBOX" | "PRODUCTION" | string;
  taxpayer_id?: string | null;
  branch_code?: string | null;
  activity_code?: string | null;
  status: string;
  enabled: boolean;
  verified_at?: string | null;
  last_verification_error?: string | null;
  updated_at?: string;
};

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
    digitsHint: string;
  }
> = {
  EG_ETA: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing / E-Receipt)",
    flag: "🇪🇬",
    digitsHint: "رقم التسجيل الضريبي المكون من 9 أرقام (مثال: 100-234-567)",
  },
  SA_ZATCA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    digitsHint: "الرقم الضريبي الموحد المكون من 15 رقماً",
  },
  AE_PEPPOL: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    digitsHint: "رقم التسجيل الضريبي (TRN) المكون من 15 رقماً",
  },
};

export function EInvoiceClient({
  offeredJurisdictions,
  profiles,
  taxDecisions,
  revenueNatures,
  organizationId,
  canManage,
  currency = "EGP",
  locale,
}: {
  offeredJurisdictions: Jurisdiction[];
  profiles: EInvoiceProfileData[];
  taxDecisions: TaxDecisionItem[];
  revenueNatures: RevenueNatureItem[];
  organizationId: string;
  canManage: boolean;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [activeTab, setActiveTab] = useState<"PROFILES" | "DECISIONS" | "NATURES">("PROFILES");
  const [searchQuery, setSearchQuery] = useState("");

  const byJurisdiction = useMemo(() => {
    return new Map(profiles.map((p) => [p.jurisdiction, p]));
  }, [profiles]);

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
          MAIN ACTION TOOLBAR & MODULE TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Module Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("PROFILES")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "PROFILES"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Landmark className="size-3.5" />
            <span>{isAr ? "ملفات الربط الضريبي" : "Tax Authority Profiles"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {offeredJurisdictions.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("DECISIONS")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "DECISIONS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <FileCheck2 className="size-3.5" />
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
            <Scale className="size-3.5" />
            <span>{isAr ? "دليل تصنيفات الإيراد والقواعد" : "Revenue Tax Rules"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {revenueNatures.length}
            </Badge>
          </button>
        </div>

        {/* Search */}
        {(activeTab === "DECISIONS" || activeTab === "NATURES") && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث..." : "Search..."}
              className="ps-9 text-xs h-9"
            />
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: TAX PROFILES & JURISDICTIONS
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "PROFILES" && (
        <div className="space-y-5">
          {/* Security & Verification Banner */}
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/50 p-4 dark:border-blue-900/50 dark:from-blue-950/40 dark:to-slate-900 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <ShieldCheck className="size-5" />
              </div>
              <div className="space-y-1 text-xs">
                <h3 className="font-black text-slate-900 dark:text-white">
                  {isAr
                    ? "منظومة الامتثال للفوترة الإلكترونية والربط الضريبي المباشر"
                    : "Statutory E-Invoicing Compliance & Tax Authority Integration"}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isAr
                    ? "يتولى النظام احتساب الضرائب، ختم القرارات الضريبية بدقة، وتجهيز حزم البيانات بصيغ XML/UBL المتوافقة مع متطلبات مصلحة الضرائب وهيئات الزكاة والضريبة."
                    : "The system stamps tax decisions, computes statutory VAT, and prepares UBL/XML payloads for statutory compliance."}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {offeredJurisdictions.map((jurisdiction) => {
              const profile = byJurisdiction.get(jurisdiction);
              const state = deriveProfileState(profile);
              const info = JURISDICTION_INFO[jurisdiction] || {
                arName: jurisdiction,
                enName: jurisdiction,
                authorityAr: jurisdiction,
                authorityEn: jurisdiction,
                flag: "🌐",
                digitsHint: "",
              };

              const isConfigured = state === "CONFIGURED" || state === "VERIFIED" || state === "ACTIVE";

              return (
                <div
                  key={jurisdiction}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
                >
                  {/* Jurisdiction Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{info.flag}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-black text-slate-950 dark:text-white">
                            {isAr ? info.arName : info.enName}
                          </h2>
                          <Badge
                            className={`text-[10px] font-bold ${
                              state === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                : state === "VERIFIED" || state === "CONFIGURED"
                                ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {isAr ? STATE_LABELS[state].ar : STATE_LABELS[state].en}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {isAr ? info.authorityAr : info.authorityEn}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500">
                      <span className="font-semibold">{isAr ? "بيئة العمل: " : "Env: "}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {profile?.environment || "SANDBOX"}
                      </span>
                    </div>
                  </div>

                  {/* Profile Edit Form */}
                  {canManage ? (
                    <div className="pt-1">
                      <ProfileForm
                        key={`${jurisdiction}-${profile?.updated_at ?? "new"}`}
                        organizationId={organizationId}
                        jurisdiction={jurisdiction}
                        environment={(profile?.environment as "SANDBOX" | "PRODUCTION") ?? "SANDBOX"}
                        taxpayerId={profile?.taxpayer_id ?? null}
                        branchCode={profile?.branch_code ?? null}
                        activityCode={profile?.activity_code ?? null}
                        locale={locale}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                      <div>
                        <span className="text-slate-400 block mb-1">{isAr ? "الرقم الضريبي" : "Tax ID"}</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {profile?.taxpayer_id || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">{isAr ? "كود الفرع" : "Branch Code"}</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">
                          {profile?.branch_code || "0"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">{isAr ? "كود النشاط" : "Activity Code"}</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">
                          {profile?.activity_code || "—"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Automatic Filing Switch */}
                  {canManage && profile && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <FilingToggle
                        profileId={profile.id}
                        enabled={profile.enabled}
                        canEnable={profile.verified_at !== null && profile.status === "ACTIVE"}
                        locale={locale}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: TAX DECISIONS REGISTER
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
          TAB 3: REVENUE TAX NATURES & RULES
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
