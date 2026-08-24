"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createResortAction } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";
import {
  Building,
  Building2,
  Home,
  Store,
  Plus,
  Globe2,
  Sparkles,
  MapPin,
  Phone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Layers,
  FileCheck2,
  RefreshCw,
  Clock,
  Compass,
} from "lucide-react";

const ENTITY_TYPES = [
  {
    id: "resort",
    labelAr: "منتجع / قرية سياحية",
    labelEn: "Resort Complex",
    descAr: "شاليهات، قرى ساحلية، ومجمعات سياحية وفندقية",
    descEn: "Coastal villages, chalets, and hospitality resorts",
    codePrefix: "RES",
    icon: Building2,
    activeBorder: "border-primary bg-primary/5 ring-2 ring-primary/20",
    badgeCls: "bg-primary/10 text-primary border-primary/20",
    iconBg: "bg-primary text-primary-foreground",
  },
  {
    id: "building",
    labelAr: "عمارة / برج سكني",
    labelEn: "Residential Tower",
    descAr: "أبراج سكنية، عمارات، شقق واتحادات شاغلين",
    descEn: "Residential towers, apartment blocks & HOAs",
    codePrefix: "TOW",
    icon: Building,
    activeBorder: "border-[#1b60b9] bg-[#1b60b9]/5 ring-2 ring-[#1b60b9]/20",
    badgeCls: "bg-[#1b60b9]/10 text-[#1b60b9] border-[#1b60b9]/20",
    iconBg: "bg-[#1b60b9] text-white",
  },
  {
    id: "residential_unit",
    labelAr: "فيلا / مجمع خاص",
    labelEn: "Private Villa / Compound",
    descAr: "فلل مستقلة، تاون هاوس، ومجمعات سكنية مغلقة",
    descEn: "Standalone villas, townhouses & gated communities",
    codePrefix: "VIL",
    icon: Home,
    activeBorder: "border-emerald-600 bg-emerald-500/5 ring-2 ring-emerald-500/20",
    badgeCls: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
    iconBg: "bg-emerald-600 text-white",
  },
  {
    id: "commercial_unit",
    labelAr: "محل / مركز تجاري",
    labelEn: "Commercial Plaza / Mall",
    descAr: "مولات تجارية، مكاتب إدارية، ومعارض ومحلات",
    descEn: "Retail plazas, office buildings & commercial malls",
    codePrefix: "MAL",
    icon: Store,
    activeBorder: "border-amber-600 bg-amber-500/5 ring-2 ring-amber-500/20",
    badgeCls: "bg-amber-600/10 text-amber-700 border-amber-600/20",
    iconBg: "bg-amber-600 text-white",
  },
] as const;

const TIMEZONES = [
  { value: "Africa/Cairo", flag: "🇪🇬", labelAr: "مصر — القاهرة والإسكندرية", labelEn: "Egypt (Africa/Cairo)" },
  { value: "Asia/Riyadh", flag: "🇸🇦", labelAr: "السعودية — الرياض وجدة ومكة", labelEn: "Saudi Arabia (Asia/Riyadh)" },
  { value: "Asia/Dubai", flag: "🇦🇪", labelAr: "الإمارات — دبي وأبوظبي", labelEn: "UAE (Asia/Dubai)" },
  { value: "Asia/Kuwait", flag: "🇰🇼", labelAr: "الكويت — مدينة الكويت", labelEn: "Kuwait (Asia/Kuwait)" },
  { value: "Asia/Qatar", flag: "🇶🇦", labelAr: "قطر — الدوحة", labelEn: "Qatar (Asia/Qatar)" },
  { value: "Asia/Bahrain", flag: "🇧🇭", labelAr: "البحرين — المنامة", labelEn: "Bahrain (Asia/Bahrain)" },
  { value: "Asia/Muscat", flag: "🇴🇲", labelAr: "عمان — مسقط", labelEn: "Oman (Asia/Muscat)" },
] as const;

