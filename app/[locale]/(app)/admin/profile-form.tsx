"use client";

import { useState, useEffect, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Landmark,
  ShieldCheck,
  MapPin,
  Save,
  RefreshCw,
  AlertCircle,
  Palette,
  FileText,
  Eye,
  Check,
} from "lucide-react";
import { updateOrganizationProfile } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";
import {
  ProfileForm as EInvoiceProfileForm,
  FilingToggle,
} from "@/app/[locale]/(app)/finance/einvoice/einvoice-forms";

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
    isSupported: boolean;
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
    isSupported: true,
  },
  SA: {
    nameAr: "المملكة العربية السعودية",
    nameEn: "Saudi Arabia",
    flag: "🇸🇦",
    defaultCurrency: "SAR",
    taxAuthorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة ZATCA)",
    taxAuthorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora Phase 2)",
    standardVat: "15%",
    taxIdHint: "الرقم الضريبي الموحد المكون من 15 رقماً (يبدأ بـ 3)",
    isSupported: true,
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
    isSupported: false,
  },
};

const BRAND_PALETTES = [
  { nameAr: "كحلي ملكي", nameEn: "Royal Navy", hex: "#1E1B4B" },
  { nameAr: "بنفسجي عقار بوكس", nameEn: "AqarBooks Purple", hex: "#7C3AED" },
  { nameAr: "أزرق ياقوتي", nameEn: "Sapphire Blue", hex: "#2563EB" },
  { nameAr: "زمردي فاخر", nameEn: "Emerald Green", hex: "#059669" },
  { nameAr: "ذهبي دافئ", nameEn: "Warm Gold", hex: "#B45309" },
  { nameAr: "أسود فاحم", nameEn: "Executive Dark", hex: "#0F172A" },
];

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
  initialBrandColor = "#1E1B4B",
  initialLogoUrl = "",
  initialTagline = "",
  einvoiceProfiles = [],
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
  initialBrandColor?: string;
  initialLogoUrl?: string;
  initialTagline?: string;
  einvoiceProfiles?: any[];
  locale: string;
  readOnly: boolean;
}) {
  const isAr = locale === "ar";
  const [activeTab, setActiveTab] = useState<"GENERAL" | "TAX" | "BRANDING">("GENERAL");
  const [selectedCountry, setSelectedCountry] = useState<string>(
    taxJurisdiction === "SA" ? "SA" : "EG"
  );
  const [currency, setCurrency] = useState<string>(defaultCurrency || "EGP");
  const [taxNumber, setTaxNumber] = useState<string>(taxId || "");
  const [brandColor, setBrandColorState] = useState<string>(initialBrandColor || "#1E1B4B");
  const [logoUrl, setLogoUrlState] = useState<string>(initialLogoUrl || "");
  const [tagline, setTaglineState] = useState<string>(
    initialTagline || (isAr ? "للإدارة والخدمات العقارية المتكاملة" : "Property Management & Financial Services")
  );

  // Sync to local storage for fast client UI persistence if desired
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedColor = localStorage.getItem("aqarbooks_brand_color");
      if (savedColor && !initialBrandColor) setBrandColorState(savedColor);
    }
  }, [initialBrandColor]);

  const setBrandColor = (color: string) => {
    setBrandColorState(color);
    if (typeof window !== "undefined") {
      localStorage.setItem("aqarbooks_brand_color", color);
    }
  };

  const setLogoUrl = (url: string) => {
    setLogoUrlState(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("aqarbooks_logo_url", url);
    }
  };

  const setTagline = (text: string) => {
    setTaglineState(text);
    if (typeof window !== "undefined") {
      localStorage.setItem("aqarbooks_tagline", text);
    }
  };

  const handleCountryChange = (countryCode: string) => {
    if (countryCode === "AE") {
      return; // Handled with informational badge
    }
    setSelectedCountry(countryCode);
    const countryInfo = JURISDICTION_COUNTRY_MAP[countryCode];
    if (countryInfo) {
      setCurrency(countryInfo.defaultCurrency);
    }
  };

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOrganizationProfile,
    { ok: true }
  );

  const currentCountry = JURISDICTION_COUNTRY_MAP[selectedCountry] || JURISDICTION_COUNTRY_MAP.EG;
  const isTaxConfigured = Boolean(taxNumber && taxNumber.trim().length > 3);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="taxJurisdiction" value={selectedCountry} />
      <input type="hidden" name="defaultCurrency" value={currency} />
      <input type="hidden" name="brandColor" value={brandColor} />
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="tagline" value={tagline} />

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN TABS SEGMENTED CONTROL
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("GENERAL")}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "GENERAL"
                ? "bg-white text-slate-950 shadow-xs border border-slate-200/60 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50"
            }`}
          >
            <Building2 className="size-4 text-purple-600 dark:text-purple-400" />
            <span>{isAr ? "بيانات المنشأة والمقر" : "General & HQ"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("TAX")}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "TAX"
                ? "bg-white text-slate-950 shadow-xs border border-slate-200/60 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50"
            }`}
          >
            <Landmark className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>{isAr ? "دولة المنشأ والامتثال الضريبي" : "Tax & Country"}</span>
            {isTaxConfigured ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                ✓
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                {isAr ? "غير مكتمل" : "Incomplete"}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("BRANDING")}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "BRANDING"
                ? "bg-white text-slate-950 shadow-xs border border-slate-200/60 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50"
            }`}
          >
            <Palette className="size-4 text-blue-600 dark:text-blue-400" />
            <span>{isAr ? "الهوية البصرية وأغلفة التقارير" : "Branding & Covers"}</span>
            <span
              className="size-2.5 rounded-full border border-white shadow-2xs shrink-0"
              style={{ background: brandColor }}
            />
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          ERROR ALERT WITH CLEAR ARABIC EXPLANATION
          ────────────────────────────────────────────────────────────────────────── */}
      {state.ok === false && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300 shadow-xs animate-in fade-in duration-200"
        >
          <AlertCircle className="size-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-sm">
              {isAr ? "تعذر حفظ إعدادات المنشأة" : "Failed to update profile"}
            </span>
            <p className="text-red-700 dark:text-red-300 font-normal leading-relaxed">
              {state.error ||
                (isAr
                  ? "يرجى التأكد من صحة البيانات المدخلة واختيار دولة المنشأ المدعومة (مصر أو السعودية)."
                  : "Please verify the submitted details and choose a supported tax jurisdiction (Egypt or Saudi Arabia).")}
            </p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: GENERAL HEADQUARTERS & PROFILE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className={activeTab === "GENERAL" ? "space-y-5" : "hidden"}>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Building2 className="size-4 text-purple-600" />
            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              {isAr ? "البيانات الأساسية للمنشأة" : "Organization Identity"}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-start">
              <Label htmlFor="name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "اسم المنشأة / الشركة *" : "Organization / Company Name *"}
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={name}
                required
                disabled={readOnly}
                className="text-xs font-bold h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label htmlFor="entityType" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "نوع الكيان والنشاط" : "Entity Type & Activity"}
              </Label>
              <select
                id="entityType"
                name="entityType"
                defaultValue={entityType || "FACILITY_MANAGEMENT"}
                disabled={readOnly}
                className="w-full h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-600/30"
              >
                <option value="FACILITY_MANAGEMENT">{isAr ? "شركة إدارة وتشغيل مرافق وأملاك" : "Facility & Property Management"}</option>
                <option value="DEVELOPER">{isAr ? "شركة تطوير واستثمار عقاري" : "Real Estate Developer"}</option>
                <option value="TOURIST_RESORT">{isAr ? "منتجع سياحي وإدارة فندقية" : "Tourist Resort & Hospitality"}</option>
                <option value="TOURIST_VILLAGE">{isAr ? "قرية سياحية / منتجع ساحلي" : "Tourist Village"}</option>
                <option value="RESIDENTIAL_COMPOUND">{isAr ? "مجمع سكني (كمبوند) / إدارة عقارية" : "Residential Compound"}</option>
                <option value="OWNERS_ASSOCIATION">{isAr ? "اتحاد شاغلين / جمعية ملاك" : "Owners Association"}</option>
                <option value="INDIVIDUAL_OWNER">{isAr ? "مالك فردي / محفظة عقارية" : "Individual Owner"}</option>
                <option value="OTHER">{isAr ? "كيان آخر" : "Other"}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <MapPin className="size-4 text-blue-600" />
            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              {isAr ? "العنوان والتواصل الرسمي" : "Official Contact & Headquarters"}
            </h3>
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="address" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "العنوان والمقر الرئيسي" : "Headquarters Address"}
            </Label>
            <Input
              id="address"
              name="address"
              defaultValue={address ?? ""}
              placeholder={isAr ? "مثال: التجمع الخامس، شارع التسعين الشمالي، مبنى 14" : "e.g. 5th Settlement, North 90th St"}
              disabled={readOnly}
              className="text-xs h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-start">
              <Label htmlFor="phone" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "الهاتف الرسمي" : "Official Phone"}
              </Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={phone ?? ""}
                placeholder="+20 100 000 0000"
                dir="ltr"
                disabled={readOnly}
                className="text-xs font-mono h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label htmlFor="email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "البريد الإلكتروني الرسمي" : "Official Email"}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={email ?? ""}
                placeholder="finance@aqarbooks.com"
                dir="ltr"
                disabled={readOnly}
                className="text-xs h-10 rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: COUNTRY OF ORIGIN & TAX COMPLIANCE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className={activeTab === "TAX" ? "space-y-5" : "hidden"}>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white flex items-center gap-2">
              <Landmark className="size-4 text-emerald-600" />
              <span>{isAr ? "اختر دولة المنشأ والمنظومة الضريبية المعتمدة" : "Select Country of Origin & Tax Jurisdiction"}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? "تحديد دولة المنشأ يربط الكيان تلقائياً بالولاية الضريبية المعتمدة، العملة الافتراضية، ونسبة ضريبة القيمة المضافة القياسية."
                : "Selecting country automatically sets currency, statutory tax authority, and standard VAT rate."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
            {Object.entries(JURISDICTION_COUNTRY_MAP).map(([code, info]) => {
              const isSelected = selectedCountry === code;
              const isAvailable = info.isSupported;
              return (
                <div
                  key={code}
                  onClick={() => {
                    if (!readOnly && isAvailable) {
                      handleCountryChange(code);
                    }
                  }}
                  className={`relative rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20 dark:bg-emerald-950/20 shadow-xs cursor-pointer"
                      : isAvailable
                      ? "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                      : "border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 opacity-75 cursor-not-allowed"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{info.flag}</span>
                      {isSelected ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                          {isAr ? "الدولة المعتمدة" : "Active"}
                        </span>
                      ) : !isAvailable ? (
                        <span className="inline-flex items-center rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-400">
                          {isAr ? "الربط قريباً" : "Coming Soon"}
                        </span>
                      ) : null}
                    </div>
                    <h4 className="font-bold text-xs text-slate-950 dark:text-white">
                      {isAr ? info.nameAr : info.nameEn}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {isAr ? info.taxAuthorityAr : info.taxAuthorityEn}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <span>
                      {isAr ? "العملة:" : "Currency:"}{" "}
                      <strong className="text-slate-900 dark:text-white font-mono">{info.defaultCurrency}</strong>
                    </span>
                    <span>
                      {isAr ? "الضريبة:" : "VAT:"}{" "}
                      <strong className="text-emerald-600 font-mono">{info.standardVat}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-black text-slate-950 dark:text-white flex items-center gap-2">
              <ShieldCheck className="size-4 text-purple-600" />
              <span>{isAr ? "الرقم الضريبي وبوابات الربط الإلكتروني (ETA / ZATCA)" : "Tax Identity & Gateway Gateways"}</span>
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Statutory E-Invoicing
            </span>
          </div>

          <div className="space-y-1.5 text-start">
            <Label htmlFor="taxId" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "الرقم الضريبي الرسمي للمنشأة *" : "Official Taxpayer ID *"}
            </Label>
            <Input
              id="taxId"
              name="taxId"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder={currentCountry.taxIdHint}
              dir="ltr"
              disabled={readOnly}
              className="text-xs font-mono font-bold h-10 rounded-xl"
            />
            <p className="text-[11px] text-slate-500">
              {isAr
                ? "يُدرج هذا الرقم رسمياً في ترويسة كافة الفواتير، الإقرارات، والمستندات الضريبية الإلكترونية المرفوعة لمصلحة الضرائب."
                : "Included in invoice headers and statutory filings submitted to the tax authority."}
            </p>
          </div>

          {/* E-INVOICE AUTHORITY GATEWAY CREDENTIALS */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{isAr ? "إعدادات وتفويض بوابات الفاتورة الإلكترونية" : "Filing Gateways & Authority Gateways"}</span>
              </h4>
              <span className="text-[10px] text-slate-400">
                {isAr ? "تشفير AES-256 للبيانات الحساسة" : "AES-256 encrypted"}
              </span>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              {(["EG_ETA", "SA_ZATCA"] as const).map((jur) => {
                const profile = einvoiceProfiles.find((p) => p.jurisdiction === jur) ?? null;
                const isEg = jur.startsWith("EG");
                const isSa = jur.startsWith("SA");
                const flag = isEg ? "🇪🇬" : isSa ? "🇸🇦" : "🇦🇪";
                const title = isEg
                  ? isAr ? "مصلحة الضرائب المصرية (ETA)" : "Egyptian Tax Authority (ETA)"
                  : isSa
                  ? isAr ? "هيئة الزكاة والضريبة والجمارك (ZATCA)" : "ZATCA Fatoora (Saudi Arabia)"
                  : isAr ? "الهيئة الاتحادية للضرائب" : "Federal Tax Authority";

                const label = !profile
                  ? isAr ? "غير مُعد" : "Not configured"
                  : profile.enabled
                  ? isAr ? "مفعّل — الإرسال يعمل" : "Active — filing on"
                  : profile.verified_at
                  ? isAr ? "مُتحقق منه — جاهز للتفعيل" : "Verified — ready"
                  : isAr ? "مُعد — بانتظار التحقق" : "Configured — unverified";

                return (
                  <div
                    key={jur}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-1.5 pb-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{flag}</span>
                        <div>
                          <span className="font-mono text-[11px] font-black text-slate-900 dark:text-white block">
                            {jur}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {title}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          !profile
                            ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                            : profile.enabled
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                            : profile.verified_at
                            ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                            : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                        }`}
                      >
                        {label}
                      </span>
                    </div>

                    {!readOnly ? (
                      <div className="space-y-2.5">
                        <EInvoiceProfileForm
                          key={`${jur}-${profile?.updated_at ?? "new"}`}
                          organizationId={organizationId}
                          jurisdiction={jur}
                          environment={(profile?.environment as "SANDBOX" | "PRODUCTION") ?? "SANDBOX"}
                          taxpayerId={profile?.taxpayer_id ?? null}
                          branchCode={profile?.branch_code ?? null}
                          activityCode={profile?.activity_code ?? null}
                          locale={locale}
                        />
                        {profile && (
                          <FilingToggle
                            profileId={profile.id}
                            enabled={profile.enabled}
                            canEnable={Boolean(profile.verified_at)}
                            locale={locale}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        {isAr ? "للاطلاع فقط (غير مصرح بالتعديل)." : "View only."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: BRAND IDENTITY & PDF COVER PAGE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className={activeTab === "BRANDING" ? "space-y-5" : "hidden"}>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white flex items-center gap-2">
              <Palette className="size-4 text-purple-600" />
              <span>{isAr ? "ألوان البراند والهوية البصرية الرسمية" : "Company Brand Color Palette"}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? "يتم تطبيق هذا اللون في ترويسة التقارير والقوائم المالية، وأغلفة مستندات الـ PDF الرسمية المعتمدة."
                : "Applied across financial statement headers and official PDF report cover pages."}
            </p>
          </div>

          {/* Brand Color Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2">
            {BRAND_PALETTES.map((p) => {
              const isSelected = brandColor.toLowerCase() === p.hex.toLowerCase();
              return (
                <div
                  key={p.hex}
                  onClick={() => setBrandColor(p.hex)}
                  className={`rounded-2xl border p-3 cursor-pointer transition-all flex flex-col items-center gap-2 ${
                    isSelected
                      ? "border-purple-600 ring-2 ring-purple-600/25 bg-purple-50/50 dark:bg-purple-950/20 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div
                    className="size-8 rounded-full shadow-xs flex items-center justify-center text-white transition-transform hover:scale-105"
                    style={{ background: p.hex }}
                  >
                    {isSelected && <Check className="size-4 stroke-[3]" />}
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 dark:text-white text-center">
                    {isAr ? p.nameAr : p.nameEn}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Custom Hex Color */}
          <div className="flex items-center gap-3 pt-2">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "أو اختر لوناً مخصصاً (Hex):" : "Custom Hex Color:"}
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="size-9 rounded-xl cursor-pointer border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800"
              />
              <Input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-28 text-xs font-mono font-bold uppercase h-9 rounded-xl"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FileText className="size-4 text-blue-600" />
            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              {isAr ? "بيانات غلاف التقارير والشعار" : "Report Cover Details & Tagline"}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "رابط الشعار الرسمي (Logo URL)" : "Company Logo URL"}
              </Label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                dir="ltr"
                className="text-xs h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "الشعار اللفظي للكيان (Tagline)" : "Company Slogan / Tagline"}
              </Label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder={isAr ? "مثال: للإدارة والاستثمار العقاري المتكامل" : "e.g. Property Management Services"}
                className="text-xs h-10 rounded-xl"
              />
            </div>
          </div>

          {/* LIVE COVER PREVIEW MINI-CARD */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="size-4 text-purple-600" />
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {isAr ? "معاينة حية لشكل غلاف التقارير المالية المعتمدة:" : "Live Cover Page Preview:"}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-6 max-w-lg mx-auto shadow-md">
              <div className="h-2 rounded-full mb-4" style={{ background: brandColor }} />
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h4 className="font-black text-sm" style={{ color: brandColor }}>
                    {name || (isAr ? "عقار بوكس" : "AqarBooks")}
                  </h4>
                  <p className="text-[10px] text-slate-500">{tagline}</p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[9px] font-bold"
                  style={{ borderColor: brandColor, color: brandColor }}
                >
                  {isAr ? "تقرير مالي رسمي" : "Official Report"}
                </Badge>
              </div>
              <div className="py-6 text-center">
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  {isAr ? "ميزان المراجعة بالمجاميع والأرصدة" : "Trial Balance Statement"}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isAr ? "الفترة المالية النشطة" : "Active Fiscal Period"} · {isAr ? "العملة:" : "Currency:"} {currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-[10px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                <span>
                  {isAr ? "الرقم الضريبي:" : "Tax ID:"}{" "}
                  <strong className="font-mono">{taxNumber || "100-234-567"}</strong>
                </span>
                <span className="text-emerald-600 font-bold">
                  {isAr ? "معتمد ومطابق للمعايير ✓" : "Certified & Compliant ✓"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SUBMIT ACTION BUTTON
          ────────────────────────────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="submit"
            disabled={pending}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2 text-xs h-11 px-6 rounded-xl shadow-sm transition-all active:scale-98 cursor-pointer"
          >
            {pending ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span>{isAr ? "حفظ كافة التغييرات والربط التلقائي" : "Save Settings & Sync"}</span>
          </Button>
        </div>
      )}
    </form>
  );
}

