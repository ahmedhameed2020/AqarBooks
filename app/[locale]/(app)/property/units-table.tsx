"use client";

import { useState } from "react";
import { Download, X, Home, Sun, Building2, Store, Briefcase, Wrench, Layers, Receipt, User, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableRowNavigation } from "@/lib/hooks/use-table-row-navigation";
import type { Database } from "@/lib/supabase/types";
import { UnitBalanceBadge } from "./unit-balance-badge";
import { usePropertyNav } from "./property-nav-context";
import { UnitsTableSkeleton } from "./units-table-skeleton";
import { buildUnitsCsv, downloadCsv } from "./csv";

export type UnitRow = Database["public"]["Views"]["units_with_financials"]["Row"];

export const UNIT_TYPES = ["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"] as const;
export const OCCUPANCY_STATUSES = ["OCCUPIED", "VACANT"] as const;

export const UNIT_TYPE_LABELS: Record<UnitRow["unit_type"], { ar: string; en: string }> = {
  VILLA: { ar: "فيلا", en: "Villa" },
  CHALET: { ar: "شاليه", en: "Chalet" },
  APARTMENT: { ar: "شقة", en: "Apartment" },
  SHOP: { ar: "محل", en: "Shop" },
  OFFICE: { ar: "مكتب", en: "Office" },
  SERVICE: { ar: "خدمي", en: "Service" },
  OTHER: { ar: "أخرى", en: "Other" },
};

export const UNIT_TYPE_ICONS: Record<UnitRow["unit_type"], React.ReactNode> = {
  VILLA: <Home className="size-3.5 text-emerald-500" />,
  CHALET: <Sun className="size-3.5 text-amber-500" />,
  APARTMENT: <Building2 className="size-3.5 text-blue-500" />,
  SHOP: <Store className="size-3.5 text-purple-500" />,
  OFFICE: <Briefcase className="size-3.5 text-indigo-500" />,
  SERVICE: <Wrench className="size-3.5 text-slate-500" />,
  OTHER: <Layers className="size-3.5 text-slate-400" />,
};

export function unitTypeLabel(unit: Pick<UnitRow, "unit_type" | "custom_type_label">, isAr: boolean) {
  if (unit.unit_type === "OTHER" && unit.custom_type_label) return unit.custom_type_label;
  return isAr ? UNIT_TYPE_LABELS[unit.unit_type].ar : UNIT_TYPE_LABELS[unit.unit_type].en;
}

export function UnitTypeBadge({ unit, isAr }: { unit: UnitRow; isAr: boolean }) {
  const icon = UNIT_TYPE_ICONS[unit.unit_type] ?? <Building2 className="size-3.5" />;
  const label = unitTypeLabel(unit, isAr);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground">
      {icon}
      <span>{label}</span>
    </span>
  );
}

export function OccupancyBadge({ status, locale }: { status: UnitRow["occupancy_status"]; locale: string }) {
  const isAr = locale === "ar";
  const occupied = status === "OCCUPIED";
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 border-transparent px-2.5 py-1 text-xs font-medium",
        occupied
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", occupied ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40")} />
      {occupied ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant")}
    </Badge>
  );
}

export function UnitsTable({
  units,
  locale,
  currency,
}: {
  units: UnitRow[];
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const { isPending, pushParams } = usePropertyNav();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { activeIndex, setActiveIndex, onKeyDown, setRowRef } = useTableRowNavigation(units, (unit) =>
    pushParams({ unit: unit.id }),
  );

  if (isPending) return <UnitsTableSkeleton />;

  const allSelected = units.length > 0 && selectedIds.size === units.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(units.map((u) => u.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function exportSelected() {
    const rows = units.filter((u) => selectedIds.has(u.id));
    downloadCsv(`units-selected-${Date.now()}.csv`, buildUnitsCsv(rows, isAr));
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked)}
                  aria-label={isAr ? "تحديد الكل" : "Select all"}
                />
              </TableHead>
              <TableHead>{isAr ? "رقم الوحدة" : "Unit Code"}</TableHead>
              <TableHead>{isAr ? "المبنى" : "Building"}</TableHead>
              <TableHead>{isAr ? "المنطقة" : "Zone"}</TableHead>
              <TableHead>{isAr ? "المساحة" : "Area"}</TableHead>
              <TableHead>{isAr ? "النوع" : "Type"}</TableHead>
              <TableHead>{isAr ? "الإشغال" : "Occupancy"}</TableHead>
              <TableHead>{isAr ? "المالك الحالي" : "Current Owner"}</TableHead>
              <TableHead>{isAr ? "الرصيد المالي" : "Balance"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length ? (
              units.map((unit, index) => (
                <TableRow
                  key={unit.id}
                  ref={setRowRef(index)}
                  tabIndex={0}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={onKeyDown}
                  onClick={() => pushParams({ unit: unit.id })}
                  className={cn(
                    "group cursor-pointer transition-colors outline-none hover:bg-muted/40",
                    index === activeIndex && "bg-muted/50 ring-1 ring-inset ring-ring",
                    unit.has_arrears && "border-s-4 border-s-rose-500 bg-rose-500/5",
                  )}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(unit.id)}
                      onCheckedChange={(checked) => toggleOne(unit.id, checked)}
                      aria-label={isAr ? "تحديد" : "Select"}
                    />
                  </TableCell>
                  <TableCell className="font-bold">
                    <Link
                      href={`/property/${unit.id}`}
                      locale={locale}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 font-mono text-sm text-primary hover:underline"
                    >
                      {unit.code}
                      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(isAr ? unit.building_name_ar : unit.building_name_en) ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(isAr ? unit.zone_name_ar : unit.zone_name_en) ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {unit.area ? `${unit.area} ${isAr ? "م²" : "m²"}` : "—"}
                  </TableCell>
                  <TableCell>
                    <UnitTypeBadge unit={unit} isAr={isAr} />
                  </TableCell>
                  <TableCell>
                    <OccupancyBadge status={unit.occupancy_status} locale={locale} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {unit.owner_name ? (
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <User className="size-3 text-muted-foreground" />
                        {unit.owner_name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <UnitBalanceBadge balance={unit.balance} currency={currency} locale={locale} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  {isAr ? "لا توجد وحدات مطابقة للبحث أو الفلاتر" : "No matching units found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border/80 bg-popover/90 px-5 py-2.5 text-sm shadow-xl backdrop-blur-md">
            <span className="font-semibold tabular-nums text-foreground">
              {isAr ? `${selectedIds.size} وحدات محدودة` : `${selectedIds.size} units selected`}
            </span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" variant="secondary" onClick={exportSelected} className="gap-1.5">
              <Download className="size-3.5" />
              {isAr ? "تصدير كشف CSV" : "Export CSV"}
            </Button>
            <Link
              href={`/finance/dues?units=${Array.from(selectedIds).join(",")}`}
              locale={locale}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Receipt className="size-3.5" />
              {isAr ? "إصدار مستحق جماعي" : "Bulk Issue Dues"}
            </Link>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
