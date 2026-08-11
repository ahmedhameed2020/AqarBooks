"use client";

import { usePropertyNav } from "./property-nav-context";

export function ResortSelector({
  resorts,
  selectedId,
  locale,
}: {
  resorts: { id: string; name: string }[];
  selectedId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const { pushParams } = usePropertyNav();

  return (
    <select
      className="rounded-md border border-input bg-transparent p-1.5 text-sm"
      value={selectedId}
      onChange={(e) =>
        // Switching resorts changes the available buildings/zones, so clear
        // the rest of the filter state rather than carrying it over.
        pushParams({
          resort: e.target.value,
          q: undefined,
          building: undefined,
          zone: undefined,
          type: undefined,
          occupancy: undefined,
          arrears: undefined,
          page: undefined,
          unit: undefined,
        })
      }
      aria-label={isAr ? "المنتجع" : "Resort"}
    >
      {resorts.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
