"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ShieldOff, SlidersHorizontal, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importPropertyCsvAction, type PropertyImportActionResult } from "@/lib/actions/property-import";
import { IMPORT_KINDS, previewImportRows, type ImportKind, type ImportPreviewResult, type ImportPreviewRow, type MemberImportRow, type UnitImportRow } from "@/lib/import-schemas";

const IMPORT_KIND_LABELS: Record<ImportKind, { ar: string; en: string }> = {
  units: { ar: "استيراد الوحدات", en: "Units import" },
  members: { ar: "استيراد الأعضاء", en: "Members import" },
};

const SAMPLE_INSTRUCTIONS: Record<ImportKind, { ar: string; en: string }> = {
  units: {
    ar: "استخدم ملف CSV يحتوي على أعمدة مثل code, building_code, zone_code, unit_type, custom_type_label, floor_number, area, owner_email, owner_phone, owner_full_name, share_percentage, start_date.",
    en: "Use a CSV file with headers like code, building_code, zone_code, unit_type, custom_type_label, floor_number, area, owner_email, owner_phone, owner_full_name, share_percentage, start_date.",
  },
  members: {
    ar: "استخدم ملف CSV يحتوي على أعمدة مثل full_name, email, phone, is_company.",
    en: "Use a CSV file with headers like full_name, email, phone, is_company.",
  },
};

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<ImportKind>("units");
  const [allowPartial, setAllowPartial] = useState(false);
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<PropertyImportActionResult, FormData>(importPropertyCsvAction, { ok: true, importedRows: 0, skippedRows: 0, failures: [] });
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
    if (!csvText) return null;
    return previewImportRows(csvText, kind as ImportKind, {
      buildingsByCode: buildingMap,
      zonesByCode: zoneMap,
      membersByEmail,
      membersByPhone,
    });
  }, [kind, csvText, buildingMap, zoneMap, membersByEmail, membersByPhone]);

  const selectedResortId = searchParams.get("resort") ?? resortId;

  const validRows = preview?.rows.filter((row) => row.errors.length === 0) ?? [];
  const invalidRows = preview?.rows.filter((row) => row.errors.length > 0) ?? [];

  const onResortChange = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value) params.set("resort", value);
    else params.delete("resort");
    router.replace(`${window.location.pathname}?${params.toString()}`);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setCsvText("");
      setFileName("");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError(isAr ? "اختر ملف CSV." : "Please choose a CSV file.");
      setCsvText("");
      setFileName("");
      return;
    }

    setFileError(null);
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const onResetFile = () => {
    setCsvText("");
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const canImport = Boolean(
    preview &&
      validRows.length > 0 &&
      (allowPartial || invalidRows.length === 0) &&
      (kind === "members" || Boolean(selectedResortId)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-muted/60 bg-muted/70 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm">
            <SlidersHorizontal className="size-4" />
            {isAr ? "اختر نوع الاستيراد" : "Choose import type"}
          </div>
          <div className="flex gap-2">
            {IMPORT_KINDS.map((item) => (
              <Button
                key={item}
                type="button"
                variant={kind === item ? "default" : "outline"}
                size="sm"
                onClick={() => setKind(item)}
              >
                {isAr ? (item === "units" ? "وحدات" : "أعضاء") : item === "units" ? "Units" : "Members"}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="csv-file" className="text-sm font-semibold">
              {isAr ? "ملف CSV" : "CSV file"}
            </Label>
            <input
              ref={fileInputRef}
              id="csv-file"
              name="csv"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {fileName && (
              <p className="text-sm text-muted-foreground">{isAr ? "الملف المحدد" : "Selected file"}: {fileName}</p>
            )}
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>

          <div className="space-y-2">
            {kind === "units" && (
              <>
                <Label htmlFor="resort-select" className="text-sm font-semibold">
                  {isAr ? "المنتجع" : "Resort"}
                </Label>
                <select
                  id="resort-select"
                  value={selectedResortId ?? ""}
                  onChange={(event) => onResortChange(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{isAr ? "اختر منتجعًا" : "Select a resort"}</option>
                  {resorts.map((resort) => (
                    <option key={resort.id} value={resort.id}>
                      {resort.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="flex items-start gap-2">
              <Checkbox
                id="allow-partial"
                checked={allowPartial}
                onCheckedChange={(checked) => setAllowPartial(Boolean(checked))}
              />
              <div>
                <Label htmlFor="allow-partial" className="text-sm font-semibold">
                  {isAr ? "السماح بالاستيراد الجزئي" : "Allow partial import"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? "استمرار الاستيراد للصفوف الصالحة حتى لو كان بعضها غير صالح. الوضع الصارم يتراجع عن كل شيء عند وجود أخطاء."
                    : "Continue importing valid rows when some rows are invalid. Strict mode rolls everything back on any errors."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground/80">
          {isAr ? SAMPLE_INSTRUCTIONS[kind].ar : SAMPLE_INSTRUCTIONS[kind].en}
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="resortId" value={selectedResortId ?? ""} />
        {allowPartial && <input type="hidden" name="allowPartial" value="1" />}

        <div className="rounded-3xl border border-muted/60 bg-muted/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{isAr ? "معاينة الاستيراد" : "Import preview"}</p>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "تحقق من صحة الصفوف قبل استيراد البيانات إلى النظام."
                  : "Review row validation before importing data."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onResetFile}>
                <Trash2 className="size-3" />
                {isAr ? "إعادة اختيار الملف" : "Reset file"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mt-6">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{isAr ? "الصفوف" : "Rows"}</p>
              <p className="mt-2 text-2xl font-semibold">{preview ? preview.rows.length : 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{isAr ? "صالحة" : "Valid"}</p>
              <p className="mt-2 text-2xl font-semibold">{validRows.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{isAr ? "غير صالحة" : "Invalid"}</p>
              <p className="mt-2 text-2xl font-semibold">{invalidRows.length}</p>
            </div>
          </div>

          {preview?.parseError ? (
            <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {isAr ? "تعذر قراءة ملف CSV. تأكد من أن التنسيق صحيح." : "Unable to parse the CSV file. Please make sure the format is valid."}
            </div>
          ) : null}

          {invalidRows.length > 0 && (
            <div className="mt-6 rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <ShieldOff className="size-4" />
                {isAr ? "الصفوف غير الصالحة" : "Invalid rows"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {isAr
                  ? "راجع الأخطاء التالية. يمكنك تمكين الاستيراد الجزئي لاستيراد الصفوف الصحيحة فقط."
                  : "Review the following errors. Enable partial import to import only the valid rows."}
              </p>
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "السطر" : "Row"}</TableHead>
                    <TableHead>{isAr ? "الخطأ" : "Error"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invalidRows.slice(0, 10).map((row) => (
                    <TableRow key={row.rowIndex}>
                      <TableCell>{row.rowIndex}</TableCell>
                      <TableCell>{row.errors.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {preview && validRows.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Check className="size-4 text-emerald-500" />
                {isAr ? "أول الصفوف الصحيحة" : "First valid rows"}
              </div>
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "السطر" : "Row"}</TableHead>
                    <TableHead>{isAr ? "المحتوى" : "Content"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validRows.slice(0, 5).map((row) => (
                    <TableRow key={row.rowIndex}>
                      <TableCell>{row.rowIndex}</TableCell>
                      <TableCell>
                        {kind === "members"
                          ? `${(row as ImportPreviewRow<MemberImportRow>).parsed?.full_name ?? ""} • ${(((row as ImportPreviewRow<MemberImportRow>).parsed?.email ?? "") || ((row as ImportPreviewRow<MemberImportRow>).parsed?.phone ?? ""))}`
                          : `${(row as ImportPreviewRow<UnitImportRow>).parsed?.code ?? ""} • ${(row as ImportPreviewRow<UnitImportRow>).parsed?.unit_type ?? ""} • ${((row as ImportPreviewRow<UnitImportRow>).parsed?.owner_full_name ?? ((row as ImportPreviewRow<UnitImportRow>).ownerHint === "existing_owner" ? (isAr ? "مالك موجود" : "Existing owner") : ""))}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" disabled={!canImport || pending} className="w-full sm:w-auto">
              {pending ? (isAr ? "جارٍ الاستيراد…" : "Importing…") : isAr ? "استيراد" : "Import"}
            </Button>
            <div className="text-sm text-muted-foreground">
              {isAr
                ? "الوضع الافتراضي صارم: أي خطأ يوقف الاستيراد."
                : "The default mode is strict: any error aborts import."}
            </div>
          </div>

          {state && !state.ok && (
            <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {isAr ? "فشل الاستيراد" : "Import failed"}: {state.error}
              {state.validationErrors ? (
                <ul className="mt-2 list-disc ps-5 text-sm text-destructive">
                  {state.validationErrors.map((error) => (
                    <li key={error.rowIndex}>{`${isAr ? "سطر" : "Row"} ${error.rowIndex}: ${error.errors.join(", ")}`}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {state && state.ok && (state.importedRows > 0 || state.skippedRows > 0) && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p>
                {isAr ? "تم الاستيراد بنجاح" : "Import completed successfully."}
              </p>
              <p className="mt-2">
                {isAr
                  ? `تم استيراد ${state.importedRows} صفوف.`
                  : `Imported ${state.importedRows} rows.`}
              </p>
              {state.skippedRows > 0 ? (
                <p className="mt-1">
                  {isAr
                    ? `تم تخطي ${state.skippedRows} صفوف غير صالحة.`
                    : `Skipped ${state.skippedRows} invalid rows.`}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
