"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Hash, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createUnitAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";
import { UNIT_TYPES, UNIT_TYPE_LABELS, type UnitRow } from "./units-table";

const NONE = "__none__";

const UNIT_TYPE_ICONS_EMOJI: Record<UnitRow["unit_type"], string> = {
  VILLA: "🏡",
  CHALET: "🏖️",
  APARTMENT: "🏢",
  SHOP: "🏬",
  OFFICE: "💼",
  SERVICE: "🛠️",
  OTHER: "🔖",
};

export function CreateUnitForm({
  organizationId,
  resortId,
  buildings,
  zones,
  locale,
  onSuccess,
}: {
  organizationId: string;
  resortId: string;
  buildings: { id: string; name_ar: string; name_en: string }[];
  zones: { id: string; name_ar: string; name_en: string }[];
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createUnitAction,
    { ok: true },
  );
  const wasPending = useRef(false);
  const [code, setCode] = useState("");
  const [unitType, setUnitType] = useState<UnitRow["unit_type"]>("VILLA");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [buildingId, setBuildingId] = useState(NONE);
  const [zoneId, setZoneId] = useState(NONE);
  const [touched, setTouched] = useState(false);

  const codeError = touched && !code.trim() ? (isAr ? "رمز/رقم الوحدة مطلوب" : "Unit code is required") : undefined;
  const customTypeError =
    touched && unitType === "OTHER" && !customTypeLabel.trim()
      ? isAr
        ? "اكتب اسم النوع المخصص"
        : "Enter custom type name"
      : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تمت إضافة الوحدة بنجاح" : "Unit added successfully", type: "success" });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!code.trim() || (unitType === "OTHER" && !customTypeLabel.trim())) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="unitType" value={unitType} />
      {buildingId !== NONE && <input type="hidden" name="buildingId" value={buildingId} />}
      {zoneId !== NONE && <input type="hidden" name="zoneId" value={zoneId} />}

      {/* Section 1: Basic Unit Info */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
          <Hash className="size-4 text-purple-600" />
          <span>{isAr ? "البيانات الأساسية للوحدة" : "Basic Unit Information"}</span>
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "رمز/رقم الوحدة *" : "Unit Code/Number *"}
            </Label>
            <Input
              id="code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: A-101 أو فيلا 12" : "e.g. A-101 or Villa 12"}
              aria-invalid={Boolean(codeError)}
              className="font-mono font-bold"
              required
            />
            {codeError && <p className="text-[11px] font-bold text-rose-600">{codeError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unitTypeSelect" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "نوع الوحدة والاستخدام" : "Unit Type & Usage"}
            </Label>
            <select
              id="unitTypeSelect"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as UnitRow["unit_type"])}
              className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-purple-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer"
            >
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {UNIT_TYPE_ICONS_EMOJI[t]} {isAr ? UNIT_TYPE_LABELS[t].ar : UNIT_TYPE_LABELS[t].en}
                </option>
              ))}
            </select>
          </div>
        </div>

        {unitType === "OTHER" && (
          <div className="space-y-1.5">
            <Label htmlFor="customTypeLabel" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "اسم النوع المخصص *" : "Custom Type Name *"}
            </Label>
            <Input
              id="customTypeLabel"
              name="customTypeLabel"
              value={customTypeLabel}
              onChange={(e) => setCustomTypeLabel(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(customTypeError)}
              placeholder={isAr ? "مثال: كشك حراسة / مخزن / روف" : "e.g. Guard kiosk / Storage / Roof"}
              required
            />
            {customTypeError && <p className="text-[11px] font-bold text-rose-600">{customTypeError}</p>}
          </div>
        )}
      </div>

      {/* Section 2: Location & Specs */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
          <MapPin className="size-4 text-purple-600" />
          <span>{isAr ? "الموقع الداخلي والمواصفات" : "Internal Location & Specs"}</span>
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="buildingIdSelect" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "المبنى / البرج" : "Building / Tower"}
            </Label>
            <select
              id="buildingIdSelect"
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-purple-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer"
            >
              <option value={NONE}>{isAr ? "بدون مبنى (مستقل / عام)" : "No building (independent)"}</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  🏢 {isAr ? b.name_ar : (b.name_en || b.name_ar)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zoneIdSelect" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "المنطقة / القطاع" : "Zone / Sector"}
            </Label>
            <select
              id="zoneIdSelect"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-purple-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer"
            >
              <option value={NONE}>{isAr ? "بدون منطقة (عام)" : "No zone (general)"}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  📍 {isAr ? z.name_ar : (z.name_en || z.name_ar)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="floorNumber" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "الطابق / الدور" : "Floor Number"}
            </Label>
            <Input id="floorNumber" name="floorNumber" type="number" placeholder={isAr ? "مثال: 1" : "e.g. 1"} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="area" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "المساحة (م²)" : "Area (m²)"}
            </Label>
            <Input id="area" name="area" type="number" step="0.01" placeholder={isAr ? "مثال: 120" : "e.g. 120"} />
          </div>
        </div>
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-bold text-rose-600">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black shadow-md shadow-purple-600/20 py-2.5 rounded-xl cursor-pointer"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? (isAr ? "جارٍ حفظ الوحدة…" : "Adding Unit…") : isAr ? "حفظ وإضافة الوحدة" : "Save & Add Unit"}
      </Button>
    </form>
  );
}
