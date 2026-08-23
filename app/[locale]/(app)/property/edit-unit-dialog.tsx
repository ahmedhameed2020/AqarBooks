"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  getUnitEditContextAction,
  updateUnitAction,
  type UnitEditContext,
} from "@/lib/actions/unit-lifecycle";
import { UNIT_TYPE_LABELS, UNIT_TYPES } from "@/lib/units/unit-type-labels";

// Editing a unit had no screen at all, even though update_unit has been in the
// database the whole time -- with its permission check, its property-scoped
// validation of building and zone, and its duplicate-code handling. This dialog
// is the missing half, not new behaviour.
//
// Fields deliberately absent: the property the unit belongs to. update_unit
// takes no property_id, because a unit does not move between properties from an
// edit form; only its building and zone change, and only within its own
// property. The building/zone lists loaded here are already scoped that way.

const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  duplicate_code: {
    ar: "رمز الوحدة مستخدم بالفعل في نفس الموقع. اختر رمزًا آخر.",
    en: "That unit code is already used in this property. Choose another.",
  },
  invalid_building: {
    ar: "المبنى المحدد لا ينتمي لموقع هذه الوحدة.",
    en: "The selected building does not belong to this unit's property.",
  },
  invalid_zone: {
    ar: "المنطقة المحددة لا تنتمي لموقع هذه الوحدة.",
    en: "The selected zone does not belong to this unit's property.",
  },
  organization_inactive: {
    ar: "الكيان غير نشط، ولا يمكن حفظ التعديلات.",
    en: "The organization is inactive; changes cannot be saved.",
  },
  forbidden: {
    ar: "لا تملك صلاحية تعديل بيانات الوحدات.",
    en: "You don't have permission to edit units.",
  },
  invalid_input: {
    ar: "تحقق من القيم المُدخلة — الرمز مطلوب، والمساحة والدور يجب أن يكونا أرقامًا صحيحة.",
    en: "Check the values — the code is required, and area and floor must be valid numbers.",
  },
};

function messageFor(code: string, isAr: boolean) {
  return (
    ERROR_MESSAGES[code]?.[isAr ? "ar" : "en"] ??
    (isAr ? "تعذّر حفظ التعديلات، حاول مرة أخرى." : "Could not save the changes, please try again.")
  );
}

