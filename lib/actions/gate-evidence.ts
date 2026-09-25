"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import {
  buildAccessEvidenceCsv,
  DEFAULT_LONG_STAY_HOURS,
  EVIDENCE_EXPORT_ROW_MAX,
  getOccupancyWarnings,
  parseEvidenceExportFilters,
  parseEvidenceFilters,
  type AccessEvidenceCsvRow,
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

type AccessEventRow = {
  id: string;
  property_id: string;
  gate_id: string;
  visitor_invitation_id: string | null;
  unit_id: string | null;
  direction: "ENTRY" | "EXIT";
  decision: "ALLOW" | "DENY" | "RECONCILE";
  reconciliation_id: string | null;
  reason_code: string;
  operator_user_id: string;
  guest_name: string | null;
  invitation_no: string | null;
  is_inside_after: boolean | null;
  occurred_at: string;
};

type AccessStateRow = {
  visitor_invitation_id: string;
  property_id: string;
  unit_id: string;
  last_entry_at: string | null;
  last_gate_id: string | null;
  entry_count: number;
  exit_count: number;
};

async function authorize(permission: string): Promise<
  { ok: true; organizationId: string; db: DbClient } | Failure
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return { ok: false, error: "forbidden" };
  if (!(await hasPermission(organization.id, permission))) return { ok: false, error: "forbidden" };
  return { ok: true, organizationId: organization.id, db: await createClient() };
}

function safeParse(input: Record<string, unknown>, exportMode = false) {
  try {
    return exportMode ? parseEvidenceExportFilters(input) : parseEvidenceFilters(input);
  } catch {
    return null;
  }
}

async function matchingInvitationIds(db: DbClient, organizationId: string, filters: EvidenceFilters) {
  const q = filters.q?.trim();
  if (!q) return null;
  const [guest, invitation] = await Promise.all([
    db.from("visitor_invitations").select("id").eq("organization_id", organizationId).ilike("guest_name", `%${q}%`).limit(1_000),
    db.from("visitor_invitations").select("id").eq("organization_id", organizationId).ilike("invitation_no", `%${q}%`).limit(1_000),
  ]);
  if (guest.error || invitation.error) return undefined;
  return [...new Set([...(guest.data ?? []), ...(invitation.data ?? [])].map((row) => row.id))];
}

export async function listCurrentVisitors(input: Record<string, unknown> = {}): Promise<
  { ok: true; rows: CurrentVisitorItem[]; total: number; page: number; pageSize: number; longStayHours: number } | Failure
