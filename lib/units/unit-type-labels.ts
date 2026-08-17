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

export function unitTypeLabel(
  unit: { unit_type: UnitType; custom_type_label?: string | null },
  isAr: boolean,
): string {
  if (unit.unit_type === "OTHER" && unit.custom_type_label) return unit.custom_type_label;
  return isAr ? (UNIT_TYPE_LABELS[unit.unit_type]?.ar ?? "") : (UNIT_TYPE_LABELS[unit.unit_type]?.en ?? "");
}
