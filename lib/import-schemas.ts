import { z } from "zod";

export type ImportKind = "units" | "members";
export const IMPORT_KINDS: ImportKind[] = ["units", "members"];

export const UNIT_TYPES = ["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

const truthyStrings = new Set(["1", "true", "yes", "y", "on", "نعم", "صح", "صحيح", "مفعل", "شركة"]);

/**
 * Converts Eastern Arabic / Hindi digits (٠١٢٣٤٥٦٧٨٩) to standard ASCII digits (0123456789)
 */
export function convertArabicHindiDigits(input: string): string {
  const arabicHindiMap: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  };
  return input.replace(/[٠-٩]/g, (d) => arabicHindiMap[d] ?? d);
}

/**
 * Normalizes header string preserving Arabic letters, English letters, and numbers.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/\\.:]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "");
}

/**
 * Semantic Arabic & English Column Dictionaries for AI Auto-Detection
 */
export const MEMBER_HEADER_DICTIONARY: Record<string, string[]> = {
  full_name: [
    "full_name", "fullname", "name", "member_name", "client_name", "customer_name", "owner_name",
    "الاسم", "اسم_العضو", "الاسم_الكامل", "اسم_المالك", "اسم_العميل", "المالك", "العميل", "اسم_المستأجر",
  ],
  email: [
    "email", "e_mail", "mail", "email_address",
    "البريد", "البريد_الإلكتروني", "البريد_الالكتروني", "الايميل", "الإيميل", "ايميل",
  ],
  phone: [
    "phone", "mobile", "telephone", "tel", "whatsapp", "phone_number", "mobile_number",
    "الهاتف", "رقم_الهاتف", "الموبايل", "رقم_الموبايل", "التليفون", "رقم_التليفون", "الواتساب", "جوال", "رقم_الجوال",
  ],
  is_company: [
    "is_company", "iscompany", "company", "type", "entity_type", "is_corporate",
    "شركة", "نوع_الجهة", "نوع_العضو", "هل_شركة", "كيان_قانوني", "اعتباري",
  ],
};

export const UNIT_HEADER_DICTIONARY: Record<string, string[]> = {
  code: [
    "code", "unit", "unit_code", "unit_number", "unit_no", "unitno", "apartment", "apartment_no", "flat_no",
    "كود_الوحدة", "رقم_الوحدة", "الوحدة", "رقم_الشقة", "الشقة", "كود_الشقة", "رقم_الفيلّا", "رقم_الفيلا", "رقم_المحل", "رقم_المكتب", "كود",
  ],
  building_code: [
    "building", "building_code", "building_name", "building_id", "block", "tower",
    "المبنى", "رقم_المبنى", "كود_المبنى", "اسم_المبنى", "العمارة", "رقم_العمارة", "اسم_العمارة", "البرج", "البلوك", "بلوك",
  ],
  zone_code: [
    "zone", "zone_code", "zone_name", "zone_id", "phase", "sector", "area_zone",
    "المنطقة", "كود_المنطقة", "اسم_المنطقة", "المرحلة", "القطاع", "المجاورة", "الزون",
  ],
  unit_type: [
    "unit_type", "type", "property_type", "category",
    "نوع_الوحدة", "النوع", "تصنيف_الوحدة", "نوع_العقار", "التصنيف",
  ],
  custom_type_label: [
    "custom_type_label", "custom_type", "subtype",
    "وصف_النوع", "نوع_مخصص", "المسمى_المخصص",
  ],
  floor_number: [
    "floor", "floor_number", "floor_no", "level", "storey",
    "الدور", "الطابق", "رقم_الدور", "رقم_الطابق", "المستوى",
  ],
  area: [
    "area", "size", "area_sqm", "sqm", "surface", "unit_area",
    "المساحة", "المساحة_بالمتر", "المساحة_م2", "مساحة_الوحدة", "المساحة_الإجمالية", "المتر_المربع",
  ],
  owner_full_name: [
    "owner_full_name", "owner_name", "owner", "client", "member", "customer",
    "اسم_المالك", "المالك", "اسم_العميل", "العميل", "اسم_المستأجر", "المستأجر", "مالك_الوحدة",
  ],
  owner_phone: [
    "owner_phone", "owner_mobile", "phone", "mobile", "whatsapp",
    "هاتف_المالك", "موبايل_المالك", "تليفون_المالك", "واتساب_المالك", "رقم_التواصل", "الهاتف", "الموبايل",
  ],
  owner_email: [
    "owner_email", "email", "mail",
    "ايميل_المالك", "بريد_المالك", "البريد_الإلكتروني_للمالك", "البريد", "الإيميل",
  ],
  share_percentage: [
    "share_percentage", "share_pct", "share", "ownership_share", "percentage",
    "نسبة_الملكية", "النسبة", "نسبة_الحصة", "نسبة_التملك", "الحصة",
  ],
  start_date: [
    "start_date", "ownership_start_date", "contract_date", "purchase_date", "date",
    "تاريخ_التملك", "تاريخ_البدء", "تاريخ_العقد", "تاريخ_الشراء", "التاريخ",
  ],
};

