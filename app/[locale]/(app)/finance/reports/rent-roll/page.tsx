import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Building2, AlertCircle } from "lucide-react";
import { RentRollClient, type RentRollUnitRow } from "./rent-roll-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "جدول الإيجارات وعقود الوحدات (Rent Roll) — عقار بوكس"
      : "Rent Roll & Unit Leases Statement — AqarBooks",
    description: isAr
      ? "تقرير شامل لحصر كافة الوحدات، المستأجرين، القيمة الإيجارية، وتواريخ انتهاء العقود ومعدلات الإشغال."
      : "Comprehensive rent roll report tracking unit occupancy, tenants, lease terms, and rental revenue.",
  };
}

export default async function RentRollPage({
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

  // One key instead of a three-branch OR. property.reports.read was granted to
  // every role that satisfied any branch, so this narrows nothing -- and it
  // lets the sidebar express the same condition, which a single `permission`
  // field could not do for an OR. That mismatch is what hid this report from
  // PROPERTY_MANAGER while the page itself would have opened.
  const canRead = await hasPermission(organization.id, "property.reports.read");

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "جدول الإيجارات (Rent Roll)" : "Rent Roll Report"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض التقارير العقارية والمالية."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch units with property/resort
  const { data: unitsData } = await supabase
    .from("units")
    .select("id, code, unit_type, property_id, resorts(id, name)")
    .eq("organization_id", organization.id)
    .order("code", { ascending: true });

  // 2. Fetch active leases with tenant details
  const { data: leasesData } = await supabase
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, status, starts_on, ends_on, rent_amount, rent_frequency, security_deposit_amount, members(id, full_name, phone_number)")
    .eq("organization_id", organization.id);

  // 3. Fetch unit ownerships
  const { data: ownershipsData } = await supabase
    .from("unit_ownerships")
    .select("unit_id, member_id, members(id, full_name, phone_number)")
    .eq("organization_id", organization.id);

  // 4. Fetch distinct resorts for filtering
  const { data: resortsData } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  // Transform data into normalized rows
  const ownershipMap = new Map<string, string>();
  ownershipsData?.forEach((o) => {
    const mem = o.members as unknown as { full_name?: string } | null;
    if (mem?.full_name) {
      ownershipMap.set(o.unit_id, mem.full_name);
    }
  });

  const leaseMap = new Map<string, any>();
  leasesData?.forEach((l) => {
    if (l.status === "ACTIVE" || (!leaseMap.has(l.unit_id) && l.status === "DRAFT")) {
      leaseMap.set(l.unit_id, l);
    }
  });

  const rows: RentRollUnitRow[] = (unitsData || []).map((u) => {
    const resort = u.resorts as unknown as { id: string; name: string } | null;
    const lease = leaseMap.get(u.id);
    const tenant = lease?.members as unknown as { full_name?: string; phone_number?: string } | null;

    let occupancyStatus: "OCCUPIED" | "VACANT" | "EXPIRING_SOON" | "DRAFT_LEASE" = "VACANT";
    if (lease?.status === "ACTIVE") {
      if (lease.ends_on) {
        const daysToExpiry = Math.ceil(
          (new Date(lease.ends_on).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysToExpiry <= 30 && daysToExpiry >= 0) {
          occupancyStatus = "EXPIRING_SOON";
        } else {
          occupancyStatus = "OCCUPIED";
        }
      } else {
        occupancyStatus = "OCCUPIED";
      }
    } else if (lease?.status === "DRAFT") {
      occupancyStatus = "DRAFT_LEASE";
    }

    const rentAmount = Number(lease?.rent_amount || 0);
    const frequency = lease?.rent_frequency || "MONTHLY";
    const annualRent =
      frequency === "YEARLY"
        ? rentAmount
        : frequency === "QUARTERLY"
        ? rentAmount * 4
        : rentAmount * 12;

    return {
      unitId: u.id,
      unitCode: u.code,
      unitType: u.unit_type || "RESIDENTIAL",
      resortId: u.property_id || resort?.id || "",
      resortName: resort?.name || "الكيان الرئيسي",
      ownerName: ownershipMap.get(u.id) || "—",
      tenantName: tenant?.full_name || "—",
      tenantPhone: tenant?.phone_number || "",
      leaseId: lease?.id || null,
      leaseStatus: lease?.status || "NONE",
      occupancyStatus,
      startsOn: lease?.starts_on || "—",
      endsOn: lease?.ends_on || "—",
      rentAmount,
      rentFrequency: frequency,
      annualRent,
      securityDeposit: Number(lease?.security_deposit_amount || 0),
    };
  });

  return (
    <RentRollClient
      initialRows={rows}
      resorts={resortsData || []}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