export function EditUnitDialog({
  unitId,
  unitCode,
  locale,
  open,
  onOpenChange,
}: {
  unitId: string;
  unitCode: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [ctx, setCtx] = useState<UnitEditContext | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state, seeded from the loaded context.
  const [code, setCode] = useState("");
  const [unitType, setUnitType] = useState<string>("APARTMENT");
  const [customLabel, setCustomLabel] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [floor, setFloor] = useState("");
  const [area, setArea] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCtx(null);
    setLoadFailed(false);
    setError(null);

    getUnitEditContextAction(unitId, locale).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const c = res.context;
      setCtx(c);
      setCode(c.code);
      setUnitType(c.unitType);
      setCustomLabel(c.customTypeLabel ?? "");
      setBuildingId(c.buildingId ?? "");
      setZoneId(c.zoneId ?? "");
      setFloor(c.floorNumber === null ? "" : String(c.floorNumber));
      setArea(c.area === null ? "" : String(c.area));
    });

    return () => {
      cancelled = true;
    };
  }, [open, unitId, locale]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await updateUnitAction({
        unitId,
        code: code.trim(),
        unitType: unitType as never,
        customTypeLabel: unitType === "OTHER" ? customLabel.trim() || null : null,
        buildingId: buildingId || null,
        zoneId: zoneId || null,
        floorNumber: floor.trim() === "" ? null : Number(floor),
        area: area.trim() === "" ? null : Number(area),
      });

      if (!res.ok) {
        setError(messageFor(res.error, isAr));
        return;
      }

      onOpenChange(false);
      router.refresh();
      toast.add({ title: isAr ? "تم حفظ بيانات الوحدة" : "Unit saved", type: "success" });
    });
  }

  const selectCls =
    "h-9.5 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div>
            <DialogTitle>{isAr ? "تعديل بيانات الوحدة" : "Edit unit"}</DialogTitle>
            <DialogDescription>
              <span dir="ltr" className="font-mono">
                {unitCode}
              </span>
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-6">
            {!ctx && !loadFailed && (
              <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ تحميل بيانات الوحدة…" : "Loading unit details…"}
              </div>
            )}

            {loadFailed && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive"
              >
                {isAr
                  ? "تعذّر تحميل بيانات الوحدة. أغلق النافذة وأعد المحاولة."
                  : "Could not load the unit. Close the dialog and try again."}
              </p>
            )}

            {ctx && (
              <>
                <section className="space-y-3">
                  <h4 className="border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? "التعريف" : "Identity"}
                  </h4>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-code" className="text-xs font-semibold">
                        {isAr ? "رمز الوحدة" : "Unit code"}{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="unit-code"
                        dir="ltr"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                        className="h-9.5 font-mono text-xs uppercase"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {isAr
                          ? "يجب أن يكون فريدًا داخل نفس الموقع."
                          : "Must be unique within this property."}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="unit-type" className="text-xs font-semibold">
                        {isAr ? "نوع الوحدة" : "Unit type"}{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <select
                        id="unit-type"
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value)}
                        className={selectCls}
                      >
                        {UNIT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {isAr ? UNIT_TYPE_LABELS[t].ar : UNIT_TYPE_LABELS[t].en}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Only meaningful for OTHER, and update_unit clears it for
                      every other type anyway -- so it appears only there. */}
                  {unitType === "OTHER" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-custom-label" className="text-xs font-semibold">
                        {isAr ? "وصف النوع" : "Type description"}
                      </Label>
                      <Input
                        id="unit-custom-label"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder={isAr ? "مثال: مخزن" : "e.g. Storeroom"}
                        className="h-9.5 text-xs"
                      />
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h4 className="border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? "الموقع داخل العقار" : "Placement"}
                  </h4>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-building" className="text-xs font-semibold">
                        {isAr ? "المبنى" : "Building"}
                        <span className="ms-1 font-normal text-muted-foreground">
                          {isAr ? "(اختياري)" : "(optional)"}
                        </span>
                      </Label>
                      <select
                        id="unit-building"
                        value={buildingId}
                        onChange={(e) => setBuildingId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">{isAr ? "— بدون مبنى —" : "— none —"}</option>
                        {ctx.buildings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="unit-zone" className="text-xs font-semibold">
                        {isAr ? "المنطقة" : "Zone"}
                        <span className="ms-1 font-normal text-muted-foreground">
                          {isAr ? "(اختياري)" : "(optional)"}
                        </span>
                      </Label>
                      <select
                        id="unit-zone"
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">{isAr ? "— بدون منطقة —" : "— none —"}</option>
                        {ctx.zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {ctx.buildings.length === 0 && ctx.zones.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {isAr
                        ? "لم تُسجَّل مبانٍ أو مناطق لهذا الموقع بعد، لذلك القائمتان فارغتان."
                        : "No buildings or zones are registered for this property yet, so both lists are empty."}
                    </p>
                  )}

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-floor" className="text-xs font-semibold">
                        {isAr ? "الدور" : "Floor"}
                      </Label>
                      <Input
                        id="unit-floor"
                        type="number"
                        dir="ltr"
                        value={floor}
                        onChange={(e) => setFloor(e.target.value)}
                        className="h-9.5 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="unit-area" className="text-xs font-semibold">
                        {isAr ? "المساحة (م٢)" : "Area (m²)"}
                      </Label>
                      <Input
                        id="unit-area"
                        type="number"
                        step="0.01"
                        min="0"
                        dir="ltr"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="h-9.5 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {isAr
                          ? "تُستخدم في توزيع مصاريف الخدمة على الوحدات."
                          : "Used to allocate service charges across units."}
                      </p>
                    </div>
                  </div>
                </section>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs font-semibold text-destructive"
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!ctx || isPending || !code.trim()}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {isAr ? "حفظ التعديلات" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
