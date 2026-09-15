"use client";

import { useMemo, useState, useTransition } from "react";
import { CarFront, Save, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateVehicleStaffAction } from "@/lib/actions/unit-experience";

export interface StaffVehicleItem {
  id: string;
  propertyName: string;
  unitCode: string;
  memberName: string;
  plateNumber: string;
  plateCountry: string;
  plateRegion: string | null;
  normalizedPlate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

type DraftVehicle = {
  plateNumber: string;
  plateCountry: string;
  plateRegion: string;
  make: string;
  model: string;
  color: string;
  year: string;
  notes: string;
  isActive: boolean;
};

function draftFromVehicle(vehicle: StaffVehicleItem): DraftVehicle {
  return {
    plateNumber: vehicle.plateNumber,
    plateCountry: vehicle.plateCountry,
    plateRegion: vehicle.plateRegion ?? "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    color: vehicle.color ?? "",
    year: vehicle.year?.toString() ?? "",
    notes: vehicle.notes ?? "",
    isActive: vehicle.isActive,
  };
}

export function StaffVehiclesClient({
  vehicles,
  canManage,
  locale,
}: {
  vehicles: StaffVehicleItem[];
  canManage: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftVehicle | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((vehicle) =>
      [
        vehicle.plateNumber,
        vehicle.normalizedPlate,
        vehicle.unitCode,
        vehicle.propertyName,
        vehicle.memberName,
        vehicle.make ?? "",
        vehicle.model ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [vehicles, query]);

  const editingVehicle = vehicles.find((vehicle) => vehicle.id === editingId) ?? null;

  function startEdit(vehicle: StaffVehicleItem) {
    setEditingId(vehicle.id);
    setDraft(draftFromVehicle(vehicle));
    setMessage(null);
  }

  function submit() {
    if (!editingId || !draft) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateVehicleStaffAction({
        vehicleId: editingId,
        plateNumber: draft.plateNumber,
        plateCountry: draft.plateCountry,
        plateRegion: draft.plateRegion || null,
        make: draft.make || null,
        model: draft.model || null,
        color: draft.color || null,
        year: draft.year ? Number(draft.year) : null,
        notes: draft.notes || null,
        isActive: draft.isActive,
      });
      setMessage(result.ok ? (isAr ? "تم حفظ المركبة" : "Vehicle saved") : result.error);
      if (result.ok) {
        setEditingId(null);
        setDraft(null);
      }
    });
  }

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {isAr ? "سجل المركبات" : "Vehicle Registry"}
        </h1>
        <p className="text-xs font-medium text-slate-500">
          {isAr ? "مركبات الوحدات الحالية داخل نطاق المنشأة." : "Current unit vehicle records within this organization."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <CarFront className="size-4 text-slate-500" />
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              {editingVehicle ? (isAr ? "تعديل مركبة" : "Edit vehicle") : isAr ? "تفاصيل إدارية" : "Administrative details"}
            </h2>
          </div>
          {!editingVehicle || !draft ? (
            <p className="text-sm leading-relaxed text-slate-500">
              {canManage
                ? isAr
                  ? "اختر مركبة من السجل لتصحيح بيانات آمنة أو إيقافها."
                  : "Select a vehicle to correct safe metadata or deactivate it."
                : isAr
                  ? "لديك صلاحية عرض فقط على سجل المركبات."
                  : "You have view-only access to the vehicle registry."}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500">
                {editingVehicle.unitCode} · {editingVehicle.memberName}
              </p>
              <Input value={draft.plateCountry} onChange={(event) => setDraft((value) => value && { ...value, plateCountry: event.target.value.toUpperCase() })} disabled={!canManage} maxLength={3} placeholder={isAr ? "الدولة" : "Country"} className="h-10 rounded-xl" />
              <Input value={draft.plateRegion} onChange={(event) => setDraft((value) => value && { ...value, plateRegion: event.target.value })} disabled={!canManage} maxLength={40} placeholder={isAr ? "المنطقة" : "Region"} className="h-10 rounded-xl" />
              <Input value={draft.plateNumber} onChange={(event) => setDraft((value) => value && { ...value, plateNumber: event.target.value })} disabled={!canManage} maxLength={40} placeholder={isAr ? "رقم اللوحة" : "Plate number"} className="h-10 rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={draft.make} onChange={(event) => setDraft((value) => value && { ...value, make: event.target.value })} disabled={!canManage} placeholder={isAr ? "الشركة" : "Make"} className="h-10 rounded-xl" />
                <Input value={draft.model} onChange={(event) => setDraft((value) => value && { ...value, model: event.target.value })} disabled={!canManage} placeholder={isAr ? "الموديل" : "Model"} className="h-10 rounded-xl" />
                <Input value={draft.color} onChange={(event) => setDraft((value) => value && { ...value, color: event.target.value })} disabled={!canManage} placeholder={isAr ? "اللون" : "Color"} className="h-10 rounded-xl" />
                <Input value={draft.year} onChange={(event) => setDraft((value) => value && { ...value, year: event.target.value })} disabled={!canManage} type="number" min={1900} max={new Date().getFullYear() + 1} placeholder={isAr ? "السنة" : "Year"} className="h-10 rounded-xl" />
              </div>
              <textarea value={draft.notes} onChange={(event) => setDraft((value) => value && { ...value, notes: event.target.value })} disabled={!canManage} rows={3} maxLength={500} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 rounded-xl border border-border/70 p-3 text-sm font-semibold">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((value) => value && { ...value, isActive: event.target.checked })} disabled={!canManage} className="size-4" />
                {isAr ? "المركبة نشطة" : "Vehicle active"}
              </label>
              {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}
              <div className="flex gap-2">
                <Button type="button" onClick={submit} disabled={!canManage || isPending} className="h-10 gap-2 rounded-xl">
                  <Save className="size-4" />
                  {isAr ? "حفظ" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setEditingId(null); setDraft(null); }} className="h-10 rounded-xl">
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card">
          <div className="border-b border-border/70 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAr ? "بحث في المركبات" : "Search vehicles"} className="h-10 rounded-xl ps-9" />
            </div>
          </div>
          <div className="divide-y divide-border/70">
            {visible.length === 0 ? (
              <div className="p-10 text-center">
                <CarFront className="mx-auto mb-3 size-8 text-slate-400" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد مركبات" : "No vehicles yet"}</p>
              </div>
            ) : visible.map((vehicle) => (
              <div key={vehicle.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_.8fr_.5fr_auto] lg:items-center">
                <div>
                  <p className="font-mono text-sm font-black text-slate-950 dark:text-white">
                    {[vehicle.plateCountry, vehicle.plateRegion, vehicle.plateNumber].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-slate-500">{vehicle.unitCode} · {vehicle.propertyName}</p>
                  <p className="text-[11px] text-slate-400">{vehicle.memberName}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {[vehicle.make, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(" · ") || "—"}
                </p>
                <Badge variant="outline" className={vehicle.isActive ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700" : "w-fit border-slate-200 bg-slate-50 text-slate-600"}>
                  {vehicle.isActive ? (isAr ? "نشطة" : "Active") : isAr ? "متوقفة" : "Inactive"}
                </Badge>
                {canManage ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(vehicle)} className="h-8 rounded-xl text-xs">
                    {isAr ? "تعديل" : "Edit"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
