import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CalendarClock, AlertCircle } from "lucide-react";
import { LeaseExpirationsClient, type ExpiringLeaseRow } from "./lease-expirations-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير جداول انتهاء العقود ومعدل دوران الإشغال — عقار بوكس"
      : "Lease Expirations & Churn Waterfall Schedule — AqarBooks",
    description: isAr
      ? "تخطيط استراتيجي لعقود الإيجار المنتهية خلال الـ 12 شهراً القادمة لتفادي فترات الشغور ومتابعة التجديدات."
      : "Forward-looking 12-month lease expiration schedule tracking tenancy churn, renewals, and rent at risk.",
  };
}

export default async function LeaseExpirationsPage({
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

  // See rent-roll: one key the sidebar can also express, granted to everyone
  // the previous OR admitted.
  const canRead = await hasPermission(organization.id, "property.reports.read");

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "جداول انتهاء العقود" : "Lease Expirations Schedule"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير انتهاء عقود الإيجار."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Fetch all active/draft leases with unit and member info
  const { data: leasesData } = await supabase
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, starts_on, ends_on, rent_amount, rent_frequency, status, units(code, unit_type, resorts(name)), members(name, phone, email)")
    .eq("organization_id", organization.id)
    .order("ends_on", { ascending: true });

  const now = Date.now();

  const rows: ExpiringLeaseRow[] = (leasesData || []).map((l) => {
    const unit = l.units as unknown as { code?: string; unit_type?: string; resorts?: { name?: string } | null } | null;
    const member = l.members as unknown as { name?: string; phone?: string; email?: string } | null;

    const endsOn = l.ends_on ? new Date(l.ends_on).getTime() : now + 180 * 24 * 60 * 60 * 1000;
    const daysRemaining = Math.floor((endsOn - now) / (1000 * 60 * 60 * 24));

    const freq = l.rent_frequency || "MONTHLY";
    const multiplier = freq === "YEARLY" ? 1 : freq === "QUARTERLY" ? 4 : 12;
    const annualRent = Number(l.rent_amount || 0) * multiplier;

    return {
      leaseId: l.id,
      unitCode: unit?.code || "—",
      unitType: unit?.unit_type || "APARTMENT",
      resortName: unit?.resorts?.name || (isAr ? "المنتجع الرئيسي" : "Main Resort"),
      tenantName: member?.name || (isAr ? "مستأجر مسجل" : "Registered Tenant"),
      tenantPhone: member?.phone || "",
      tenantEmail: member?.email || "",
      startDate: l.starts_on || "2025-01-01",
      endDate: l.ends_on || "2026-12-31",
      daysRemaining,
      rentAmount: Number(l.rent_amount || 0),
      annualRent,
      status: daysRemaining <= 0 ? "EXPIRED" : daysRemaining <= 30 ? "EXPIRING_SOON" : "ACTIVE",
    };
  });

  return (
    <LeaseExpirationsClient
      rows={rows}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
