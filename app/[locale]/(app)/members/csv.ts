import type { MemberRow } from "./members-table";

export { downloadCsv } from "@/lib/csv";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildMembersCsv(rows: MemberRow[], isAr: boolean): string {
  const headers = isAr
    ? ["الاسم", "البريد", "الهاتف", "عدد الوحدات", "الرصيد الإجمالي", "عليه متأخرات"]
    : ["Name", "Email", "Phone", "Units", "Total balance", "Has arrears"];
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.full_name,
        r.email ?? "",
        r.phone ?? "",
        String(r.units_count),
        r.total_balance.toFixed(2),
        r.has_arrears ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No"),
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(","),
    );
  }
  // UTF-8 BOM so Excel opens the file with correct Arabic-text encoding.
  const BOM = "﻿";
  return BOM + lines.join("\r\n");
}
