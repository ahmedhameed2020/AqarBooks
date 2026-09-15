export type VehicleRowStatus = "ACTIVE" | "INACTIVE";

export const VEHICLE_STATUS_LABELS: Record<VehicleRowStatus, { ar: string; en: string; tone: string }> = {
  ACTIVE: { ar: "نشطة", en: "Active", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  INACTIVE: { ar: "متوقفة", en: "Inactive", tone: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function formatVehicleLabel(vehicle: {
  plateNumber: string;
  plateCountry: string;
  plateRegion: string | null;
}) {
  return [vehicle.plateCountry, vehicle.plateRegion, vehicle.plateNumber].filter(Boolean).join(" · ");
}

export function formatPortalDate(value: string, locale: "ar" | "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}
