"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Download, FileUp, FileSpreadsheet, FileCode, Printer, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportToolbarProps {
  locale: string;
  importHref?: string;
  showImport?: boolean;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  exporting?: boolean;
}

export function ExportToolbar({
  locale,
  importHref,
  showImport = false,
  onExportExcel,
  onExportCsv,
  onExportPdf,
  exporting = false,
}: ExportToolbarProps) {
  const isAr = locale === "ar";
  const [menuOpen, setMenuOpen] = useState(false);

  function handlePdfClick() {
    setMenuOpen(false);
    onExportPdf();
  }

  return (
    <div className="flex items-center gap-2">
      {/* 1. Optional Import Wizard Link */}
      {showImport && importHref && (
        <Link
          href={importHref}
          locale={locale}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-3 py-1.5 text-xs font-bold shadow-2xs transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer"
        >
          <FileUp className="size-3.5 text-purple-600" />
          <span>{isAr ? "استيراد CSV" : "Import CSV"}</span>
        </Link>
      )}

      {/* 2. Export & Reports Dropdown Menu */}
      <div className="relative z-50">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={() => setMenuOpen(!menuOpen)}
          className="h-9 gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold shadow-2xs transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer text-xs"
        >
          <Download className="size-3.5 text-purple-600" />
          <span>{exporting ? (isAr ? "جارٍ التصدير…" : "Exporting…") : isAr ? "تصدير وطباعة" : "Export & Print"}</span>
          <ChevronDown className="size-3 text-slate-400 ms-0.5" />
        </Button>

        {menuOpen && (
          <>
            {/* Backdrop click dismiss */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />

            <div className="absolute end-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              {/* Option 1: Excel */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onExportExcel();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors text-start dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800">
                  <FileSpreadsheet className="size-4" />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900 dark:text-white">{isAr ? "تصدير كشف إكسل (.xlsx)" : "Export Excel (.xlsx)"}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{isAr ? "جدول بيانات إكسل متوافق" : "Excel compatible spreadsheet"}</p>
                </div>
              </button>

              {/* Option 2: CSV */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onExportCsv();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors text-start dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0 border border-amber-200 dark:bg-amber-950/60 dark:border-amber-800">
                  <FileCode className="size-4" />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900 dark:text-white">{isAr ? "تصدير ملف نصوص (.csv)" : "Export CSV (.csv)"}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{isAr ? "ملف UTF-8 مفصول بفواصل" : "Comma separated values file"}</p>
                </div>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* Option 3: PDF Print Report */}
              <button
                type="button"
                onClick={handlePdfClick}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors text-start dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 shrink-0 border border-purple-200 dark:bg-purple-950/60 dark:border-purple-800">
                  <Printer className="size-4" />
                </div>
                <div>
                  <p className="font-extrabold text-slate-900 dark:text-white">{isAr ? "طباعة تقرير PDF رسمي" : "Print Official PDF Report"}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{isAr ? "تقرير منسق بشعار وهوية المنظمة" : "Branded RTL print document"}</p>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
