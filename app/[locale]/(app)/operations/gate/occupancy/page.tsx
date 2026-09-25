import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { listCurrentVisitors } from "@/lib/actions/gate-evidence";
import type { Locale } from "@/i18n/routing";
import { OccupancyClient } from "./occupancy-client";
import type { PendingExceptionItem } from "./supervision-dialogs";

type RawSearchParams = Record<string, string | string[] | undefined>;
type ExceptionRow = {
  id: string;
  gate_id: string;
  visitor_invitation_id: string | null;
  direction: "ENTRY" | "EXIT";
  outcome: "ENTERED" | "EXITED" | "DENIED";
  category: string;
  reason: string;
  occurred_at: string;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function GateOccupancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.access_events.view", locale);
  if (denied) return denied;

  const db = await createClient();
  const [{ data: moduleEnabled }, canCreateException, canApprove, canReconcile] = await Promise.all([
    db.rpc("gate_operations_enabled", { p_organization_id: organization.id }),
    hasPermission(organization.id, "operations.gates.exceptions.create"),
    hasPermission(organization.id, "operations.gates.exceptions.approve"),
    hasPermission(organization.id, "operations.gates.occupancy.reconcile"),
  ]);
  if (!moduleEnabled) {
    return <div className="rounded-2xl border border-border/70 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "إشغال البوابة غير مفعل" : "Gate occupancy is not enabled"}</h1></div>;
  }

  const filters = {
    q: first(raw.q),
    property: first(raw.property),
    gate: first(raw.gate),
    page: first(raw.page) ?? "1",
    pageSize: first(raw.pageSize) ?? "50",
  };
  const occupancy = await listCurrentVisitors(filters);
  if (!occupancy.ok) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">{isAr ? "تعذر تحميل حالة الزوار." : "Could not load visitor occupancy."}</div>;
  }

  const [gateResult, propertyResult, invitationResult, exceptionResult] = await Promise.all([
    db.from("gates").select("id, code, name_ar, name_en").eq("organization_id", organization.id).eq("is_active", true).order("code"),
    db.from("properties").select("id, name").eq("organization_id", organization.id).order("name"),
    canCreateException || canApprove
      ? db.from("visitor_invitations").select("id, invitation_no, guest_name").eq("organization_id", organization.id).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    canApprove
      ? db.from("gate_manual_exception_details").select("id, gate_id, visitor_invitation_id, direction, outcome, category, reason, occurred_at").eq("organization_id", organization.id).eq("status", "PENDING").order("occurred_at", { ascending: true }).limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const gates = (gateResult.data ?? []).map((gate) => ({
    id: gate.id,
    label: `${gate.code} · ${isAr ? gate.name_ar : gate.name_en}`,
  }));
  const properties = (propertyResult.data ?? []).map((property) => ({ id: property.id, label: property.name }));
  const invitations = (invitationResult.data ?? []).map((invitation) => ({ id: invitation.id, label: `${invitation.invitation_no} · ${invitation.guest_name}` }));
  const gateById = new Map(gates.map((gate) => [gate.id, gate.label]));
  const invitationById = new Map(invitations.map((invitation) => [invitation.id, invitation.label]));
  const pendingExceptions: PendingExceptionItem[] = ((exceptionResult.data ?? []) as ExceptionRow[]).map((item) => ({
    id: item.id,
    visitorLabel: item.visitor_invitation_id
      ? invitationById.get(item.visitor_invitation_id) ?? (isAr ? "زائر معروف" : "Identified visitor")
      : (isAr ? "زائر غير محدد" : "Unidentified visitor"),
    gateLabel: gateById.get(item.gate_id) ?? "—",
    direction: item.direction,
    outcome: item.outcome,
    category: item.category,
    reason: item.reason,
    occurredAt: item.occurred_at,
  }));

  return (
    <OccupancyClient
      rows={occupancy.rows}
      total={occupancy.total}
      page={occupancy.page}
      pageSize={occupancy.pageSize}
      longStayHours={occupancy.longStayHours}
      nowIso={new Date().toISOString()}
      locale={locale as "ar" | "en"}
      filters={{ q: filters.q, property: filters.property, gate: filters.gate }}
      properties={properties}
      gates={gates}
      invitations={invitations}
      pendingExceptions={pendingExceptions}
      canCreateException={canCreateException}
      canApprove={canApprove}
      canReconcile={canReconcile}
    />
  );
}
