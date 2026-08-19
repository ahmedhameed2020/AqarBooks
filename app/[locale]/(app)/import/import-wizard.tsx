"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importPropertyCsvAction,
  type PropertyImportActionResult,
} from "@/lib/actions/property-import";
import {
  IMPORT_KINDS,
  previewImportRows,
  type ImportKind,
  type ImportPreviewResult,
  type ImportPreviewRow,
  type MemberImportRow,
  type UnitImportRow,
} from "@/lib/import-schemas";
import {
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  Zap,
  ShieldCheck,
  Building2,
  Users,
  Download,
  Clipboard,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  FileCheck,
  Layers,
  ArrowRight,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import ExcelJS from "exceljs";

const SAMPLE_UNITS_CSV = `code,building_code,zone_code,unit_type,floor_number,area,owner_full_name,owner_phone,owner_email,share_percentage
A-101,B1,Z1,شقة,1,125.5,أحمد عبد الحميد,01001234567,ahmed@example.com,100
V-204,B2,Z1,فيلا,0,320.0,مروان الشريف,+201098765432,marwan@example.com,100
S-005,B1,Z2,محل تجاري,0,85.0,سارة إبراهيم,01122334455,sara@example.com,50
C-302,B3,Z1,شاليه,3,95.0,كريم حسن,01233445566,karim@example.com,100`;

const SAMPLE_MEMBERS_CSV = `full_name,phone,email,is_company
أحمد عبد الحميد,01001234567,ahmed@example.com,لا
شركة الأهرام للتطوير العقاري,+201200000000,info@ahram-dev.com,نعم
سارة إبراهيم محمد,01122334455,sara@example.com,لا
م. مروان الشريف,01098765432,marwan@example.com,لا`;

export function ImportWizard({
  locale,
  resorts,
  resortId,
  buildings,
  zones,
  members,
}: {
  locale: string;
  organizationId: string;
  resorts: { id: string; name: string }[];
  resortId?: string;
  buildings: { id: string; code?: string; name_ar?: string; name_en?: string }[];
  zones: { id: string; code?: string; name_ar?: string; name_en?: string }[];
  members: { id: string; full_name: string; email: string | null; phone: string | null }[];
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [kind, setKind] = useState<ImportKind>("units");
  const [allowPartial, setAllowPartial] = useState(true);
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "VALID" | "INVALID">("ALL");
  const [customMappings, setCustomMappings] = useState<Record<string, string>>({});
  const [isPasting, setIsPasting] = useState(false);

  const [state, formAction, pending] = useActionState<PropertyImportActionResult, FormData>(
    async (prev, formData) => {
      const res = await importPropertyCsvAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم الاستيراد والترحيل بنجاح! 🎉" : "Import Completed Successfully! 🎉",
          description: isAr
            ? `تم استيراد ${res.importedRows} سجل بنجاح إلى قاعدة البيانات.`
            : `Successfully imported ${res.importedRows} records.`,
          variant: "success",
        });
      } else {
        toast.show({
          title: isAr ? "فشل الاستيراد" : "Import Failed",
          description: res.failures?.[0]?.message || (isAr ? "يرجى مراجعة الأخطاء." : "Check errors."),
          variant: "error",
        });
      }
      return res;
    },
    { ok: true, importedRows: 0, skippedRows: 0, failures: [] }
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const buildingMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const building of buildings) {
      if (building?.code) map.set(building.code.trim().toLowerCase(), building.id);
      if (building?.name_ar) map.set(building.name_ar.trim().toLowerCase(), building.id);
      if (building?.name_en) map.set(building.name_en.trim().toLowerCase(), building.id);
    }
    return map;
  }, [buildings]);

  const zoneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const zone of zones) {
      if (zone?.code) map.set(zone.code.trim().toLowerCase(), zone.id);
      if (zone?.name_ar) map.set(zone.name_ar.trim().toLowerCase(), zone.id);
      if (zone?.name_en) map.set(zone.name_en.trim().toLowerCase(), zone.id);
    }
    return map;
  }, [zones]);

  const membersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      if (member?.email) map.set(member.email.trim().toLowerCase(), member.id);
    }
    return map;
  }, [members]);

  const membersByPhone = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      if (member?.phone) map.set(member.phone.trim().toLowerCase(), member.id);
    }
    return map;
  }, [members]);

  const preview = useMemo(() => {
    if (!csvText.trim()) return null;
    return previewImportRows(csvText, kind as ImportKind, {
      buildingsByCode: buildingMap,
      zonesByCode: zoneMap,
      membersByEmail,
      membersByPhone,
      customMappings,
    });
  }, [kind, csvText, buildingMap, zoneMap, membersByEmail, membersByPhone, customMappings]);

  const selectedResortId = searchParams.get("resort") ?? resortId;

  const validRows = preview?.rows.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.filter((row) => row.errors.length > 0) ?? [];

  const onResortChange = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value) params.set("resort", value);
    else params.delete("resort");
    router.replace(`${window.location.pathname}?${params.toString()}`);
  };

  /**
   * Universal File Parser: Supports .xlsx, .xls, .csv, .tsv
   */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();

    try {
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        setIsParsingExcel(true);
        const workbook = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new Error("Empty worksheet");
        }

        const rows: string[][] = [];
        worksheet.eachRow((row) => {
          const values: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            let val = cell.value;
            if (val && typeof val === "object" && "result" in val) {
              val = (val as any).result;
            }
            if (val && typeof val === "object" && "text" in val) {
              val = (val as any).text;
            }
            values[colNumber - 1] = val !== null && val !== undefined ? String(val).trim() : "";
          });
          if (values.some((v) => v !== "")) {
            rows.push(values);
          }
        });

        const csvContent = rows
          .map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(","))
          .join("\n");

        setCsvText(csvContent);
        setIsParsingExcel(false);

        toast.show({
          title: isAr ? "تمت قراءة ملف Excel بالذكاء الاصطناعي 📊" : "Excel Parsed with AI 📊",
          description: isAr
            ? `تم تحليل ${rows.length - 1} صف ومطابقة الأعمدة آلياً.`
            : `Parsed ${rows.length - 1} rows and auto-mapped columns.`,
          variant: "success",
        });
      } else {
        const text = await file.text();
        setCsvText(text);
        toast.show({
          title: isAr ? "تم قراءة الملف بالذكاء الاصطناعي 🧠" : "AI Parsed File",
          description: isAr ? "تم التعرف التلقائي على الأعمدة وتنسيق البيانات." : "Columns auto-mapped successfully.",
          variant: "success",
        });
      }
    } catch (err: any) {
      setIsParsingExcel(false);
      setFileError(isAr ? "فشل قراءة الملف. تأكد من سلامة ملف Excel أو CSV." : "Could not read file.");
    }
  };

  /**
   * Download sample Excel workbook (.xlsx)
   */
  const downloadExcelTemplate = async (type: ImportKind) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type === "units" ? "الوحدات" : "الأعضاء");

    if (type === "units") {
      sheet.columns = [
        { header: "كود الوحدة", key: "code", width: 15 },
        { header: "المبنى", key: "building_code", width: 12 },
        { header: "المنطقة", key: "zone_code", width: 12 },
        { header: "نوع الوحدة", key: "unit_type", width: 15 },
        { header: "الدور", key: "floor_number", width: 10 },
        { header: "المساحة (م2)", key: "area", width: 15 },
        { header: "اسم المالك", key: "owner_full_name", width: 22 },
        { header: "هاتف المالك", key: "owner_phone", width: 18 },
        { header: "بريد المالك", key: "owner_email", width: 25 },
        { header: "نسبة الملكية", key: "share_percentage", width: 14 },
      ];

      sheet.addRow({
        code: "A-101",
        building_code: "B1",
        zone_code: "Z1",
        unit_type: "شقة",
        floor_number: 1,
        area: 125.5,
        owner_full_name: "أحمد عبد الحميد",
        owner_phone: "01001234567",
        owner_email: "ahmed@example.com",
        share_percentage: 100,
      });
      sheet.addRow({
        code: "V-204",
        building_code: "B2",
        zone_code: "Z1",
        unit_type: "فيلا",
        floor_number: 0,
        area: 320.0,
        owner_full_name: "مروان الشريف",
        owner_phone: "+201098765432",
        owner_email: "marwan@example.com",
        share_percentage: 100,
      });
    } else {
      sheet.columns = [
        { header: "الاسم الكامل", key: "full_name", width: 25 },
        { header: "رقم الهاتف", key: "phone", width: 18 },
        { header: "البريد الإلكتروني", key: "email", width: 25 },
        { header: "هل شركة؟", key: "is_company", width: 12 },
      ];

      sheet.addRow({
        full_name: "أحمد عبد الحميد",
        phone: "01001234567",
        email: "ahmed@example.com",
        is_company: "لا",
      });
      sheet.addRow({
        full_name: "شركة الأهرام للتطوير العقاري",
        phone: "+201200000000",
        email: "info@ahram-dev.com",
        is_company: "نعم",
      });
    }

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      type === "units"
        ? "aqarbooks_units_smart_template.xlsx"
        : "aqarbooks_members_smart_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canImport = Boolean(
    preview &&
      validRows.length > 0 &&
      (allowPartial || invalidRows.length === 0) &&
      (kind === "members" || Boolean(selectedResortId))
  );

  const displayedRows =
    activeTab === "VALID"
      ? validRows
      : activeTab === "INVALID"
      ? invalidRows
      : preview?.rows ?? [];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-20">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. CLEAN EXECUTIVE HERO BANNER (MATCHES LIGHT & DARK MODES)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 px-3 py-1 text-xs font-bold gap-1.5 shadow-2xs">
                <BrainCircuit className="size-4 text-indigo-600 dark:text-indigo-400" />
                <span>{isAr ? "المستورد الذكي بالذكاء الاصطناعي" : "AI Smart Importer 2.0"}</span>
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                {isAr ? "يدعم Excel و CSV" : "Supports Excel (.xlsx) & CSV"}
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "استيراد ومعالجة البيانات العقارية بالذكاء الاصطناعي" : "AI Universal Real Estate Data Import Studio"}
            </h1>

            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-medium">
              {isAr
                ? "ارفع ملفات Excel (.xlsx, .xls) أو CSV بأي تسميات أعمدة عربية أو إنجليزية. يقوم الذكاء الاصطناعي بالمطابقة الدلالية، تنظيف الهواتف، وتصحيح التواريخ والمساحات آلياً."
                : "Upload Excel (.xlsx/.xls) or CSV files with any Arabic/English headers. AI handles column mapping, data cleaning, and validation automatically."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              onClick={() => downloadExcelTemplate(kind)}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 px-4 gap-1.5 rounded-xl shadow-xs"
            >
              <FileSpreadsheet className="size-4" />
              <span>{isAr ? "تحميل نموذج إكسيل (.xlsx)" : "Download Excel (.xlsx)"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. STEP 1: IMPORT TYPE & ENTITY SELECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ENTITY TYPE SELECTOR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "1. حدد نوع البيانات المطلوب استيرادها" : "1. Select Data Type to Import"}
          </Label>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setKind("units");
                setCustomMappings({});
              }}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                kind === "units"
                  ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20"
                  : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-800/40"
              }`}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0 shadow-sm">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-black text-slate-900 dark:text-white block">
                  {isAr ? "الوحدات والعقارات" : "Units & Assets"}
                </span>
                <span className="text-[11px] text-slate-400 block truncate">
                  {isAr ? "الشقق، الفلل، المحلات، والملاك" : "Apartments, Villas, Shops"}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setKind("members");
                setCustomMappings({});
              }}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                kind === "members"
                  ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/40 ring-2 ring-purple-500/20"
                  : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-800/40"
              }`}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600 text-white shrink-0 shadow-sm">
                <Users className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-black text-slate-900 dark:text-white block">
                  {isAr ? "الأعضاء والملاك" : "Members & Owners"}
                </span>
                <span className="text-[11px] text-slate-400 block truncate">
                  {isAr ? "دليل الملاك والمستأجرين والشركات" : "Owners, Tenants, Companies"}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* RESORT / PROPERTY SCOPE (FOR UNITS) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "2. حدد الكيان العقاري / المشروع التابع" : "2. Select Target Real Estate Entity"}
          </Label>

          {kind === "units" ? (
            <div className="space-y-2">
              <select
                value={selectedResortId ?? ""}
                onChange={(e) => onResortChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                <option value="">{isAr ? "— اختر المشروع أو المنتجع العقاري —" : "— Select Property / Resort —"}</option>
                {resorts.map((resort) => (
                  <option key={resort.id} value={resort.id}>
                    {resort.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? "سيتم ربط الوحدات تلقائياً بالمباني والمناطق المعرفة داخل هذا الكيان."
                  : "Units will be automatically linked to zones and buildings inside this entity."}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 dark:bg-slate-800 dark:border-slate-700">
              {isAr ? "استيراد الأعضاء يسري على مستوى كافة مشاريع المنشأة العامة." : "Member import applies organization-wide."}
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. STEP 2: DRAG & DROP EXCEL / CSV OR PASTE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-600" />
            <span>{isAr ? "3. رفع ملف Excel (.xlsx, .xls) أو CSV أو اللصق المباشر" : "3. Upload Excel / CSV or Paste from Sheet"}</span>
          </Label>

          <button
            type="button"
            onClick={() => setIsPasting(!isPasting)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
          >
            <Clipboard className="size-3.5" />
            <span>{isPasting ? (isAr ? "التبديل إلى رفع ملف" : "Switch to File Upload") : (isAr ? "لصق مباشر من جدول إكسيل" : "Paste from Excel Sheet")}</span>
          </button>
        </div>

        {!isPasting ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/20 p-8 text-center transition-all cursor-pointer dark:border-slate-700 dark:bg-slate-800/40"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.tsv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="size-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              {isParsingExcel ? (
                <RefreshCw className="size-7 animate-spin" />
              ) : (
                <UploadCloud className="size-7" />
              )}
            </div>

            <p className="text-sm font-black text-slate-900 dark:text-white">
              {fileName ? fileName : (isAr ? "اسحب وأفلت ملف Excel أو CSV هنا، أو انقر للاختيار" : "Drop Excel (.xlsx) or CSV file here or click to browse")}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isAr
                ? "يدعم ملفات Microsoft Excel (.xlsx, .xls) وملفات CSV المشفرة بأسماء أعمدة عربية أو إنجليزية."
                : "Supports Microsoft Excel (.xlsx, .xls) and CSV files with Arabic or English column headers."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={
                isAr
                  ? "انسخ الصفوف من برنامج Excel والصقها هنا مباشرة (نسخ ثم Ctrl+V)..."
                  : "Copy rows from Excel and paste here directly..."
              }
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        )}

        {fileError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          4. AI COLUMN MAPPING MATRIX
          ────────────────────────────────────────────────────────────────────────── */}
      {preview && preview.mappings && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <BrainCircuit className="size-4.5 text-indigo-600" />
              <h2 className="text-sm font-black text-slate-950 dark:text-white">
                {isAr ? "مصفوفة التعرف الذكي على الأعمدة (AI Column Mappings)" : "AI Column Mapping Matrix"}
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {isAr ? "تم التعرف آلياً على الحقول التالية:" : "Auto-matched fields:"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {preview.mappings.map((mapping, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {mapping.header}
                  </span>
                  {mapping.field ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] font-bold py-0">
                      {mapping.confidence}% {isAr ? "تطابق" : "match"}
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-200 text-slate-600 border-slate-300 text-[9px] font-bold py-0">
                      {isAr ? "غير مستخدم" : "ignored"}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                  <ArrowRight className="size-3" />
                  <span>{mapping.field || (isAr ? "تجاهل العمود" : "Ignore")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          5. AI DATA HEALTH & QUALITY METRICS
          ────────────────────────────────────────────────────────────────────────── */}
      {preview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* QUALITY SCORE */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex items-center gap-4">
            <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-black text-lg shadow-sm">
              {preview.qualityScore}%
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">{isAr ? "مؤشر جودة وصحة البيانات" : "Data Health Index"}</p>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                {preview.qualityScore >= 90
                  ? (isAr ? "ممتازة وجاهزة للاستيراد" : "Ready to Import")
                  : (isAr ? "تحتوي بعض الملاحظات" : "Needs Review")}
              </p>
            </div>
          </div>

          {/* VALID ROWS */}
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4.5 shadow-xs dark:border-emerald-900/60 dark:bg-slate-900 flex items-center gap-4">
            <div className="size-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono font-black text-lg shadow-sm">
              {validRows.length}
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "سجلات سليمة وموثقة" : "Valid Records"}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? "جاهزة للترحيل الفوري" : "Ready for instant posting"}
              </p>
            </div>
          </div>

          {/* INVALID ROWS */}
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4.5 shadow-xs dark:border-rose-900/60 dark:bg-slate-900 flex items-center gap-4">
            <div className="size-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center font-mono font-black text-lg shadow-sm">
              {invalidRows.length}
            </div>
            <div>
              <p className="text-xs font-bold text-rose-700 dark:text-rose-400">{isAr ? "سجلات تتطلب مراجعة" : "Records with Errors"}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {invalidRows.length > 0 ? (isAr ? "يمكن تجاهلها بالاستيراد الجزئي" : "Skipped if partial allowed") : (isAr ? "لا توجد أخطاء" : "No errors")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          6. LIVE PREVIEW TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {preview && preview.rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4.5 text-indigo-600" />
              <h2 className="text-sm font-black text-slate-950 dark:text-white">
                {isAr ? "المعاينة التفاعلية المباشرة للسجلات" : "Live Interactive Data Preview"}
              </h2>
            </div>

            {/* FILTER TABS */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("ALL")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "ALL"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {isAr ? "الكل" : "All"} ({preview.rows.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("VALID")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "VALID"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {isAr ? "السليمة فقط" : "Valid"} ({validRows.length})
              </button>
              {invalidRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("INVALID")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    activeTab === "INVALID"
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {isAr ? "الأخطاء" : "Errors"} ({invalidRows.length})
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60">
                <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
                  <TableHead className="w-12 text-xs font-bold">#</TableHead>
                  <TableHead className="text-xs font-bold">{isAr ? "الحالة والتحقق" : "Status"}</TableHead>
                  {kind === "units" ? (
                    <>
                      <TableHead className="text-xs font-bold">{isAr ? "كود الوحدة" : "Unit Code"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "نوع الوحدة" : "Type"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "المساحة (م²)" : "Area"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "المالك المرتبط" : "Owner"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "الهاتف" : "Phone"}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-xs font-bold">{isAr ? "الاسم الكامل" : "Full Name"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "الهاتف" : "Phone"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "البريد الإلكتروني" : "Email"}</TableHead>
                      <TableHead className="text-xs font-bold">{isAr ? "النوع" : "Type"}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRows.map((row, index) => {
                  const isValid = row.errors.length === 0;
                  return (
                    <TableRow
                      key={index}
                      className={
                        !isValid
                          ? "bg-rose-50/40 dark:bg-rose-950/20"
                          : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      }
                    >
                      <TableCell className="font-mono text-xs text-slate-400">{row.rowIndex}</TableCell>
                      <TableCell>
                        {isValid ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold gap-1">
                            <CheckCircle2 className="size-3" />
                            <span>{isAr ? "سليم وموثق" : "Valid"}</span>
                          </Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold gap-1">
                              <AlertCircle className="size-3" />
                              <span>{isAr ? "مطلوب مراجعة" : "Invalid"}</span>
                            </Badge>
                            <p className="text-[10px] text-rose-600 font-bold max-w-xs truncate">
                              {row.errors.join(", ")}
                            </p>
                          </div>
                        )}
                      </TableCell>

                      {kind === "units" ? (
                        <>
                          <TableCell className="font-mono text-xs font-black text-slate-900 dark:text-white">
                            {row.parsed?.code || row.raw.code || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-bold">
                              {row.parsed?.unit_type || row.raw.unit_type || "APARTMENT"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.parsed?.area ? `${row.parsed.area} م²` : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-bold text-slate-900 dark:text-white block">
                              {row.parsed?.owner_full_name || row.raw.owner_full_name || "—"}
                            </span>
                            {row.ownerHint === "existing_owner" && (
                              <span className="text-[10px] text-emerald-600 font-bold">
                                {isAr ? "✓ مالك مسجل مسبقاً" : "Existing owner"}
                              </span>
                            )}
                            {row.ownerHint === "create_owner" && (
                              <span className="text-[10px] text-indigo-600 font-bold">
                                {isAr ? "+ سيتم إنشاء مالك جديد" : "New owner created"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {row.parsed?.owner_phone || row.raw.owner_phone || "—"}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-bold text-xs text-slate-900 dark:text-white">
                            {row.parsed?.full_name || row.raw.full_name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {row.parsed?.phone || row.raw.phone || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {row.parsed?.email || row.raw.email || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {row.parsed?.is_company ? (isAr ? "شركة" : "Company") : (isAr ? "فرد" : "Individual")}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          7. EXECUTION ACTION BAR
          ────────────────────────────────────────────────────────────────────────── */}
      {preview && (
        <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="resortId" value={selectedResortId ?? ""} />
          <input type="hidden" name="csvText" value={csvText} />
          <input type="hidden" name="allowPartial" value={String(allowPartial)} />

          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-partial"
              checked={allowPartial}
              onCheckedChange={(checked) => setAllowPartial(Boolean(checked))}
            />
            <Label htmlFor="allow-partial" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              {isAr
                ? "السماح بالاستيراد الجزئي (استيراد السجلات السليمة وتجاوز السجلات التي بها أخطاء)"
                : "Allow partial import (Import valid rows and skip invalid ones)"}
            </Label>
          </div>

          <Button
            type="submit"
            disabled={!canImport || pending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-10 px-8 rounded-xl shadow-md gap-2"
          >
            <Sparkles className="size-4" />
            <span>
              {pending
                ? (isAr ? "جاري الاستيراد والترحيل بالذكاء الاصطناعي..." : "Importing with AI...")
                : (isAr ? `تنفيذ الاستيراد الذكي (${validRows.length} سجل)` : `Execute AI Import (${validRows.length} rows)`)}
            </span>
          </Button>
        </form>
      )}
    </div>
  );
}
