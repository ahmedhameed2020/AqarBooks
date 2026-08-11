"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Home, Building2, MapPin, Layers, Hash, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createUnitAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";
import { UNIT_TYPES, UNIT_TYPE_LABELS, UNIT_TYPE_ICONS, type UnitRow } from "./units-table";

const NONE = "__none__";

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

  const codeError = touched && !code.trim() ? (isAr ? "رمز الوحدة مطلوب" : "Unit code is required") : undefined;
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
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Hash className="size-3.5 text-primary" />
          {isAr ? "البيانات الأساسية" : "Basic Information"}
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-xs">{isAr ? "رمز/رقم الوحدة *" : "Unit Code *"}</Label>
            <Input
              id="code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: A-101" : "e.g. A-101"}
              aria-invalid={Boolean(codeError)}
              required
            />
            {codeError && <p className="text-[11px] text-destructive">{codeError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unitType" className="text-xs">{isAr ? "نوع الوحدة" : "Unit Type"}</Label>
            <Select value={unitType} onValueChange={(v) => setUnitType(v as UnitRow["unit_type"])}>
              <SelectTrigger id="unitType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    <div className="flex items-center gap-2">
                      {UNIT_TYPE_ICONS[t]}
                      <span>{isAr ? UNIT_TYPE_LABELS[t].ar : UNIT_TYPE_LABELS[t].en}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {unitType === "OTHER" && (
          <div className="space-y-1.5">
            <Label htmlFor="customTypeLabel" className="text-xs">{isAr ? "اسم النوع المخصص *" : "Custom Type Name *"}</Label>
            <Input
              id="customTypeLabel"
              name="customTypeLabel"
              value={customTypeLabel}
              onChange={(e) => setCustomTypeLabel(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(customTypeError)}
              placeholder={isAr ? "مثال: كشك حراسة / مخزن" : "e.g. Guard kiosk / Storage"}
              required
            />
            {customTypeError && <p className="text-[11px] text-destructive">{customTypeError}</p>}
          </div>
        )}
      </div>

      {/* Section 2: Location & Specs */}
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MapPin className="size-3.5 text-primary" />
          {isAr ? "الموقع والمواصفات" : "Location & Specs"}
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="buildingId" className="text-xs">{isAr ? "المبنى" : "Building"}</Label>
            <Select value={buildingId} onValueChange={(v) => setBuildingId(v ?? NONE)}>
              <SelectTrigger id="buildingId" className="w-full">
                <SelectValue placeholder={isAr ? "اختر المبنى (اختياري)" : "Select Building (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{isAr ? "بدون مبنى (غير محدد)" : "No building (none)"}</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {isAr ? b.name_ar : b.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zoneId" className="text-xs">{isAr ? "المنطقة" : "Zone"}</Label>
            <Select value={zoneId} onValueChange={(v) => setZoneId(v ?? NONE)}>
              <SelectTrigger id="zoneId" className="w-full">
                <SelectValue placeholder={isAr ? "اختر المنطقة (اختياري)" : "Select Zone (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{isAr ? "بدون منطقة (غير محدد)" : "No zone (none)"}</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {isAr ? z.name_ar : z.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="floorNumber" className="text-xs">{isAr ? "الطابق" : "Floor Number"}</Label>
            <Input id="floorNumber" name="floorNumber" type="number" placeholder={isAr ? "مثال: 1" : "e.g. 1"} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="area" className="text-xs">{isAr ? "المساحة (م²)" : "Area (m²)"}</Label>
            <Input id="area" name="area" type="number" step="0.01" placeholder={isAr ? "مثال: 120" : "e.g. 120"} />
          </div>
        </div>
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full font-semibold shadow-xs">
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? (isAr ? "جارٍ إضافة الوحدة…" : "Adding Unit…") : isAr ? "حفظ وإضافة الوحدة" : "Save & Add Unit"}
      </Button>
    </form>
  );
}
