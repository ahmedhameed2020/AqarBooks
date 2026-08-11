import { z } from "zod";

export type ImportKind = "units" | "members";
export const IMPORT_KINDS: ImportKind[] = ["units", "members"];

export const UNIT_TYPES = ["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

const truthyStrings = new Set(["1", "true", "yes", "y", "on"]);

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const MEMBER_HEADER_ALIASES: Record<string, string> = {
  fullname: "full_name",
  full_name: "full_name",
  name: "full_name",
  email: "email",
  phone: "phone",
  iscompany: "is_company",
  is_company: "is_company",
  company: "is_company",
};

const UNIT_HEADER_ALIASES: Record<string, string> = {
  code: "code",
  unit: "code",
  unit_code: "code",
  building: "building_code",
  building_code: "building_code",
  building_name: "building_code",
  building_id: "building_id",
  zone: "zone_code",
  zone_code: "zone_code",
  zone_name: "zone_code",
  zone_id: "zone_id",
  type: "unit_type",
  unit_type: "unit_type",
  custom_type_label: "custom_type_label",
  custom_type: "custom_type_label",
  floor: "floor_number",
  floor_number: "floor_number",
  area: "area",
  size: "area",
  owner_email: "owner_email",
  email: "owner_email",
  owner_phone: "owner_phone",
  phone: "owner_phone",
  owner_name: "owner_full_name",
  owner_full_name: "owner_full_name",
  owner: "owner_full_name",
  share_percentage: "share_percentage",
  share_pct: "share_percentage",
  ownership_share: "share_percentage",
  start_date: "start_date",
  ownership_start_date: "start_date",
};

const parseBooleanString = (value: string | null | undefined) => {
  if (!value) return false;
  return truthyStrings.has(value.trim().toLowerCase());
};

const parseNullableString = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized === "" || normalized == null ? null : normalized;
};

const parsePositiveNumber = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseIntNumber = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : Math.trunc(parsed);
};

const parseDateString = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized;
};

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

export type ImportPreviewResult<T> = {
  headers: string[];
  rows: ImportPreviewRow<T>[];
  parseError?: string;
};

function getMappedField(header: string, kind: ImportKind) {
  const normalized = normalizeHeader(header);
  if (kind === "members") {
    return MEMBER_HEADER_ALIASES[normalized] ?? null;
  }
  return UNIT_HEADER_ALIASES[normalized] ?? null;
}

export function parseCsvText(csvText: string) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
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
      } else if (char === ",") {
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

  const normalizedHeaders = headerRow.map((header) => normalizeHeader(header));
  const duplicates = normalizedHeaders.filter((value, index) => value && normalizedHeaders.indexOf(value) !== index);
  if (duplicates.length > 0) {
    return { headers: [], rows: [], error: "duplicate_headers" };
  }

  return { headers: headerRow, rows: dataRows, error: undefined };
}

export function previewImportRows(
  csvText: string,
  kind: ImportKind,
  config: {
    buildingsByCode?: Map<string, string>;
    zonesByCode?: Map<string, string>;
    membersByEmail?: Map<string, string>;
    membersByPhone?: Map<string, string>;
  } = {},
): ImportPreviewResult<any> {
  const parsedCsv = parseCsvText(csvText);
  if (parsedCsv.error) {
    return { headers: [], rows: [], parseError: parsedCsv.error };
  }

  const headers = parsedCsv.headers;
  const mappedHeaders = headers.map((header) => getMappedField(header, kind));
  const unknownColumns = mappedHeaders.map((field, index) => ({ field, index })).filter((item) => item.field === null);
  if (unknownColumns.length > 0) {
    return {
      headers,
      rows: [],
      parseError: "unknown_header_columns",
    };
  }

  const rows = parsedCsv.rows.map((cells, index) => {
    const raw: Record<string, string> = {};
    for (let cellIndex = 0; cellIndex < mappedHeaders.length; cellIndex += 1) {
      const field = mappedHeaders[cellIndex];
      if (!field) continue;
      raw[field] = (cells[cellIndex] ?? "").trim();
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (kind === "members") {
      const parsed = memberSchema.safeParse({
        full_name: raw.full_name ?? "",
        email: parseNullableString(raw.email),
        phone: parseNullableString(raw.phone),
        is_company: parseBooleanString(raw.is_company),
      });
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue: { message: string }) => issue.message));
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

    const buildingId = parseNullableString(raw.building_id);
    const zoneId = parseNullableString(raw.zone_id);
    const buildingCode = parseNullableString(raw.building_code);
    const zoneCode = parseNullableString(raw.zone_code);

    const resolvedBuildingId = buildingId || (buildingCode ? config.buildingsByCode?.get(buildingCode.toLowerCase()) ?? null : null);
    const resolvedZoneId = zoneId || (zoneCode ? config.zonesByCode?.get(zoneCode.toLowerCase()) ?? null : null);

    if (buildingCode && !buildingId && !resolvedBuildingId) {
      errors.push("unknown_building");
    }
    if (zoneCode && !zoneId && !resolvedZoneId) {
      errors.push("unknown_zone");
    }

    const ownerEmail = parseNullableString(raw.owner_email);
    const ownerPhone = parseNullableString(raw.owner_phone);
    const ownerFullName = parseNullableString(raw.owner_full_name);
    let ownerId: string | null = null;
    let ownerHint: string | undefined;

    if (ownerEmail) {
      const match = config.membersByEmail?.get(ownerEmail.toLowerCase());
      if (match) {
        ownerId = match;
        ownerHint = "existing_owner";
      }
    }
    if (!ownerId && ownerPhone) {
      const match = config.membersByPhone?.get(ownerPhone.toLowerCase());
      if (match) {
        ownerId = match;
        ownerHint = "existing_owner";
      }
    }

    if (!ownerId && (ownerEmail || ownerPhone)) {
      if (!ownerFullName) {
        errors.push("owner_full_name_required_for_new_owner");
      } else {
        ownerHint = "create_owner";
      }
    }

    const parsed = unitSchema.safeParse({
      code: raw.code ?? "",
      building_id: resolvedBuildingId,
      zone_id: resolvedZoneId,
      unit_type: (raw.unit_type ?? "").trim().toUpperCase(),
      custom_type_label: parseNullableString(raw.custom_type_label),
      floor_number: parseIntNumber(raw.floor_number),
      area: parsePositiveNumber(raw.area),
      owner_id: ownerId,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      owner_full_name: ownerFullName,
      share_percentage: parsePositiveNumber(raw.share_percentage) ?? 100,
      start_date: parseDateString(raw.start_date),
    });

    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue: { message: string }) => issue.message));
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

  return { headers, rows };
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

export function refineUnitType(raw: string) {
  const normalized = raw.trim().toUpperCase();
  if (UNIT_TYPES.includes(normalized as UnitType)) return normalized as UnitType;
  return undefined;
}

export function isValidDateFormat(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
