import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { GateScannerServiceWorkerRegistration } from "@/lib/gates/service-worker";
import { getGateCompletionEnabled } from "@/lib/gates/completion-policy";
import { GateScannerClient, type GateScannerDevice, type GateScannerEvent, type GateScannerGate } from "./gate-scanner-client";

export const metadata: Metadata = {
  title: "Gate Scanner",
  applicationName: "AqarBooks Gate Scanner",
  manifest: "/gate-scanner.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gate Scanner",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

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

type GateDeviceRow = {
  id: string;
  gate_id: string;
  allowed_direction: GateScannerDevice["allowedDirection"];
};

export default async function GateScannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deviceId?: string | string[] }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
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

  if (!(await getGateCompletionEnabled(supabase, organization.id))) {
    return <div className="rounded-2xl border bg-card p-6">
      <h1 className="text-lg font-bold">{isAr ? "ماسح الأجهزة متوقف" : "Trusted device scanner is paused"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{isAr ? "يمكن لمسؤول البوابات تفعيل التشغيل المتقدم من إعدادات البوابات. تبقى إدارة الزوار والسجلات متاحة." : "A gate manager can enable completion in gate settings. Visitor management and evidence remain available."}</p>
    </div>;
  }

  const requestedDeviceId = typeof query.deviceId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.deviceId)
    ? query.deviceId
    : null;
  const adminClient = createAdminClient();
  const [{ data: gateRows, error: gateError }, { data: eventRows, error: eventError }, deviceResult] = await Promise.all([
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
    requestedDeviceId
      ? adminClient
          .from("gate_devices")
          .select("id, gate_id, allowed_direction")
          .eq("id", requestedDeviceId)
          .eq("organization_id", organization.id)
          .eq("status", "ACTIVE")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (gateError) console.error("[GateScannerPage] gates query failed:", gateError.message);
  if (eventError) console.error("[GateScannerPage] events query failed:", eventError.message);
  if (deviceResult.error) console.error("[GateScannerPage] device query failed:", deviceResult.error.message);

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
  const deviceRow = deviceResult.data as GateDeviceRow | null;
  const deviceGate = deviceRow ? gates.find((gate) => gate.id === deviceRow.gate_id) : null;
  const device: GateScannerDevice | null = deviceRow && deviceGate
    ? {
        id: deviceRow.id,
        gate: deviceGate,
        allowedDirection: deviceRow.allowed_direction,
      }
    : null;

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

  return (
    <>
      <GateScannerServiceWorkerRegistration />
      <GateScannerClient
        key={device?.id ?? "unenrolled"}
        requestedDeviceId={requestedDeviceId}
        device={device}
        recentEvents={recentEvents}
        locale={locale as "ar" | "en"}
      />
    </>
  );
}