/**
 * AI Semantic Column Matcher: Determines target field and matching confidence score (0-100%)
 */
export function matchHeaderWithAi(
  header: string,
  kind: ImportKind
): { field: string | null; confidence: number; label: string } {
  const norm = normalizeHeader(header);
  const dict = kind === "members" ? MEMBER_HEADER_DICTIONARY : UNIT_HEADER_DICTIONARY;

  // 1. Direct dictionary lookup
  for (const [field, aliases] of Object.entries(dict)) {
    for (const alias of aliases) {
      if (norm === alias) {
        return { field, confidence: 100, label: header };
      }
    }
  }

  // 2. Fuzzy substring semantic matching
  for (const [field, aliases] of Object.entries(dict)) {
    for (const alias of aliases) {
      if (norm.includes(alias) || alias.includes(norm)) {
        return { field, confidence: 85, label: header };
      }
    }
  }

  return { field: null, confidence: 0, label: header };
}

/**
 * Smart Unit Type AI Resolver
 */
export function resolveUnitTypeWithAi(rawType: string | null | undefined): {
  unitType: UnitType;
  customLabel: string | null;
} {
  if (!rawType || !rawType.trim()) {
    return { unitType: "APARTMENT", customLabel: null };
  }
  const clean = rawType.trim().toLowerCase();

  if (clean.includes("شقة") || clean.includes("شقه") || clean.includes("apart") || clean.includes("flat")) {
    return { unitType: "APARTMENT", customLabel: null };
  }
  if (clean.includes("فيلا") || clean.includes("فيلّا") || clean.includes("villa") || clean.includes("townhouse") || clean.includes("تاون")) {
    return { unitType: "VILLA", customLabel: null };
  }
  if (clean.includes("شاليه") || clean.includes("chalet") || clean.includes("resort") || clean.includes("كابينة")) {
    return { unitType: "CHALET", customLabel: null };
  }
  if (clean.includes("محل") || clean.includes("تجاري") || clean.includes("shop") || clean.includes("store") || clean.includes("معرض")) {
    return { unitType: "SHOP", customLabel: null };
  }
  if (clean.includes("مكتب") || clean.includes("إداري") || clean.includes("اداري") || clean.includes("office") || clean.includes("عيادة")) {
    return { unitType: "OFFICE", customLabel: null };
  }
  if (clean.includes("خدمي") || clean.includes("خدمات") || clean.includes("مخزن") || clean.includes("جراج") || clean.includes("service") || clean.includes("garage")) {
    return { unitType: "SERVICE", customLabel: null };
  }

  const upper = rawType.trim().toUpperCase();
  if (UNIT_TYPES.includes(upper as UnitType)) {
    return { unitType: upper as UnitType, customLabel: null };
  }

  return { unitType: "OTHER", customLabel: rawType.trim() };
}

/**
 * Smart Phone Number AI Cleaner
 */
