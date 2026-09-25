import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getGateOperationsSummary } from "@/lib/gates/operations-summary";
import type { Locale } from "@/i18n/routing";
import { GatesClient, type GateManagementItem, type GatePropertyOption } from "./gates-client";
import type { GateDeviceItem } from "./gate-devices-panel";
import { GateOperationsSummaryPanel } from "./operations-summary";

type GateRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  direction_mode: GateManagementItem["directionMode"];
  is_active: boolean;
  property_id: string;
};

type GateDeviceRow = {
  id: string;
  gate_id: string;
  property_id: string;
  display_name: string;
  device_notes: string | null;
  allowed_direction: GateDeviceItem["allowedDirection"];
  status: GateDeviceItem["status"];
  enrolled_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export default async function GatesPage({
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

  const denied = await denyIfMissingPermission(organization.id, "operations.gates.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: moduleEnabled }, { data: canManage }] = await Promise.all([
    supabase.rpc("gate_operations_enabled", { p_organization_id: organization.id }),
    supabase.rpc("gate_staff_can_manage", { p_organization_id: organization.id }),
  ]);

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "عمليات البوابة غير مفعلة" : "Gate operations are not enabled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAr ? "فعّل إدارة الزوار لهذه المنشأة قبل تعريف البوابات." : "Enable visitor management for this organization before configuring gates."}
        </p>
      </div>
    );
  }

  const adminClient = createAdminClient();
  const [
    { data: gateRows, error: gateError },
    { data: properties, error: propertiesError },
    { data: deviceRows, error: devicesError },
    operationsSummary,
  ] = await Promise.all([
    supabase
      .from("gates")
      .select("id, code, name_ar, name_en, direction_mode, is_active, property_id")
      .eq("organization_id", organization.id)
      .order("code", { ascending: true }),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name", { ascending: true }),
    adminClient
      .from("gate_devices")
      .select("id, gate_id, property_id, display_name, device_notes, allowed_direction, status, enrolled_at, last_seen_at, revoked_at, revocation_reason")
      .eq("organization_id", organization.id)
      .order("enrolled_at", { ascending: false }),
    getGateOperationsSummary(organization.id).catch(() => null),
  ]);

  if (gateError) console.error("[GatesPage] gates query failed:", gateError.message);
  if (propertiesError) console.error("[GatesPage] properties query failed:", propertiesError.message);
  if (devicesError) console.error("[GatesPage] devices query failed:", devicesError.message);
  if (!operationsSummary) console.error("[GatesPage] operations summary query failed");

  const propertyOptions: GatePropertyOption[] = (properties ?? []).map((property) => ({
    id: property.id,
    name: property.name,
  }));
  const propertyById = new Map(propertyOptions.map((property) => [property.id, property.name]));

  const gates: GateManagementItem[] = ((gateRows ?? []) as GateRow[]).map((gate) => ({
    id: gate.id,
    code: gate.code,
    nameAr: gate.name_ar,
    nameEn: gate.name_en,
    directionMode: gate.direction_mode,
    isActive: gate.is_active,
    propertyId: gate.property_id,
    propertyName: propertyById.get(gate.property_id) ?? "—",
  }));
  const gateById = new Map(gates.map((gate) => [gate.id, isAr ? gate.nameAr : gate.nameEn]));
  const devices: GateDeviceItem[] = ((deviceRows ?? []) as GateDeviceRow[]).map((device) => ({
    id: device.id,
    displayName: device.display_name,
    notes: device.device_notes,
    gateName: gateById.get(device.gate_id) ?? "—",
    propertyName: propertyById.get(device.property_id) ?? "—",
    allowedDirection: device.allowed_direction,
    status: device.status,
    enrolledAt: device.enrolled_at,
    lastSeenAt: device.last_seen_at,
    revokedAt: device.revoked_at,
    revocationReason: device.revocation_reason,
  }));

  return (
    <div className="space-y-5">
      <GateOperationsSummaryPanel summary={operationsSummary} locale={locale as "ar" | "en"} />
      <GatesClient
        gates={gates}
        devices={devices}
        properties={propertyOptions}
        canManage={Boolean(canManage)}
        locale={locale as "ar" | "en"}
      />
    </div>
  );
}
