import { unitTypeLabel, type UnitRow } from "./units-table";

export { downloadCsv } from "@/lib/csv";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildUnitsCsv(rows: UnitRow[], isAr: boolean): string {
  const headers = isAr
    ? ["كود الوحدة", "المبنى", "المنطقة", "المساحة (م²)", "النوع", "حالة الإشغال", "المالك الحالي", "الرصيد المالي", "عليها متأخرات"]
    : ["Unit Code", "Building", "Zone", "Area (m²)", "Type", "Occupancy", "Current Owner", "Financial Balance", "Has Arrears"];
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        (isAr ? r.building_name_ar : r.building_name_en) ?? "",
        (isAr ? r.zone_name_ar : r.zone_name_en) ?? "",
        r.area ? String(r.area) : "",
        unitTypeLabel(r, isAr),
        r.occupancy_status === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : isAr ? "شاغرة" : "Vacant",
        r.owner_name ?? "",
        r.balance.toFixed(2),
        r.has_arrears ? (isAr ? "نعم" : "Yes") : isAr ? "لا" : "No",
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(","),
    );
  }
  // UTF-8 BOM so Microsoft Excel opens CSV with correct Arabic text encoding
  const BOM = "\uFEFF";
  return BOM + lines.join("\r\n");
}

export function buildUnitsExcelHtml(rows: UnitRow[], isAr: boolean): string {
  const headers = isAr
    ? ["كود الوحدة", "المبنى", "المنطقة", "المساحة (م²)", "النوع", "حالة الإشغال", "المالك الحالي", "الرصيد المالي", "عليها متأخرات"]
    : ["Unit Code", "Building", "Zone", "Area (m²)", "Type", "Occupancy", "Current Owner", "Financial Balance", "Has Arrears"];

  const tableRows = rows
    .map((r) => {
      const bld = (isAr ? r.building_name_ar : r.building_name_en) ?? "—";
      const zne = (isAr ? r.zone_name_ar : r.zone_name_en) ?? "—";
      const areaStr = r.area ? String(r.area) : "—";
      const typeStr = unitTypeLabel(r, isAr);
      const occStr = r.occupancy_status === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant");
      const ownerStr = r.owner_name ?? "—";
      const balStr = r.balance.toFixed(2);
      const arrStr = r.has_arrears ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No");

      return `
        <tr>
          <td>${r.code}</td>
          <td>${bld}</td>
          <td>${zne}</td>
          <td>${areaStr}</td>
          <td>${typeStr}</td>
          <td>${occStr}</td>
          <td>${ownerStr}</td>
          <td>${balStr}</td>
          <td>${arrStr}</td>
        </tr>`;
    })
    .join("");

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]>
      <xml>
       <x:ExcelWorkbook>
        <x:ExcelWorksheets>
         <x:ExcelWorksheet>
          <x:Name>Units</x:Name>
          <x:WorksheetOptions>
           ${isAr ? "<x:DisplayRightToLeft/>" : ""}
           <x:ProtectContents>False</x:ProtectContents>
          </x:WorksheetOptions>
         </x:ExcelWorksheet>
        </x:ExcelWorksheets>
       </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Segoe UI, Tahoma, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; }
        td { border: 1px solid #e2e8f0; padding: 6px; text-align: ${isAr ? "right" : "left"}; }
      </style>
    </head>
    <body dir="${isAr ? "rtl" : "ltr"}">
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>`;
}

export function downloadExcelFile(filename: string, htmlContent: string) {
  const blob = new Blob(["\uFEFF", htmlContent], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
