"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import {
  buildAccessEvidenceCsv,
  collectEvidenceExportRows,
  DEFAULT_LONG_STAY_HOURS,
  getOccupancyWarnings,
  parseEvidenceExportFilters,
  parseEvidenceFilters,
  type AccessEvidenceCsvRow,
  type EvidenceExportPageRequest,
  type EvidenceFilters,
} from "@/lib/gates/evidence-csv";

type DbClient = Awaited<ReturnType<typeof createClient>>;
type SafeError = "unauthenticated" | "forbidden" | "invalid_filters" | "query_failed";
type Failure = { ok: false; error: SafeError };

export type AccessEvidenceItem = AccessEvidenceCsvRow & {
  id: string;
  propertyId: string;
  gateId: string;
  invitationId: string | null;
  unitId: string | null;
  operatorUserId: string;
  reconciliationId: string | null;
  isInsideAfter: boolean | null;
  gateCode: string | null;
  gateNameAr: string | null;
  gateNameEn: string | null;
};

export type CurrentVisitorItem = {
  invitationId: string;
  invitationNo: string;
  guestName: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitCode: string;
  gateId: string | null;
  gateCode: string | null;
  gateNameAr: string | null;
  gateNameEn: string | null;
  enteredAt: string | null;
  validUntil: string;
  entryCount: number;
  exitCount: number;
  longStay: boolean;
  expiredInside: boolean;
};

async function authorize(): Promise<{ ok: true; organizationId: string; db: DbClient } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "forbidden" };
  if (!(await hasPermission(organization.id, "operations.access_events.view"))) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, organizationId: organization.id, db: await createClient() };
}

function safeParse(input: Record<string, unknown>, exportMode = false) {
  try {
    return exportMode ? parseEvidenceExportFilters(input) : parseEvidenceFilters(input);
  } catch {
    return null;
  }
}

function evidenceRpcArgs(
  organizationId: string,
  filters: EvidenceFilters,
  { offset = 0, limit, upperBound, before }: EvidenceExportPageRequest & { offset?: number },
) {
  return {
    p_organization_id: organizationId,
    p_property_id: filters.property ?? null,
    p_gate_id: filters.gate ?? null,
    p_decision: filters.decision ?? null,
    p_reason: filters.reason ?? null,
    p_direction: filters.direction ?? null,
    p_invitation: filters.invitation ?? null,
    p_guest: filters.guest ?? null,
    p_operator: filters.operator ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_offset: offset,
    p_limit: limit,
    p_cursor_occurred_at: before?.occurredAt ?? null,
    p_cursor_id: before?.id ?? null,
    p_upper_occurred_at: upperBound?.occurredAt ?? null,
    p_upper_id: upperBound?.id ?? null,
  };
}

async function fetchEvidencePage(
  db: DbClient,
  organizationId: string,
  filters: EvidenceFilters,
  request: EvidenceExportPageRequest & { offset?: number },
) {
  const { data, error } = await db.rpc("list_gate_access_evidence", evidenceRpcArgs(organizationId, filters, request));
  if (error) return { error: true as const };
  const rawRows = data ?? [];
  const rows: AccessEvidenceItem[] = rawRows.filter((row) => !row.count_only).map((row) => ({
    id: row.id!,
    propertyId: row.property_id!,
    propertyName: row.property_name!,
    gateId: row.gate_id!,
    gateCode: row.gate_code,
    gateNameAr: row.gate_name_ar,
    gateNameEn: row.gate_name_en,
    gateName: `${row.gate_code} · ${row.gate_name_en}`,
    invitationId: row.visitor_invitation_id,
    invitationNo: row.invitation_no,
    guestName: row.guest_name,
    unitId: row.unit_id,
    unitCode: row.unit_code,
    direction: row.direction!,
    decision: row.decision!,
    reconciliationId: row.reconciliation_id,
    reasonCode: row.reason_code!,
    operatorUserId: row.operator_user_id!,
    operatorName: row.operator_name!,
    isInsideAfter: row.is_inside_after,
    occurredAt: row.occurred_at!,
  }));
  return { rows, total: Number(rawRows[0]?.total_count ?? 0), error: false as const };
}

export async function listCurrentVisitors(input: Record<string, unknown> = {}): Promise<
  { ok: true; rows: CurrentVisitorItem[]; total: number; page: number; pageSize: number; longStayHours: number } | Failure
> {
  const filters = safeParse(input);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize();
  if (!auth.ok) return auth;

  const { data, error } = await auth.db.rpc("list_gate_current_visitors", {
    p_organization_id: auth.organizationId,
    p_property_id: filters.property ?? null,
    p_gate_id: filters.gate ?? null,
    p_query: filters.q ?? null,
    p_offset: (filters.page - 1) * filters.pageSize,
    p_limit: filters.pageSize,
  });
  if (error) return { ok: false, error: "query_failed" };

  const rawRows = data ?? [];
  const now = new Date();
  const rows: CurrentVisitorItem[] = rawRows.filter((row) => !row.count_only).map((row) => ({
    invitationId: row.invitation_id!,
    invitationNo: row.invitation_no!,
    guestName: row.guest_name!,
    propertyId: row.property_id!,
    propertyName: row.property_name!,
    unitId: row.unit_id!,
    unitCode: row.unit_code!,
    gateId: row.gate_id,
    gateCode: row.gate_code,
    gateNameAr: row.gate_name_ar,
    gateNameEn: row.gate_name_en,
    enteredAt: row.entered_at,
    validUntil: row.valid_until!,
    entryCount: row.entry_count!,
    exitCount: row.exit_count!,
    ...getOccupancyWarnings({
      enteredAt: row.entered_at,
      validUntil: row.valid_until!,
      now,
      longStayHours: DEFAULT_LONG_STAY_HOURS,
    }),
  }));
  return {
    ok: true,
    rows,
    total: Number(rawRows[0]?.total_count ?? 0),
    page: filters.page,
    pageSize: filters.pageSize,
    longStayHours: DEFAULT_LONG_STAY_HOURS,
  };
}

export async function listAccessEvidence(input: Record<string, unknown> = {}): Promise<
  { ok: true; rows: AccessEvidenceItem[]; total: number; page: number; pageSize: number } | Failure
> {
  const filters = safeParse(input);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize();
  if (!auth.ok) return auth;
  const result = await fetchEvidencePage(auth.db, auth.organizationId, filters, {
    offset: (filters.page - 1) * filters.pageSize,
    limit: filters.pageSize,
  });
  if (result.error) return { ok: false, error: "query_failed" };
  return { ok: true, rows: result.rows, total: result.total, page: filters.page, pageSize: filters.pageSize };
}

export async function exportAccessEvidenceCsvAction(input: Record<string, unknown> = {}): Promise<
  { ok: true; csv: string; filename: string; rowCount: number; truncated: boolean } | Failure
> {
  const filters = safeParse(input, true);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize();
  if (!auth.ok) return auth;

  try {
    const result = await collectEvidenceExportRows<AccessEvidenceItem>(async (request) => {
      const page = await fetchEvidencePage(auth.db, auth.organizationId, filters, request);
      if (page.error) throw new Error("query_failed");
      return page.rows;
    });
    return {
      ok: true,
      csv: buildAccessEvidenceCsv(result.rows),
      filename: `access-evidence-${filters.from!.slice(0, 10)}-${filters.to!.slice(0, 10)}.csv`,
      rowCount: result.rows.length,
      truncated: result.truncated,
    };
  } catch {
    return { ok: false, error: "query_failed" };
  }
}