export function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let clean = convertArabicHindiDigits(phone.trim());
  clean = clean.replace(/[\s\-_()./\\#*]+/g, "");
  if (!clean) return null;
  return clean;
}

/**
 * Smart Area & Currency Number AI Cleaner
 */
export function cleanNumericValue(val: string | null | undefined): number | null {
  if (!val) return null;
  let clean = convertArabicHindiDigits(val.trim());
  clean = clean.replace(/[^0-9.-]/g, "");
  if (!clean) return null;
  const num = Number(clean);
  return Number.isNaN(num) ? null : num;
}

/**
 * Smart Date AI Parser (DD/MM/YYYY, YYYY/MM/DD, DD-MM-YYYY -> YYYY-MM-DD)
 */
export function cleanDateValue(val: string | null | undefined): string | null {
  if (!val) return null;
  let clean = convertArabicHindiDigits(val.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Check YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

const memberSchema = z
  .object({
    full_name: z.string().trim().min(1, "full_name_required"),
    email: z.string().trim().email("invalid_email").optional().nullable(),
    phone: z.string().trim().max(30, "invalid_phone").optional().nullable(),
    is_company: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.email) || Boolean(value.phone) || Boolean(value.full_name), {
    message: "full_name_required",
    path: ["full_name"],
  });

const unitSchema = z
  .object({
    code: z.string().trim().min(1, "code_required"),
    building_id: z.string().uuid().optional().nullable(),
    zone_id: z.string().uuid().optional().nullable(),
    unit_type: z.enum(UNIT_TYPES, "invalid_unit_type"),
    custom_type_label: z.string().trim().max(100, "invalid_custom_type_label").optional().nullable(),
    floor_number: z.number().int().optional().nullable(),
    area: z.number().positive("invalid_area").optional().nullable(),
    owner_id: z.string().uuid().optional().nullable(),
    owner_email: z.string().trim().email("invalid_owner_email").optional().nullable(),
    owner_phone: z.string().trim().max(30, "invalid_owner_phone").optional().nullable(),
    owner_full_name: z.string().trim().max(200, "invalid_owner_full_name").optional().nullable(),
    share_percentage: z.number().min(0.0001, "invalid_share_percentage").max(100, "invalid_share_percentage").default(100),
    start_date: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "invalid_start_date"),
  })
  .refine((value) => value.unit_type !== "OTHER" || Boolean(value.custom_type_label?.trim()), {
    message: "custom_type_label_required",
    path: ["custom_type_label"],
  })
  .refine(
    (value) =>
      Boolean(value.owner_id) ||
      !value.owner_email &&
      !value.owner_phone ||
      Boolean(value.owner_full_name?.trim()),
    {
      message: "owner_full_name_required_for_new_owner",
      path: ["owner_full_name"],
    },
  );

export type MemberImportRow = z.infer<typeof memberSchema>;
export type UnitImportRow = z.infer<typeof unitSchema>;

export type ImportPreviewRow<T> = {
  rowIndex: number;
  raw: Record<string, string>;
  parsed?: T;
  errors: string[];
  warnings: string[];
  ownerHint?: string;
};

export type AiColumnMapping = {
  header: string;
  field: string | null;
  confidence: number;
};

export type ImportPreviewResult<T> = {
  headers: string[];
  mappings: AiColumnMapping[];
  rows: ImportPreviewRow<T>[];
  qualityScore: number;
  parseError?: string;
};

/**
 * Universal CSV / Tab-Delimited Parser
 */
export function parseCsvText(csvText: string) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const delimiter = normalized.includes("\t") && !normalized.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    i += 1;
  }

  if (inQuotes) {
    return { headers: [], rows: [], error: "unterminated_quote" };
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], error: "empty_csv" };
  }

  const headerRow = rows[0].map((value) => value.trim());
  const dataRows = rows.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ""));

  return { headers: headerRow, rows: dataRows, error: undefined };
}

/**
 * AI-Enhanced Preview Import Processor
 */
