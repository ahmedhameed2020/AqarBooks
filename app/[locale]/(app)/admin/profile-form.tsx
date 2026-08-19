"use client";

import { useState, useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Landmark,
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  DollarSign,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { updateOrganizationProfile } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";

const JURISDICTION_COUNTRY_MAP: Record<
  string,
  {
    nameAr: string;
    nameEn: string;
    flag: string;
    defaultCurrency: string;
    taxAuthorityAr: string;
    taxAuthorityEn: string;
    standardVat: string;
    taxIdHint: string;
  }
> = {
  EG: {
    nameAr: "جمهورية مصر العربية",
    nameEn: "Egypt",
    flag: "🇪🇬",
    defaultCurrency: "EGP",
    taxAuthorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني ETA)",
    taxAuthorityEn: "Egyptian Tax Authority (ETA E-Invoice / E-Receipt)",
    standardVat: "14%",
    taxIdHint: "رقم التسجيل الضريبي المكون من 9 أرقام (مثال: 100-234-567)",
  },
  SA: {
    nameAr: "المملكة العربية السعودية",
    nameEn: "Saudi Arabia",
    flag: "🇸🇦",
    defaultCurrency: "SAR",
    taxAuthorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة ZATCA)",
    taxAuthorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    standardVat: "15%",
    taxIdHint: "الرقم الضريبي الموحد المكون من 15 رقماً (يبدأ بـ 3)",
  },
  AE: {
    nameAr: "دولة الإمارات العربية المتحدة",
    nameEn: "United Arab Emirates",
    flag: "🇦🇪",
    defaultCurrency: "AED",
    taxAuthorityAr: "الهيئة الاتحادية للضرائب (شبكة PEPPOL)",
    taxAuthorityEn: "Federal Tax Authority (PEPPOL Network)",
    standardVat: "5%",
    taxIdHint: "رقم التسجيل الضريبي TRN المكون من 15 رقماً",
  },
};

