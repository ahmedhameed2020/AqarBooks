"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ShieldCheck,
  ChevronDown,
  MapPin,
  Phone,
  CheckCircle2,
} from "lucide-react";

const ENTITY_TYPES = [
  {
    id: "resort",
    labelAr: "منتجع / قرية سياحية",
    labelEn: "Resort Complex",
    icon: Building2,
    activeCls: "bg-primary text-primary-foreground border-primary shadow-xs",
    idleCls: "bg-card hover:bg-muted text-foreground border-border",
    iconColor: "text-primary",
  },
  {
    id: "building",
    labelAr: "عمارة / برج سكني",
    labelEn: "Residential Tower",
    icon: Building,
    activeCls: "bg-[#1b60b9] text-white border-[#1b60b9] shadow-xs",
    idleCls: "bg-card hover:bg-muted text-foreground border-border",
    iconColor: "text-[#1b60b9]",
  },
  {
    id: "residential_unit",
    labelAr: "فيلا / وحدة خاصة",
    labelEn: "Private Villa",
    icon: Home,
    activeCls: "bg-emerald-600 text-white border-emerald-600 shadow-xs",
    idleCls: "bg-card hover:bg-muted text-foreground border-border",
    iconColor: "text-emerald-600",
  },
  {
    id: "commercial_unit",
    labelAr: "محل / مركز تجاري",
    labelEn: "Commercial Retail",
    icon: Store,
    activeCls: "bg-amber-600 text-white border-amber-600 shadow-xs",
    idleCls: "bg-card hover:bg-muted text-foreground border-border",
    iconColor: "text-amber-600",
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

export function CreateResortForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("resort");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await createResortAction(prev, formData);
      if (res.ok) {
        setIsOpen(false);
      }
      return res;
    },
    { ok: true },
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Building className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-foreground">
              {isAr ? "إضافة كيان عقاري جديد" : "Register New Property Entity"}
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              {isAr
                ? "إضافة قرية سياحية، برج سكني، فيلا خاصة، مول تجاري، أو اتحاد ملاك"
                : "Add a resort, residential tower, private villa, commercial mall, or HOA entity"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={`gap-2 font-bold cursor-pointer press-feedback motion-control ${
            isOpen
              ? "bg-muted text-foreground hover:bg-muted/80"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
          }`}
          size="sm"
        >
          {isOpen ? (
            <span>{isAr ? "إغلاق النموذج" : "Close Form"}</span>
          ) : (
            <>
              <Plus className="size-4" />
              <span>{isAr ? "إضافة كيان جديد" : "Add New Entity"}</span>
            </>
          )}
        </Button>
      </div>

      {isOpen && (
        <form action={formAction} className="mt-6 border-t border-slate-200/80 pt-6 space-y-5 dark:border-slate-800">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="propertyType" value={selectedType} />

          {/* 1. Entity Type Selection (Visual Cards) */}
          <div className="space-y-2.5">
            <Label className="text-xs font-extrabold text-slate-900 dark:text-white">
              {isAr ? "اختر تصنيف ونوع الكيان العقاري:" : "Select Property Entity Type:"}
            </Label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ENTITY_TYPES.map((t) => {
                const Icon = t.icon;
                const isCurrent = selectedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.id)}
                    className={`flex items-center justify-between rounded-xl border p-3.5 text-start transition-all cursor-pointer ${
                      isCurrent ? t.activeCls : t.idleCls
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`size-4.5 shrink-0 ${isCurrent ? "text-white" : t.iconColor}`} />
                      <span className="text-xs font-bold truncate">{isAr ? t.labelAr : t.labelEn}</span>
                    </div>
                    {isCurrent && <CheckCircle2 className="size-4 shrink-0 text-white ms-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Main Details Grid */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "اسم الكيان العقاري" : "Entity Name"} <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                required
                placeholder={isAr ? "مثال: برج الزمرد السكني، قرية لاجونا، بوليفارد بلازا" : "e.g. Emerald Tower, Laguna Resort"}
                className="h-9.5 text-xs font-medium border-slate-300 bg-white text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "الرمز التعريفي المختصر" : "Entity Code"} <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                id="code"
                name="code"
                required
                placeholder={isAr ? "مثال: TOW-01, RES-01, MAL-01" : "e.g. TOW-01, RES-01"}
                className="h-9.5 text-xs font-bold font-mono uppercase border-slate-300 bg-white text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timezone" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "الدولة والمنطقة الزمنية (مصر والخليج)" : "Country & Timezone"} <span className="text-red-500 font-bold">*</span>
              </Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue="Africa/Cairo"
                className="h-9.5 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-2xs outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value} className="text-slate-900 dark:text-white">
                    {tz.flag} {isAr ? tz.labelAr : tz.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Optional Location & Contact Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="size-3.5 text-purple-600" />
                <span>{isAr ? "المدينة أو العنوان التفصيلي (اختياري)" : "City / Detailed Address (Optional)"}</span>
              </Label>
              <Input
                id="address"
                name="address"
                placeholder={isAr ? "مثال: التجمع الخامس، الساحل الشمالي، الرياض، دبي مارينا" : "e.g. New Cairo, North Coast, Riyadh"}
                className="h-9.5 text-xs border-slate-300 bg-white text-slate-900 focus:border-purple-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Phone className="size-3.5 text-blue-600" />
                <span>{isAr ? "هاتف الإدارة أو الكيان (اختياري)" : "Contact Phone (Optional)"}</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                placeholder={isAr ? "مثال: +20 10... أو +966 5..." : "+20... or +966..."}
                className="h-9.5 text-xs font-mono border-slate-300 bg-white text-slate-900 focus:border-purple-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {!state.ok && (
            <p role="alert" className="text-xs font-bold text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800">
              {state.error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer dark:border-slate-700 dark:text-slate-200"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={pending}
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/25 px-5 cursor-pointer"
            >
              {pending
                ? isAr
                  ? "جارٍ الحفظ والتهيئة..."
                  : "Registering..."
                : isAr
                  ? "حفظ وتثبيت الكيان العقاري"
                  : "Save Property Entity"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