export function previewImportRows(
  csvText: string,
  kind: ImportKind,
  config: {
    buildingsByCode?: Map<string, string>;
    zonesByCode?: Map<string, string>;
    membersByEmail?: Map<string, string>;
    membersByPhone?: Map<string, string>;
    customMappings?: Record<string, string>;
  } = {},
): ImportPreviewResult<any> {
  const parsedCsv = parseCsvText(csvText);
  if (parsedCsv.error) {
    return { headers: [], mappings: [], rows: [], qualityScore: 0, parseError: parsedCsv.error };
  }

  const headers = parsedCsv.headers;

  // Build AI Column Mappings
  const mappings: AiColumnMapping[] = headers.map((header) => {
    if (config.customMappings?.[header]) {
      return {
        header,
        field: config.customMappings[header],
        confidence: 100,
      };
    }
    const match = matchHeaderWithAi(header, kind);
    return {
      header,
      field: match.field,
      confidence: match.confidence,
    };
  });

  const hasCodeOrName = mappings.some((m) =>
    kind === "units" ? m.field === "code" : m.field === "full_name"
  );

  if (!hasCodeOrName) {
    return {
      headers,
      mappings,
      rows: [],
      qualityScore: 0,
      parseError: kind === "units" ? "missing_code_column" : "missing_name_column",
    };
  }

  let totalValid = 0;

  const rows = parsedCsv.rows.map((cells, index) => {
    const raw: Record<string, string> = {};
    for (let cellIndex = 0; cellIndex < mappings.length; cellIndex += 1) {
      const mapping = mappings[cellIndex];
      if (!mapping.field) continue;
      raw[mapping.field] = (cells[cellIndex] ?? "").trim();
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (kind === "members") {
      const cleanedPhone = cleanPhoneNumber(raw.phone);
      if (raw.phone && cleanedPhone !== raw.phone) {
        warnings.push("phone_auto_cleaned");
      }

      const parsed = memberSchema.safeParse({
        full_name: raw.full_name ?? "",
        email: raw.email ? raw.email.toLowerCase() : null,
        phone: cleanedPhone,
        is_company: truthyStrings.has((raw.is_company || "").toLowerCase()),
      });

      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue: { message: string }) => issue.message));
      } else {
        totalValid += 1;
      }

      return {
        rowIndex: index + 2,
        raw,
        parsed: parsed.success ? parsed.data : undefined,
        errors,
        warnings,
        ownerHint: undefined,
      };
    }

    // Units Import AI Processing
    const buildingCode = (raw.building_code || "").trim();
    const zoneCode = (raw.zone_code || "").trim();

    const resolvedBuildingId = buildingCode
      ? config.buildingsByCode?.get(buildingCode.toLowerCase()) ?? null
      : null;
    const resolvedZoneId = zoneCode
      ? config.zonesByCode?.get(zoneCode.toLowerCase()) ?? null
      : null;

    if (buildingCode && !resolvedBuildingId) {
      warnings.push(`unknown_building_${buildingCode}`);
    }
    if (zoneCode && !resolvedZoneId) {
      warnings.push(`unknown_zone_${zoneCode}`);
    }

    // AI Clean Phone & Email
    const cleanedOwnerPhone = cleanPhoneNumber(raw.owner_phone);
    const cleanedOwnerEmail = raw.owner_email ? raw.owner_email.toLowerCase() : null;
    const cleanedArea = cleanNumericValue(raw.area);
    const cleanedFloor = cleanNumericValue(raw.floor_number);
    const cleanedShare = cleanNumericValue(raw.share_percentage) ?? 100;
    const cleanedDate = cleanDateValue(raw.start_date);

    // AI Unit Type Resolution
    const { unitType, customLabel } = resolveUnitTypeWithAi(raw.unit_type);

    let ownerId: string | null = null;
    let ownerHint: string | undefined;

    if (cleanedOwnerEmail) {
      const match = config.membersByEmail?.get(cleanedOwnerEmail);
      if (match) {
        ownerId = match;
        ownerHint = "existing_owner";
      }
    }
    if (!ownerId && cleanedOwnerPhone) {
      const match = config.membersByPhone?.get(cleanedOwnerPhone);
      if (match) {
        ownerId = match;
        ownerHint = "existing_owner";
      }
    }

    if (!ownerId && (cleanedOwnerEmail || cleanedOwnerPhone)) {
      if (!raw.owner_full_name) {
        errors.push("owner_full_name_required_for_new_owner");
      } else {
        ownerHint = "create_owner";
      }
    }

    const parsed = unitSchema.safeParse({
      code: raw.code ?? "",
      building_id: resolvedBuildingId,
      zone_id: resolvedZoneId,
      unit_type: unitType,
      custom_type_label: customLabel || raw.custom_type_label || null,
      floor_number: cleanedFloor !== null ? Math.trunc(cleanedFloor) : null,
      area: cleanedArea,
      owner_id: ownerId,
      owner_email: cleanedOwnerEmail,
      owner_phone: cleanedOwnerPhone,
      owner_full_name: raw.owner_full_name || null,
      share_percentage: cleanedShare,
      start_date: cleanedDate,
    });

    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue: { message: string }) => issue.message));
    } else {
      totalValid += 1;
    }

    return {
      rowIndex: index + 2,
      raw,
      parsed: parsed.success
        ? {
            ...parsed.data,
            start_date: parsed.data.start_date ?? null,
            custom_type_label: parsed.data.custom_type_label ?? null,
            building_id: parsed.data.building_id ?? null,
            zone_id: parsed.data.zone_id ?? null,
            owner_id: parsed.data.owner_id ?? null,
            owner_email: parsed.data.owner_email ?? null,
            owner_phone: parsed.data.owner_phone ?? null,
            owner_full_name: parsed.data.owner_full_name ?? null,
          }
        : undefined,
      errors,
      warnings,
      ownerHint,
    };
  });

  const qualityScore =
    rows.length > 0 ? Math.round((totalValid / rows.length) * 100) : 0;

  return { headers, mappings, rows, qualityScore };
}

export function buildUnitsImportRows(rows: ImportPreviewRow<UnitImportRow>[]) {
  return rows
    .filter((row) => row.errors.length === 0 && row.parsed)
    .map((row) => row.parsed!);
}

export function buildMembersImportRows(rows: ImportPreviewRow<MemberImportRow>[]) {
  return rows
    .filter((row) => row.errors.length === 0 && row.parsed)
    .map((row) => row.parsed!);
}
