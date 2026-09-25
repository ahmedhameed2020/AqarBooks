import { z } from "zod";

export const EVIDENCE_PAGE_SIZE_MAX = 100;
export const EVIDENCE_EXPORT_ROW_MAX = 25_000;
export const EVIDENCE_EXPORT_DAY_MAX = 31;
export const DEFAULT_LONG_STAY_HOURS = 12;

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(max).optional(),
);
const optionalUuid = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().uuid().optional(),
);
const positiveInteger = (fallback: number, maximum?: number) => z.preprocess(
  (value) => value === undefined || value === "" ? fallback : value,
  z.coerce.number().int().min(1).pipe(maximum ? z.number().max(maximum) : z.number()),
);

const rawEvidenceFilterSchema = z.object({
  page: positiveInteger(1),
  pageSize: positiveInteger(50, EVIDENCE_PAGE_SIZE_MAX),
  property: optionalUuid,
  gate: optionalUuid,
  decision: z.preprocess((value) => value === "" ? undefined : value, z.enum(["ALLOW", "DENY", "RECONCILE"]).optional()),
  reason: optionalText(80),
  direction: z.preprocess((value) => value === "" ? undefined : value, z.enum(["ENTRY", "EXIT"]).optional()),
  invitation: optionalText(80),
  guest: optionalText(120),
  operator: optionalText(120),
  q: optionalText(120),
  from: optionalText(40),
  to: optionalText(40),
}).strict();

export type EvidenceFilters = {
  page: number;
  pageSize: number;
  property?: string;
  gate?: string;
  decision?: "ALLOW" | "DENY" | "RECONCILE";
  reason?: string;
  direction?: "ENTRY" | "EXIT";
  invitation?: string;
  guest?: string;
  operator?: string;
  q?: string;
  from?: string;
  to?: string;
};

function normalizeDate(value: string | undefined, edge: "start" | "end") {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly
    ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid evidence date");
  return date.toISOString();
}

export function parseEvidenceFilters(input: Record<string, unknown>): EvidenceFilters {
  const parsed = rawEvidenceFilterSchema.parse(input);
  const from = normalizeDate(parsed.from, "start");
  const to = normalizeDate(parsed.to, "end");
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    throw new Error("Evidence date range is inverted");
  }
  return { ...parsed, from, to };
}

export function parseEvidenceExportFilters(
  input: Record<string, unknown>,
  now = new Date(),
): EvidenceFilters {
  const parsed = parseEvidenceFilters({ ...input, page: "1", pageSize: String(EVIDENCE_PAGE_SIZE_MAX) });
  let to = parsed.to;
  let from = parsed.from;

  if (!to) to = now.toISOString();
  if (!from) {
    const defaultFrom = new Date(new Date(to).getTime() - ((EVIDENCE_EXPORT_DAY_MAX - 1) * 86_400_000));
    from = defaultFrom.toISOString();
  }

  const span = new Date(to).getTime() - new Date(from).getTime();
  if (span < 0 || span > ((EVIDENCE_EXPORT_DAY_MAX - 1) * 86_400_000) + 86_399_999) {
    throw new Error(`Evidence export cannot exceed ${EVIDENCE_EXPORT_DAY_MAX} days`);
  }

  return { ...parsed, page: 1, pageSize: EVIDENCE_PAGE_SIZE_MAX, from, to };
}

export type AccessEvidenceCsvRow = {
  occurredAt: string;
  propertyName: string;
  gateName: string;
  invitationNo: string | null;
  guestName: string | null;
  unitCode: string | null;
  decision: "ALLOW" | "DENY" | "RECONCILE";
  reasonCode: string;
  direction: "ENTRY" | "EXIT";
  operatorName: string;
};

const CSV_HEADERS = [
  "occurred_at",
  "property",
  "gate",
  "invitation_no",
  "guest_name",
  "unit_code",
  "decision",
  "reason_code",
  "direction",
  "operator",
] as const;

function safeCsvCell(value: string | null) {
  let cell = value ?? "";
  if (/^[\t\r ]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

export function buildAccessEvidenceCsv(rows: AccessEvidenceCsvRow[]) {
  const lines = rows.map((row) => [
    row.occurredAt,
    row.propertyName,
    row.gateName,
    row.invitationNo,
    row.guestName,
    row.unitCode,
    row.decision,
    row.reasonCode,
    row.direction,
    row.operatorName,
  ].map(safeCsvCell).join(","));
  return `\uFEFF${CSV_HEADERS.join(",")}\r\n${lines.join("\r\n")}`;
}

export function getOccupancyWarnings({
  enteredAt,
  validUntil,
  now = new Date(),
  longStayHours = DEFAULT_LONG_STAY_HOURS,
}: {
  enteredAt: string | null;
  validUntil: string;
  now?: Date;
  longStayHours?: number;
}) {
  const entryTime = enteredAt ? new Date(enteredAt).getTime() : Number.NaN;
  const validUntilTime = new Date(validUntil).getTime();
  return {
    longStay: Number.isFinite(entryTime) && now.getTime() - entryTime >= longStayHours * 3_600_000,
    expiredInside: Number.isFinite(validUntilTime) && validUntilTime < now.getTime(),
  };
}
