"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, SlidersHorizontal, Building2, MapPin, Home, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UNIT_TYPES, UNIT_TYPE_LABELS } from "./units-table";
import { usePropertyNav } from "./property-nav-context";
import { exportUnitsCsvAction } from "@/lib/actions/units-export";
import { buildUnitsCsv, buildUnitsXlsxBuffer, downloadCsv, downloadXlsxBuffer } from "./csv";
import { ExportToolbar } from "@/components/export-toolbar";
import { generateUnitsPdfReport } from "./unit-pdf-report";
import { useDemoMode } from "@/components/demo/demo-mode-context";
import { demoExportNotice } from "@/lib/demo/export-notice";

const ALL = "__all__";

export function UnitsFilters({
  locale,
  resortId,
  resortName,
  organizationName,
  currency,
  totalUnits,
  occupancyRate,
  totalArrears,
  collectedThisMonth,
  buildings,
  zones,
}: {
  locale: string;
  resortId: string;
  resortName: string;
  organizationName: string;
  currency: string;
  totalUnits: number;
  occupancyRate: number;
  totalArrears: number;
  collectedThisMonth: number;
  buildings: { id: string; name_ar: string; name_en: string }[];
  zones: { id: string; name_ar: string; name_en: string }[];
}) {
  const isAr = locale === "ar";

  // Demo exports carry a label and a filename prefix (spec §28). The flag is
  // presentation only -- it decides whether a spreadsheet says it is
  // fictional, and authorises nothing.
  const isDemo = useDemoMode();
  const notice = demoExportNotice(isDemo, isAr);
  const filePrefix = isDemo ? "DEMO-" : "";
  const { get, pushParams } = usePropertyNav();
  const q = get("q");
  const building = get("building");
  const zone = get("zone");
  const type = get("type");
  const occupancy = get("occupancy");
  const arrears = get("arrears");

  const [qDraft, setQDraft] = useState(q ?? "");
  const firstRender = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => pushParams({ q: qDraft || undefined, page: undefined }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const buildingName = buildings.find((b) => b.id === building);
  const zoneName = zones.find((z) => z.id === zone);
  const chips: { key: string; label: string }[] = [];
  if (q) chips.push({ key: "q", label: isAr ? `بحث: ${q}` : `Search: ${q}` });
  if (buildingName) chips.push({ key: "building", label: isAr ? buildingName.name_ar : buildingName.name_en });
  if (zoneName) chips.push({ key: "zone", label: isAr ? zoneName.name_ar : zoneName.name_en });
  if (type) chips.push({ key: "type", label: isAr ? UNIT_TYPE_LABELS[type as keyof typeof UNIT_TYPE_LABELS]?.ar ?? type : UNIT_TYPE_LABELS[type as keyof typeof UNIT_TYPE_LABELS]?.en ?? type });
  if (occupancy) chips.push({ key: "occupancy", label: occupancy === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant") });
  if (arrears === "1") chips.push({ key: "arrears", label: isAr ? "عليها متأخرات" : "Has arrears" });

  function removeChip(key: string) {
    if (key === "q") setQDraft("");
    pushParams({ [key]: undefined, page: undefined });
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const rows = await exportUnitsCsvAction({ resortId, q, building, zone, type, occupancy, arrears });
      const buffer = await buildUnitsXlsxBuffer(rows, isAr, notice);
      downloadXlsxBuffer(`${filePrefix}units-export-${Date.now()}.xlsx`, buffer);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const rows = await exportUnitsCsvAction({ resortId, q, building, zone, type, occupancy, arrears });
      downloadCsv(`${filePrefix}units-export-${Date.now()}.csv`, buildUnitsCsv(rows, isAr, notice));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const rows = await exportUnitsCsvAction({ resortId, q, building, zone, type, occupancy, arrears });
      generateUnitsPdfReport({
        demoNotice: notice,
        organizationName,
        resortName,
        currency,
        isAr,
        totalUnits,
        occupancyRate,
        totalArrears,
        collectedThisMonth,
        units: rows,
      });
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative z-30 space-y-3">
      {/* Modern Filter Container Card */}
      <div className="relative z-30 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search & Select Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                ref={inputRef}
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder={isAr ? "بحث بالرمز، المالك، المبنى، الهاتف… (/)" : "Search code, owner, building, phone… (/)"}
                className="w-64 ps-9 pe-8 h-9 text-xs rounded-xl border-slate-300 bg-slate-50/50 font-medium dark:border-slate-700 dark:bg-slate-800"
              />
              {qDraft && (
                <button
                  type="button"
                  onClick={() => {
                    setQDraft("");
                    pushParams({ q: undefined, page: undefined });
                  }}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-slate-200 text-slate-500 cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Building Filter */}
            <Select value={building || undefined} onValueChange={(v) => pushParams({ building: (v === ALL ? undefined : v) as any, page: undefined })}>
              <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-slate-300 bg-white font-medium dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="size-3 text-slate-500 shrink-0" />
                  <SelectValue placeholder={isAr ? "المبنى" : "Building"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{isAr ? "كل المباني" : "All buildings"}</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {isAr ? b.name_ar : b.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Zone Filter */}
            <Select value={zone || undefined} onValueChange={(v) => pushParams({ zone: (v === ALL ? undefined : v) as any, page: undefined })}>
              <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-slate-300 bg-white font-medium dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="size-3 text-slate-500 shrink-0" />
                  <SelectValue placeholder={isAr ? "المنطقة" : "Zone"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{isAr ? "كل المناطق" : "All zones"}</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {isAr ? z.name_ar : z.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Unit Type Filter */}
            <Select value={type || undefined} onValueChange={(v) => pushParams({ type: (v === ALL ? undefined : v) as any, page: undefined })}>
              <SelectTrigger className="w-32 h-9 text-xs rounded-xl border-slate-300 bg-white font-medium dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-1.5 truncate">
                  <Home className="size-3 text-slate-500 shrink-0" />
                  <SelectValue placeholder={isAr ? "النوع" : "Type"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{isAr ? "كل الأنواع" : "All types"}</SelectItem>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {isAr ? UNIT_TYPE_LABELS[t].ar : UNIT_TYPE_LABELS[t].en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Occupancy Status Filter */}
            <Select value={occupancy || undefined} onValueChange={(v) => pushParams({ occupancy: (v === ALL ? undefined : v) as any, page: undefined })}>
              <SelectTrigger className="w-32 h-9 text-xs rounded-xl border-slate-300 bg-white font-medium dark:border-slate-700 dark:bg-slate-800">
                <SelectValue placeholder={isAr ? "الإشغال" : "Occupancy"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{isAr ? "كل حالات الإشغال" : "All occupancy"}</SelectItem>
                <SelectItem value="OCCUPIED">{isAr ? "مشغولة" : "Occupied"}</SelectItem>
                <SelectItem value="VACANT">{isAr ? "شاغرة" : "Vacant"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Arrears Filter Toggle Pill */}
            <Button
              type="button"
              variant={arrears === "1" ? "default" : "outline"}
              size="sm"
              onClick={() => pushParams({ arrears: arrears === "1" ? undefined : "1", page: undefined })}
              className={`h-9 text-xs rounded-xl gap-1.5 font-bold cursor-pointer ${
                arrears === "1"
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              <AlertCircle className="size-3 text-rose-500" />
              {isAr ? "عليها متأخرات فقط" : "Arrears only"}
            </Button>
          </div>

          {/* Dedicated Clean Export Toolbar (Excel / CSV / PDF) */}
          <ExportToolbar
            locale={locale}
            showImport={false}
            onExportExcel={handleExportExcel}
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            exporting={exporting}
          />
        </div>

        {/* Active Filter Badges */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <SlidersHorizontal className="size-3" />
              {isAr ? "الفلاتر المطبقة:" : "Active Filters:"}
            </span>
            {chips.map((chip) => (
              <Badge key={chip.key} variant="secondary" className="gap-1 ps-2.5 pe-1.5 text-xs rounded-lg">
                {chip.label}
                <button
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  aria-label={isAr ? "إزالة الفلتر" : "Remove filter"}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Button
              variant="link"
              size="sm"
              className="h-5 px-1 text-xs text-primary font-medium"
              onClick={() => {
                setQDraft("");
                pushParams({ q: undefined, building: undefined, zone: undefined, type: undefined, occupancy: undefined, arrears: undefined, page: undefined });
              }}
            >
              {isAr ? "إعادة ضبط الفلاتر" : "Reset All"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
