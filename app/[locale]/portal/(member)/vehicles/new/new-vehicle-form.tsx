"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createVehicleAction } from "@/lib/actions/unit-experience";

export interface VehicleUnitOption {
  id: string;
  label: string;
}

export function NewVehicleForm({
  units,
  locale,
}: {
  units: VehicleUnitOption[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [plateNumber, setPlateNumber] = useState("");
  const [plateCountry, setPlateCountry] = useState("EG");
  const [plateRegion, setPlateRegion] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await createVehicleAction({
        unitId,
        plateNumber,
        plateCountry,
        plateRegion: plateRegion || null,
        make: make || null,
        model: model || null,
        color: color || null,
        year: year ? Number(year) : null,
        notes: notes || null,
      });
      if (!result.ok || !result.vehicleId) {
        setMessage(result.ok ? "failed" : result.error);
        return;
      }
      router.push(`/portal/vehicles/${result.vehicleId}`);
    });
  }

  return (
    <section className="max-w-3xl rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
          <span>{isAr ? "الوحدة" : "Unit"}</span>
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.label}</option>
            ))}
          </select>
        </label>

        <Input value={plateCountry} onChange={(event) => setPlateCountry(event.target.value.toUpperCase())} maxLength={3} placeholder={isAr ? "الدولة" : "Country"} className="h-10 rounded-xl" />
        <Input value={plateRegion} onChange={(event) => setPlateRegion(event.target.value)} maxLength={40} placeholder={isAr ? "المنطقة / الإمارة" : "Region / Emirate"} className="h-10 rounded-xl" />
        <Input value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} maxLength={40} placeholder={isAr ? "رقم اللوحة" : "Plate number"} className="h-10 rounded-xl sm:col-span-2" />
        <Input value={make} onChange={(event) => setMake(event.target.value)} maxLength={80} placeholder={isAr ? "الشركة المصنعة" : "Make"} className="h-10 rounded-xl" />
        <Input value={model} onChange={(event) => setModel(event.target.value)} maxLength={80} placeholder={isAr ? "الموديل" : "Model"} className="h-10 rounded-xl" />
        <Input value={color} onChange={(event) => setColor(event.target.value)} maxLength={60} placeholder={isAr ? "اللون" : "Color"} className="h-10 rounded-xl" />
        <Input value={year} onChange={(event) => setYear(event.target.value)} type="number" min={1900} max={new Date().getFullYear() + 1} placeholder={isAr ? "السنة" : "Year"} className="h-10 rounded-xl" />
        <label className="space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
          <span>{isAr ? "ملاحظات" : "Notes"}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={4}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {message ? <p className="mt-3 text-xs font-semibold text-rose-600">{message}</p> : null}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={submit} disabled={isPending || !unitId || !plateNumber || !plateCountry} className="h-10 rounded-xl text-xs font-semibold">
          {isAr ? "حفظ المركبة" : "Save Vehicle"}
        </Button>
      </div>
    </section>
  );
}