export function ProfileForm({
  organizationId,
  name,
  defaultCurrency,
  taxJurisdiction,
  taxId,
  address,
  phone,
  email,
  entityType,
  locale,
  readOnly,
}: {
  organizationId: string;
  name: string;
  defaultCurrency: string;
  taxJurisdiction?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  entityType?: string;
  locale: string;
  readOnly: boolean;
}) {
  const isAr = locale === "ar";
  const [selectedCountry, setSelectedCountry] = useState<string>(taxJurisdiction || "EG");
  const [currency, setCurrency] = useState<string>(defaultCurrency || "EGP");
  const [taxNumber, setTaxNumber] = useState<string>(taxId || "");

  // Auto-set currency when country changes
  const handleCountryChange = (countryCode: string) => {
    setSelectedCountry(countryCode);
    const countryInfo = JURISDICTION_COUNTRY_MAP[countryCode];
    if (countryInfo) {
      setCurrency(countryInfo.defaultCurrency);
    }
  };

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOrganizationProfile,
    { ok: true },
  );

  const currentCountry = JURISDICTION_COUNTRY_MAP[selectedCountry] || JURISDICTION_COUNTRY_MAP.EG;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="taxJurisdiction" value={selectedCountry} />

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 1: LEGAL ENTITY INFORMATION
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <Building2 className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "البيانات الأساسية والقانونية للكيان" : "Legal Entity Details"}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {isAr ? "اسم المنشأة، نوع الكيان التجاري، والنشاط الأساسي" : "Organization name, entity type, and core activity"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 text-start">
            <Label htmlFor="name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "اسم المنشأة / الشركة *" : "Organization / Company Name *"}
            </Label>
            <Input
              id="name"
              name="name"
              defaultValue={name}
              disabled={readOnly}
              required
              className="text-sm font-bold"
              placeholder={isAr ? "مثال: شركة النيل لإدارة المنتجعات والتطوير العقاري" : "e.g. Nile Resorts & Property Management"}
            />
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="entityType" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "نوع الكيان ونشاط المنشأة" : "Entity Type & Industry"}
            </Label>
            <Input
              id="entityType"
              name="entityType"
              defaultValue={entityType || ""}
              disabled={readOnly}
              className="text-xs"
              placeholder={isAr ? "مثال: شركة إدارة منتجعات وقرى سياحية / اتحاد شاغلين" : "e.g. Property Management Company"}
            />
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 2: AUTOMATIC TAX BINDING & COUNTRY OF ORIGIN
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 dark:from-purple-950/20 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-100 dark:border-purple-900/40">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm">
              <Landmark className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-950 dark:text-white">
                  {isAr ? "دولة المنشأ والربط الضريبي التلقائي" : "Country of Origin & Automatic Tax Binding"}
                </h2>
                <Badge className="text-[10px] bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 gap-1">
                  <Sparkles className="size-3" />
                  <span>{isAr ? "ربط ذكي فوري" : "Auto-Linked"}</span>
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {isAr
                  ? "تحديد الدولة يربط المنشأة فورياً بمنظومة الفاتورة الإلكترونية والضريبة المناسبة"
                  : "Selecting country automatically sets statutory e-invoice jurisdiction and VAT presets."}
              </p>
            </div>
          </div>
        </div>

        {/* Country Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(JURISDICTION_COUNTRY_MAP).map(([code, info]) => {
            const isSelected = selectedCountry === code;
            return (
              <div
                key={code}
                onClick={() => !readOnly && handleCountryChange(code)}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-purple-600 bg-purple-50/80 dark:bg-purple-950/40 shadow-sm ring-2 ring-purple-500/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{info.flag}</span>
                  {isSelected && (
                    <Badge className="text-[10px] bg-purple-600 text-white font-bold">
                      {isAr ? "الدولة المحددة" : "Selected"}
                    </Badge>
                  )}
                </div>
                <div className="mt-2.5">
                  <div className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? info.nameAr : info.nameEn}
                  </div>
                  <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {isAr ? info.taxAuthorityAr : info.taxAuthorityEn}
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300">
                  <span>{isAr ? "الضريبة القياسية:" : "VAT:"} {info.standardVat}</span>
                  <span className="font-bold text-purple-700 dark:text-purple-300">{info.defaultCurrency}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tax Identity & Currency Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5 text-start">
            <Label htmlFor="taxId" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? `الرقم الضريبي للمنشأة (${currentCountry.flag} ${currentCountry.nameAr}) *` : "Tax ID / TRN *"}
            </Label>
            <Input
              id="taxId"
              name="taxId"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              disabled={readOnly}
              placeholder={currentCountry.taxIdHint}
              dir="ltr"
              className="text-xs font-mono font-bold"
            />
            <p className="text-[10px] text-slate-500">{currentCountry.taxIdHint}</p>
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="defaultCurrency" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "العملة الافتراضية للنظام" : "Default Currency"}
            </Label>
            <Input
              id="defaultCurrency"
              name="defaultCurrency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              disabled={readOnly}
              maxLength={3}
              required
              className="text-xs font-mono font-bold"
              dir="ltr"
            />
            <p className="text-[10px] text-slate-500">
              {isAr ? "تتزامن تلقائياً مع الدولة المحددة ويمكن تعديلها" : "Auto-synced with country selection"}
            </p>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 3: CONTACT & LOCATION DETAILS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <MapPin className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "العنوان والتواصل الرسمي" : "Official Contact & Headquarters"}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {isAr ? "المقر الرئيسي للمنشأة للتواصل والمستندات الرسمية" : "Headquarters address and contact numbers"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 text-start sm:col-span-3">
            <Label htmlFor="address" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "العنوان والمقر الرئيسي" : "Headquarters Address"}
            </Label>
            <Input
              id="address"
              name="address"
              defaultValue={address || ""}
              disabled={readOnly}
              className="text-xs"
              placeholder={isAr ? "مثال: 15 شارع الثورة، مصر الجديدة، القاهرة" : "e.g. 15 El-Thawra St, Heliopolis, Cairo"}
            />
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="phone" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "رقم الهاتف الرسمي" : "Official Phone"}
            </Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={phone || ""}
              disabled={readOnly}
              className="text-xs font-mono"
              dir="ltr"
              placeholder="02..."
            />
          </div>

          <div className="space-y-1.5 text-start sm:col-span-2">
            <Label htmlFor="email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "البريد الإلكتروني الرسمي" : "Official Email"}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={email || ""}
              disabled={readOnly}
              className="text-xs font-mono"
              dir="ltr"
              placeholder="info@company.com"
            />
          </div>
        </div>
      </div>

      {/* State / Errors */}
      {!state.ok && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Save Button */}
      {!readOnly && (
        <div className="flex items-center justify-between pt-2">
          <Button
            type="submit"
            disabled={pending}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black gap-2 h-10 px-6 rounded-xl shadow-sm"
          >
            {pending ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span>{pending ? (isAr ? "جارٍ حفظ الإعدادات والربط…" : "Saving & Syncing…") : isAr ? "حفظ إعدادات الكيان والربط الضريبي" : "Save Settings & Sync Tax"}</span>
          </Button>

          <span className="text-xs text-slate-500">
            {isAr ? "تنعكس البيانات فورياً على الفواتير والمنظومة الضريبية." : "Updates instantly sync with e-invoicing profile."}
          </span>
        </div>
      )}
    </form>
  );
}