> {
  const filters = safeParse(input);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize("operations.access_events.view");
  if (!auth.ok) return auth;

  const invitationIds = await matchingInvitationIds(auth.db, auth.organizationId, filters);
  if (invitationIds === undefined) return { ok: false, error: "query_failed" };
  if (invitationIds?.length === 0) {
    return { ok: true, rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, longStayHours: DEFAULT_LONG_STAY_HOURS };
  }

  const start = (filters.page - 1) * filters.pageSize;
  let query = auth.db
    .from("visitor_access_state")
    .select("visitor_invitation_id, property_id, unit_id, last_entry_at, last_gate_id, entry_count, exit_count", { count: "exact" })
    .eq("organization_id", auth.organizationId)
    .eq("is_inside", true);
  if (filters.property) query = query.eq("property_id", filters.property);
  if (filters.gate) query = query.eq("last_gate_id", filters.gate);
  if (invitationIds) query = query.in("visitor_invitation_id", invitationIds);
  const { data, error, count } = await query
    .order("last_entry_at", { ascending: true, nullsFirst: false })
    .range(start, start + filters.pageSize - 1);
  if (error) return { ok: false, error: "query_failed" };

  const states = (data ?? []) as AccessStateRow[];
  const stateInvitationIds = states.map((row) => row.visitor_invitation_id);
  const propertyIds = [...new Set(states.map((row) => row.property_id))];
  const unitIds = [...new Set(states.map((row) => row.unit_id))];
  const gateIds = [...new Set(states.flatMap((row) => row.last_gate_id ? [row.last_gate_id] : []))];
  const [invitations, properties, units, gates] = await Promise.all([
    stateInvitationIds.length
      ? auth.db.from("visitor_invitations").select("id, invitation_no, guest_name, valid_until").in("id", stateInvitationIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? auth.db.from("properties").select("id, name").in("id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? auth.db.from("units").select("id, code").in("id", unitIds)
      : Promise.resolve({ data: [], error: null }),
    gateIds.length
      ? auth.db.from("gates").select("id, code, name_ar, name_en").in("id", gateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (invitations.error || properties.error || units.error || gates.error) {
    return { ok: false, error: "query_failed" };
  }

  const invitationById = new Map((invitations.data ?? []).map((row) => [row.id, row]));
  const propertyById = new Map((properties.data ?? []).map((row) => [row.id, row.name]));
  const unitById = new Map((units.data ?? []).map((row) => [row.id, row.code]));
  const gateById = new Map((gates.data ?? []).map((row) => [row.id, row]));
  const now = new Date();
  const rows: CurrentVisitorItem[] = states.flatMap((state) => {
    const invitation = invitationById.get(state.visitor_invitation_id);
    if (!invitation) return [];
    const gate = state.last_gate_id ? gateById.get(state.last_gate_id) : null;
    const warnings = getOccupancyWarnings({
      enteredAt: state.last_entry_at,
      validUntil: invitation.valid_until,
      now,
      longStayHours: DEFAULT_LONG_STAY_HOURS,
    });
    return [{
      invitationId: state.visitor_invitation_id,
      invitationNo: invitation.invitation_no,
      guestName: invitation.guest_name,
      propertyId: state.property_id,
      propertyName: propertyById.get(state.property_id) ?? "—",
      unitId: state.unit_id,
      unitCode: unitById.get(state.unit_id) ?? "—",
      gateId: state.last_gate_id,
      gateCode: gate?.code ?? null,
      gateNameAr: gate?.name_ar ?? null,
      gateNameEn: gate?.name_en ?? null,
      enteredAt: state.last_entry_at,
      validUntil: invitation.valid_until,
      entryCount: state.entry_count,
      exitCount: state.exit_count,
      ...warnings,
    }];
  });

  return {
    ok: true,
    rows,
    total: count ?? rows.length,
    page: filters.page,
    pageSize: filters.pageSize,
    longStayHours: DEFAULT_LONG_STAY_HOURS,
  };
}

async function operatorIdsForFilter(db: DbClient, operator: string | undefined) {
  if (!operator) return null;
  const { data, error } = await db.from("profiles").select("id").ilike("full_name", `%${operator}%`).limit(1_000);
  if (error) return undefined;
  return (data ?? []).map((row) => row.id);
}

async function fetchEvidencePage(
  db: DbClient,
  organizationId: string,
  filters: EvidenceFilters,
  offset: number,
  limit: number,
  includeCount: boolean,
) {
  const operatorIds = await operatorIdsForFilter(db, filters.operator);
  if (operatorIds === undefined) return { error: true as const };
  if (operatorIds?.length === 0) return { rows: [] as AccessEvidenceItem[], total: 0, error: false as const };

  let query = db
    .from("access_events")
    .select(
      "id, property_id, gate_id, visitor_invitation_id, unit_id, direction, decision, reconciliation_id, reason_code, operator_user_id, guest_name, invitation_no, is_inside_after, occurred_at",
      includeCount ? { count: "exact" } : undefined,
    )
    .eq("organization_id", organizationId);
  if (filters.property) query = query.eq("property_id", filters.property);
  if (filters.gate) query = query.eq("gate_id", filters.gate);
  if (filters.decision) query = query.eq("decision", filters.decision);
  if (filters.reason) query = query.ilike("reason_code", `%${filters.reason}%`);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.invitation) query = query.ilike("invitation_no", `%${filters.invitation}%`);
  if (filters.guest) query = query.ilike("guest_name", `%${filters.guest}%`);
  if (operatorIds) query = query.in("operator_user_id", operatorIds);
  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lte("occurred_at", filters.to);

  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { error: true as const };

  const raw = (data ?? []) as AccessEventRow[];
  const propertyIds = [...new Set(raw.map((row) => row.property_id))];
  const gateIds = [...new Set(raw.map((row) => row.gate_id))];
  const unitIds = [...new Set(raw.flatMap((row) => row.unit_id ? [row.unit_id] : []))];
  const profileIds = [...new Set(raw.map((row) => row.operator_user_id))];
  const [properties, gates, units, profiles] = await Promise.all([
    propertyIds.length ? db.from("properties").select("id, name").in("id", propertyIds) : Promise.resolve({ data: [], error: null }),
    gateIds.length ? db.from("gates").select("id, code, name_ar, name_en").in("id", gateIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? db.from("units").select("id, code").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? db.from("profiles").select("id, full_name").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (properties.error || gates.error || units.error || profiles.error) return { error: true as const };

  const propertyById = new Map((properties.data ?? []).map((row) => [row.id, row.name]));
  const gateDetailsById = new Map((gates.data ?? []).map((row) => [row.id, row]));
  const gateById = new Map((gates.data ?? []).map((row) => [row.id, `${row.code} · ${row.name_en}`]));
  const unitById = new Map((units.data ?? []).map((row) => [row.id, row.code]));
  const profileById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name ?? row.id]));
  const rows: AccessEvidenceItem[] = raw.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    gateId: row.gate_id,
    invitationId: row.visitor_invitation_id,
    unitId: row.unit_id,
    operatorUserId: row.operator_user_id,
    reconciliationId: row.reconciliation_id,
    isInsideAfter: row.is_inside_after,
    gateCode: gateDetailsById.get(row.gate_id)?.code ?? null,
    gateNameAr: gateDetailsById.get(row.gate_id)?.name_ar ?? null,
    gateNameEn: gateDetailsById.get(row.gate_id)?.name_en ?? null,
    occurredAt: row.occurred_at,
    propertyName: propertyById.get(row.property_id) ?? "—",
    gateName: gateById.get(row.gate_id) ?? "—",
    invitationNo: row.invitation_no,
    guestName: row.guest_name,
    unitCode: row.unit_id ? unitById.get(row.unit_id) ?? null : null,
    decision: row.decision,
    reasonCode: row.reason_code,
    direction: row.direction,
    operatorName: profileById.get(row.operator_user_id) ?? row.operator_user_id,
  }));
  return { rows, total: count ?? rows.length, error: false as const };
}

export async function listAccessEvidence(input: Record<string, unknown> = {}): Promise<
  { ok: true; rows: AccessEvidenceItem[]; total: number; page: number; pageSize: number } | Failure
> {
  const filters = safeParse(input);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize("operations.access_events.view");
  if (!auth.ok) return auth;
  const offset = (filters.page - 1) * filters.pageSize;
  const result = await fetchEvidencePage(auth.db, auth.organizationId, filters, offset, filters.pageSize, true);
  if (result.error) return { ok: false, error: "query_failed" };
  return { ok: true, rows: result.rows, total: result.total, page: filters.page, pageSize: filters.pageSize };
}

export async function exportAccessEvidenceCsvAction(input: Record<string, unknown> = {}): Promise<
  { ok: true; csv: string; filename: string; rowCount: number; truncated: boolean } | Failure
> {
  const filters = safeParse(input, true);
  if (!filters) return { ok: false, error: "invalid_filters" };
  const auth = await authorize("operations.access_events.view");
  if (!auth.ok) return auth;

  const rows: AccessEvidenceItem[] = [];
  const chunkSize = 1_000;
  while (rows.length < EVIDENCE_EXPORT_ROW_MAX) {
    const requested = Math.min(chunkSize, EVIDENCE_EXPORT_ROW_MAX - rows.length);
    const result = await fetchEvidencePage(auth.db, auth.organizationId, filters, rows.length, requested, false);
    if (result.error) return { ok: false, error: "query_failed" };
    rows.push(...result.rows);
    if (result.rows.length < requested) break;
  }

  const boundary = rows.length === EVIDENCE_EXPORT_ROW_MAX
    ? await fetchEvidencePage(auth.db, auth.organizationId, filters, EVIDENCE_EXPORT_ROW_MAX, 1, false)
    : { rows: [], error: false as const };
  if (boundary.error) return { ok: false, error: "query_failed" };
  return {
    ok: true,
    csv: buildAccessEvidenceCsv(rows),
    filename: `access-evidence-${filters.from!.slice(0, 10)}-${filters.to!.slice(0, 10)}.csv`,
    rowCount: rows.length,
    truncated: boundary.rows.length > 0,
  };
}
