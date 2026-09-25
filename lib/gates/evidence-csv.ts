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
  const offset = (parsed.page - 1) * parsed.pageSize;
  if (!Number.isSafeInteger(offset) || offset > 2_147_483_647) {
    throw new Error("Evidence page offset exceeds the database integer range");
  }
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

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const span = toDate.getTime() - fromDate.getTime();
  const fromUtcDay = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  const toUtcDay = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  const inclusiveUtcDays = ((toUtcDay - fromUtcDay) / 86_400_000) + 1;
  if (span < 0 || inclusiveUtcDays > EVIDENCE_EXPORT_DAY_MAX) {
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
  if (/^[\s\p{White_Space}]*[=+\-@]/u.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

export type EvidenceExportKey = { id: string; occurredAt: string };
export type EvidenceExportPageRequest = {
  limit: number;
  upperBound?: EvidenceExportKey;
  before?: EvidenceExportKey;
};

export async function collectEvidenceExportRows<Row extends EvidenceExportKey>(
  fetchPage: (request: EvidenceExportPageRequest) => Promise<Row[]>,
  { maxRows = EVIDENCE_EXPORT_ROW_MAX, chunkSize = 1_000 }: { maxRows?: number; chunkSize?: number } = {},
) {
  if (!Number.isInteger(maxRows) || maxRows < 1 || !Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("Invalid evidence export bounds");
  }

  const rows: Row[] = [];
  let upperBound: EvidenceExportKey | undefined;
  let before: EvidenceExportKey | undefined;
  const seen = new Set<string>();

  while (rows.length < maxRows) {
    const requested = Math.min(chunkSize, maxRows - rows.length);
    const page = await fetchPage({ limit: requested, upperBound, before });
    if (!upperBound && page[0]) upperBound = { id: page[0].id, occurredAt: page[0].occurredAt };
    for (const row of page) {
      const key = `${row.occurredAt}\u0000${row.id}`;
      if (seen.has(key)) throw new Error("Evidence keyset returned a duplicate row");
      seen.add(key);
      rows.push(row);
    }
    if (page.length < requested) return { rows, truncated: false };
    const last = page.at(-1);
    if (!last) return { rows, truncated: false };
    before = { id: last.id, occurredAt: last.occurredAt };
  }

  const probe = await fetchPage({ limit: 1, upperBound, before });
  return { rows, truncated: probe.length > 0 };
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
