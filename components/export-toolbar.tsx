"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Download, FileUp, FileSpreadsheet, FileCode, Printer, ChevronDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

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
  showImport = true,
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
      {/* 1. Import Wizard Link */}
      {showImport && importHref && (
        <Link
          href={importHref}
          locale={locale}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "gap-1.5 font-medium shadow-2xs hover:bg-muted/60",
          })}
        >
          <FileUp className="size-3.5 text-primary" />
          <span>{isAr ? "استيراد ملف" : "Import File"}</span>
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
          className="gap-1.5 font-medium shadow-2xs hover:bg-muted/60"
        >
          <Download className="size-3.5 text-primary" />
          <span>{exporting ? (isAr ? "جارٍ التصدير…" : "Exporting…") : isAr ? "تصدير وتقارير" : "Export & Reports"}</span>
          <ChevronDown className="size-3 text-muted-foreground ms-0.5" />
        </Button>

        {menuOpen && (
          <>
            {/* Backdrop click dismiss */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            
            <div className="absolute end-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl">
              {/* Option 1: Excel */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onExportExcel();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-popover-foreground hover:bg-muted transition-colors text-start"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
                  <FileSpreadsheet className="size-4" />
                </div>
                <div>
                  <p className="font-semibold">{isAr ? "تصدير إكسل (.xlsx)" : "Export Excel (.xlsx)"}</p>
                  <p className="text-[10px] text-muted-foreground">{isAr ? "جدول بيانات إكسل متوافق" : "Excel compatible spreadsheet"}</p>
                </div>
              </button>

              {/* Option 2: CSV */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onExportCsv();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-popover-foreground hover:bg-muted transition-colors text-start"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                  <FileCode className="size-4" />
                </div>
                <div>
                  <p className="font-semibold">{isAr ? "تصدير CSV (.csv)" : "Export CSV (.csv)"}</p>
                  <p className="text-[10px] text-muted-foreground">{isAr ? "ملف نصوص UTF-8 مفصول بفاصلة" : "Comma separated values file"}</p>
                </div>
              </button>

              <div className="my-1 border-t border-border/60" />

              {/* Option 3: PDF Print Report */}
              <button
                type="button"
                onClick={handlePdfClick}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-popover-foreground hover:bg-muted transition-colors text-start"
              >
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 shrink-0">
                  <Printer className="size-4" />
                </div>
                <div>
                  <p className="font-semibold">{isAr ? "طباعة تقرير PDF رسمي" : "Print Executive PDF Report"}</p>
                  <p className="text-[10px] text-muted-foreground">{isAr ? "تقرير تنفيذي منسق بشعار المنظمة" : "Branded RTL print document"}</p>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
