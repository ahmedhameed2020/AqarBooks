import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { GateScannerClient, type GateScannerEvent, type GateScannerGate } from "./gate-scanner-client";

type GateRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  direction_mode: GateScannerGate["directionMode"];
  property_id: string;
};

type AccessEventRow = {
  id: string;
  decision: GateScannerEvent["decision"];
  reason_code: string;
  direction: GateScannerEvent["direction"];
  guest_name: string | null;
  invitation_no: string | null;
  gate_id: string;
  occurred_at: string;
};

export default async function GateScannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.gates.scan", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: moduleEnabled } = await supabase.rpc("gate_operations_enabled", {
    p_organization_id: organization.id,
  });

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "عمليات البوابة غير مفعلة" : "Gate operations are not enabled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAr ? "فعّل إدارة الزوار لهذه المنشأة قبل تشغيل ماسح البوابة." : "Enable visitor management for this organization before gate scanning."}
        </p>
      </div>
    );
  }

  const [{ data: gateRows, error: gateError }, { data: eventRows, error: eventError }] = await Promise.all([
    supabase
      .from("gates")
      .select("id, code, name_ar, name_en, direction_mode, property_id")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("access_events")
      .select("id, decision, reason_code, direction, guest_name, invitation_no, gate_id, occurred_at")
      .eq("organization_id", organization.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  if (gateError) console.error("[GateScannerPage] gates query failed:", gateError.message);
  if (eventError) console.error("[GateScannerPage] events query failed:", eventError.message);

  const gatesRaw = (gateRows ?? []) as GateRow[];
  const propertyIds = [...new Set(gatesRaw.map((gate) => gate.property_id))];
  const { data: properties } = propertyIds.length
    ? await supabase.from("properties").select("id, name").in("id", propertyIds)
    : { data: [] };
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const gateNameById = new Map(gatesRaw.map((gate) => [gate.id, isAr ? gate.name_ar : gate.name_en]));

  const gates: GateScannerGate[] = gatesRaw.map((gate) => ({
    id: gate.id,
    code: gate.code,
    name: isAr ? gate.name_ar : gate.name_en,
    directionMode: gate.direction_mode,
    propertyName: propertyById.get(gate.property_id) ?? "—",
  }));

  const recentEvents: GateScannerEvent[] = ((eventRows ?? []) as AccessEventRow[]).map((event) => ({
    id: event.id,
    decision: event.decision,
    reasonCode: event.reason_code,
    direction: event.direction,
    guestName: event.guest_name,
    invitationNo: event.invitation_no,
    gateName: gateNameById.get(event.gate_id) ?? "—",
    occurredAt: event.occurred_at,
  }));

  return <GateScannerClient gates={gates} recentEvents={recentEvents} locale={locale as "ar" | "en"} />;
}
