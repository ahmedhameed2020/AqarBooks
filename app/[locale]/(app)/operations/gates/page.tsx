import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { GatesClient, type GateManagementItem, type GatePropertyOption } from "./gates-client";

type GateRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  direction_mode: GateManagementItem["directionMode"];
  is_active: boolean;
  property_id: string;
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

  const [{ data: gateRows, error: gateError }, { data: properties, error: propertiesError }] = await Promise.all([
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
  ]);

  if (gateError) console.error("[GatesPage] gates query failed:", gateError.message);
  if (propertiesError) console.error("[GatesPage] properties query failed:", propertiesError.message);

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

  return (
    <GatesClient
      gates={gates}
      properties={propertyOptions}
      canManage={Boolean(canManage)}
      locale={locale as "ar" | "en"}
    />
  );
}
