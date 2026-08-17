import { Home, Sun, Building2, Store, Briefcase, Wrench, Layers } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

// Shared unit-type label map -- lives under lib/ (not app/[locale]/(app)/)
// so portal code (app/[locale]/portal/**) can depend on it without reaching
// into the staff-only (app) tree. app/[locale]/(app)/property/unit-helpers.ts
// re-exports these for its own call sites.
export type UnitType = Database["public"]["Views"]["units_with_financials"]["Row"]["unit_type"];

export const UNIT_TYPES = ["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"] as const;
export const OCCUPANCY_STATUSES = ["OCCUPIED", "VACANT"] as const;

export const UNIT_TYPE_LABELS: Record<UnitType, { ar: string; en: string }> = {
  VILLA: { ar: "فيلا", en: "Villa" },
  CHALET: { ar: "شاليه", en: "Chalet" },
  APARTMENT: { ar: "شقة", en: "Apartment" },
  SHOP: { ar: "محل", en: "Shop" },
  OFFICE: { ar: "مكتب", en: "Office" },
  SERVICE: { ar: "خدمي", en: "Service" },
  OTHER: { ar: "أخرى", en: "Other" },
};

// Plain JSX-valued export (not a function) -- still must live in a non-"use
// client" module. When app/[locale]/(app)/property/units-table.tsx (a "use
// client" file) exported this same map, importing it into a Server
// Component silently resolved to undefined for every key: Next's RSC
// compiler turns *every* export of a "use client" module into a client
// reference, including plain data exports, not just component functions.
// No error is thrown -- the icon badge just silently renders empty. Caught
// via a live screenshot during the units-detail-page design pass, not by
// tsc/build. See unitTypeLabel() below for the original instance of this
// same bug class.
export const UNIT_TYPE_ICONS: Record<UnitType, React.ReactNode> = {
  VILLA: <Home className="size-3.5 text-emerald-500" />,
  CHALET: <Sun className="size-3.5 text-amber-500" />,
  APARTMENT: <Building2 className="size-3.5 text-blue-500" />,
  SHOP: <Store className="size-3.5 text-purple-500" />,
  OFFICE: <Briefcase className="size-3.5 text-indigo-500" />,
  SERVICE: <Wrench className="size-3.5 text-slate-500" />,
  OTHER: <Layers className="size-3.5 text-slate-400" />,
};

export function unitTypeLabel(
  unit: { unit_type: UnitType; custom_type_label?: string | null },
  isAr: boolean,
): string {
  if (unit.unit_type === "OTHER" && unit.custom_type_label) return unit.custom_type_label;
  return isAr ? (UNIT_TYPE_LABELS[unit.unit_type]?.ar ?? "") : (UNIT_TYPE_LABELS[unit.unit_type]?.en ?? "");
}