const QUICK_LOCATIONS_AR = ["الساحل الشمالي", "التجمع الخامس", "الشيخ زايد", "الجونة / البحر الأحمر", "الرياض", "دبي مارينا"];
const QUICK_LOCATIONS_EN = ["North Coast", "New Cairo", "Sheikh Zayed", "El Gouna", "Riyadh", "Dubai Marina"];

export function CreateResortForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<string>("resort");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await createResortAction(prev, formData);
      if (res.ok) {
        setIsOpen(false);
        setCurrentStep(1);
        setName("");
        setCode("");
        setAddress("");
        setPhone("");
      }
      return res;
    },
    { ok: true },
  );

  const currentTypeObj = ENTITY_TYPES.find((t) => t.id === selectedType) || ENTITY_TYPES[0];

  const handleTypeSelect = (typeId: string) => {
    setSelectedType(typeId);
    const selected = ENTITY_TYPES.find((t) => t.id === typeId);
    if (selected && (!code || ENTITY_TYPES.some((et) => code === `${et.codePrefix}-01`))) {
      setCode(`${selected.codePrefix}-01`);
    }
  };

  const handleNextStep = () => {
    setStepError(null);
    if (currentStep === 1) {
      if (!selectedType) {
        setStepError(isAr ? "يرجى اختيار نوع الكيان العقاري" : "Please select an entity type");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!name.trim()) {
        setStepError(isAr ? "يرجى إدخال اسم الكيان العقاري" : "Please enter the entity name");
        return;
      }
      if (!code.trim()) {
        setStepError(isAr ? "يرجى إدخال الرمز التعريفي المختصر" : "Please enter the entity code");
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    setStepError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs motion-surface">
      {/* ──────────────────────────────────────────────────────────────────────────
          WIZARD HEADER / TRIGGER BAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <Building className="size-5.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                {isAr ? "معالج إضافة الكيانات العقارية" : "Property Entity Setup Wizard"}
              </h2>
              <Badge variant="outline" className="text-[10px] font-bold border-primary/20 bg-primary/5 text-primary">
                {isAr ? "تفاعلي 3 خطوات" : "3-Step Wizard"}
              </Badge>
            </div>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">
              {isAr
                ? "إضافة منتجع سياحي، برج سكني، فيلا، مول تجاري، أو اتحاد ملاك بدقة تنظيمية ومحاسبية"
                : "Register a resort, tower, villa compound, or commercial mall with automated cost center mapping"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => {
            setIsOpen((v) => !v);
            if (!isOpen) setCurrentStep(1);
          }}
          className={`gap-2 font-bold cursor-pointer press-feedback motion-control ${
            isOpen
              ? "bg-muted text-foreground hover:bg-muted/80"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          }`}
          size="sm"
        >
          {isOpen ? (
            <>
              <X className="size-4" />
              <span>{isAr ? "إغلاق المعالج" : "Close Wizard"}</span>
            </>
          ) : (
            <>
              <Plus className="size-4" />
              <span>{isAr ? "إضافة كيان جديد (Wizard)" : "Add New Entity"}</span>
            </>
          )}
        </Button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          INTERACTIVE WIZARD BODY
          ────────────────────────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="mt-6 pt-6 border-t border-border space-y-6">
          {/* STEP PROGRESS BAR & LABELS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-primary flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                <span>
                  {isAr ? `الخطوة ${currentStep} من 3:` : `Step ${currentStep} of 3:`}{" "}
                  {currentStep === 1
                    ? isAr ? "تصنيف ونوع الكيان" : "Classification & Type"
                    : currentStep === 2
                    ? isAr ? "الهوية والبيانات الرسمية" : "Identity & Statutory Code"
                    : isAr ? "الموقع والمعاينة الحية" : "Location & Live Preview"}
                </span>
              </span>
              <span className="font-mono text-muted-foreground">
                {currentStep === 1 ? "33%" : currentStep === 2 ? "66%" : "100%"}
              </span>
            </div>

            {/* Stepper Track */}
            <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: currentStep === 1 ? "33%" : currentStep === 2 ? "66%" : "100%" }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className={`text-start transition-colors cursor-pointer ${currentStep === 1 ? "text-primary font-black" : "text-muted-foreground"}`}
              >
                1. {isAr ? "نوع الكيان" : "Type"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedType) setCurrentStep(2);
                }}
                className={`text-center transition-colors cursor-pointer ${currentStep === 2 ? "text-primary font-black" : "text-muted-foreground"}`}
              >
                2. {isAr ? "الهوية والرمز" : "Identity & Code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (name.trim() && code.trim()) setCurrentStep(3);
                }}
                className={`text-end transition-colors cursor-pointer ${currentStep === 3 ? "text-primary font-black" : "text-muted-foreground"}`}
              >
                3. {isAr ? "الموقع والمراجعة" : "Review & Confirm"}
              </button>
            </div>
          </div>

          <form action={formAction} className="space-y-6">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="propertyType" value={selectedType} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="timezone" value={timezone} />
            <input type="hidden" name="address" value={address} />
            <input type="hidden" name="phone" value={phone} />

            {/* ══════════════════════════════════════════════════════════════════
                STEP 1: ENTITY CLASSIFICATION
                ══════════════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                    <Layers className="size-4 text-primary" />
                    <span>{isAr ? "اختر تصنيف ونوع الكيان العقاري" : "Select Property Entity Classification"}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "يساعد تحديد النوع على تخصيص شجرة الحسابات ومراكز التكلفة والتقارير المالية تلقائياً."
                      : "Helps automate chart of accounts, operational rules, and occupancy tracking."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {ENTITY_TYPES.map((t) => {
                    const Icon = t.icon;
                    const isCurrent = selectedType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTypeSelect(t.id)}
                        className={`group relative flex items-start gap-3.5 p-4.5 rounded-2xl border text-start transition-all cursor-pointer press-feedback motion-control ${
                          isCurrent
                            ? `${t.activeBorder} shadow-xs`
                            : "border-border bg-card hover:bg-muted/50"
                        }`}
                      >
                        <div
                          className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                            isCurrent ? t.iconBg : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="size-5.5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs sm:text-sm font-black text-foreground">
                              {isAr ? t.labelAr : t.labelEn}
                            </span>
                            {isCurrent && (
                              <CheckCircle2 className="size-4 shrink-0 text-primary" />
                            )}
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {isAr ? t.descAr : t.descEn}
                          </p>
                          <div className="pt-1">
                            <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                              Prefix: {t.codePrefix}-*
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 2: IDENTITY & STATUTORY CODE
                ══════════════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                    <FileCheck2 className="size-4 text-primary" />
                    <span>{isAr ? "الهوية والبيانات الرسمية للكيان" : "Identity & Statutory Details"}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "أدخل الاسم الرسمي المعتمد والرمز المختصر لإظهاره في الفواتير وسندات القبض."
                      : "Enter formal entity name, accounting code, and country timezone."}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-foreground">
                      {isAr ? "اسم الكيان العقاري" : "Entity Name"} <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={
                        selectedType === "resort"
                          ? isAr ? "مثال: قرية لاجونا باي، منتجع سيسيليا الساحلي" : "e.g. Laguna Bay Resort"
                          : selectedType === "building"
                          ? isAr ? "مثال: برج الزمرد السكني، عمارة النرجس 12" : "e.g. Emerald Residence Tower"
                          : selectedType === "commercial_unit"
                          ? isAr ? "مثال: بوليفارد بلازا مول، سنترال بوينت الإداري" : "e.g. Boulevard Plaza Mall"
                          : isAr ? "مثال: كمبوند الياسمين، فيلا روفانا الخاصة" : "e.g. Jasmine Private Villa"
                      }
                      className="h-10 text-xs font-bold bg-background border-border focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-foreground">
                        {isAr ? "الرمز التعريفي المختصر" : "Entity Code"} <span className="text-rose-500">*</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {isAr ? "يظهر في قيود اليومية" : "Journal Prefix"}
                      </span>
                    </div>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. RES-01, TOW-01"
                      className="h-10 text-xs font-bold font-mono uppercase bg-background border-border focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">
                      {isAr ? "الدولة والمنطقة الزمنية" : "Jurisdiction & Timezone"} <span className="text-rose-500">*</span>
                    </Label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.flag} {isAr ? tz.labelAr : tz.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 3: LOCATION & LIVE PREVIEW
                ══════════════════════════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                    <Compass className="size-4 text-primary" />
                    <span>{isAr ? "الموقع الجغرافي والمراجعة النهائية" : "Location & Final Review"}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "راجع بطاقة الكيان العقاري قبل التثبيت النهائي في الدفاتر المحاسبية."
                      : "Verify live entity card preview before committing to accounting ledger."}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-primary" />
                      <span>{isAr ? "المدينة أو العنوان التفصيلي" : "City / Detailed Address"}</span>
                    </Label>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isAr ? "مثال: الساحل الشمالي، الكيلو 120" : "e.g. North Coast, KM 120"}
                      className="h-10 text-xs bg-background border-border focus:ring-2 focus:ring-primary"
                    />

                    {/* Quick location presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-muted-foreground font-medium">{isAr ? "اقتراحات:" : "Quick:"}</span>
                      {(isAr ? QUICK_LOCATIONS_AR : QUICK_LOCATIONS_EN).map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setAddress(loc)}
                          className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Phone className="size-3.5 text-primary" />
                      <span>{isAr ? "هاتف الإدارة أو خدمة العملاء" : "Management Phone"}</span>
                    </Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={isAr ? "مثال: +20 10... أو +966 5..." : "+20... or +966..."}
                      className="h-10 text-xs font-mono bg-background border-border focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* ────────────────────────────────────────────────────────────────
                    LIVE INTERACTIVE IDENTITY CARD (PREVIEW)
                    ──────────────────────────────────────────────────────────────── */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4.5 space-y-3 motion-surface">
                  <div className="flex items-center justify-between border-b border-primary/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-xs font-black text-primary">
                        {isAr ? "المعاينة الحية للكيان (Live Entity Card Preview)" : "Live Entity Card Preview"}
                      </span>
                    </div>
                    <Badge className={currentTypeObj.badgeCls}>
                      {isAr ? currentTypeObj.labelAr : currentTypeObj.labelEn}
                    </Badge>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${currentTypeObj.iconBg} shadow-xs`}>
                        <currentTypeObj.icon className="size-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-foreground">
                          {name || (isAr ? "اسم الكيان الجديد..." : "New Entity Name...")}
                        </h4>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="font-mono font-bold text-primary">{code || "CODE-01"}</span>
                          <span>•</span>
                          <span>{address || (isAr ? "العنوان غير محدد" : "Address not specified")}</span>
                          {phone && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{phone}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="text-start sm:text-end text-[11px] text-muted-foreground">
                      <span className="block font-medium">{isAr ? "المنطقة الزمنية:" : "Timezone:"}</span>
                      <span className="font-bold text-foreground">{timezone}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ERROR ALERTS */}
            {(stepError || !state.ok) && (
              <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                {stepError || (!state.ok ? state.error : null)}
              </p>
            )}

            {/* WIZARD NAVIGATION TOOLBAR */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePrevStep}
                    className="text-xs font-bold gap-1.5 rounded-xl border-border hover:bg-muted text-foreground press-feedback motion-control cursor-pointer"
                  >
                    {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
                    <span>{isAr ? "السابق" : "Previous"}</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-bold rounded-xl border-border hover:bg-muted text-foreground press-feedback motion-control cursor-pointer"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>

                {currentStep < 3 ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleNextStep}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold h-9 px-5 gap-1.5 rounded-xl shadow-xs press-feedback motion-control cursor-pointer"
                  >
                    <span>{isAr ? "التالي: بيانات الكيان" : "Next Step"}</span>
                    {isAr ? <ArrowLeft className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={pending || !name.trim() || !code.trim()}
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black h-9 px-6 gap-1.5 rounded-xl shadow-xs press-feedback motion-control cursor-pointer"
                  >
                    {pending ? (
                      <>
                        <RefreshCw className="size-3.5 animate-spin" />
                        <span>{isAr ? "جارٍ الحفظ والتهيئة..." : "Registering..."}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-4" />
                        <span>{isAr ? "تأكيد وتثبيت الكيان العقاري" : "Confirm & Register Entity"}</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
