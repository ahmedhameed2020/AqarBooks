import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { isPortalPrimaryLeaseStatus } from "@/lib/lease-renewal-ui";
import { PortalLeasesClient, type PortalLeaseItem } from "./portal-leases-client";

export default async function PortalLeasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: enabled, error: entitlementError } = await supabase.rpc("lease_lifecycle_enabled", {
    p_organization_id: ctx.member.organization_id,
  });
  if (entitlementError) return <LoadError locale={locale as "ar" | "en"} />;
  if (!enabled) return <Unavailable locale={locale as "ar" | "en"} />;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: leases, error: leasesError }, { data: requests, error: requestsError }, { data: ownerships, error: ownershipsError }] = await Promise.all([
    supabase.from("unit_leases").select("id,unit_id,status,starts_on,ends_on,renewed_from_lease_id").eq("tenant_member_id", ctx.member.id).in("status", ["ACTIVE", "ENDED", "SCHEDULED"]).order("starts_on", { ascending: false }),
    supabase.from("lease_renewal_requests").select("id,lease_id,unit_id,status,successor_lease_id,proposed_starts_on,created_at").eq("tenant_member_id", ctx.member.id).order("created_at", { ascending: false }),
    supabase.from("unit_ownerships").select("unit_id").eq("member_id", ctx.member.id).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`),
  ]);
  if (leasesError || requestsError || ownershipsError) return <LoadError locale={locale as "ar" | "en"} />;

  const unitIds = [...new Set([...(leases ?? []).map((row) => row.unit_id), ...(ownerships ?? []).map((row) => row.unit_id)])];
  const { data: units } = unitIds.length ? await supabase.from("units").select("id,code").in("id", unitIds) : { data: [] };
  const unitLabel = new Map((units ?? []).map((unit) => [unit.id, `${isAr ? "الوحدة" : "Unit"} ${unit.code}`]));
  const requestByLease = new Map((requests ?? []).map((request) => [request.lease_id, request]));
  const successorBySource = new Map((leases ?? []).filter((lease) => lease.renewed_from_lease_id).map((lease) => [lease.renewed_from_lease_id!, lease]));

  const items = new Map<string, PortalLeaseItem>();
  for (const lease of leases ?? []) {
    if (lease.renewed_from_lease_id) continue;
    if (!isPortalPrimaryLeaseStatus(lease.status)) continue;
    const successor = successorBySource.get(lease.id);
    const request = requestByLease.get(lease.id);
    items.set(lease.id, {
      leaseId: lease.id,
      unitLabel: unitLabel.get(lease.unit_id) ?? `${isAr ? "عقد الوحدة" : "Unit lease"} · ${lease.unit_id.slice(0, 8)}`,
      relationship: "TENANT",
      leaseStatus: lease.status,
      startsOn: lease.starts_on,
      endsOn: lease.ends_on,
      successorStartsOn: successor?.starts_on ?? null,
      requestStatus: request?.status as PortalLeaseItem["requestStatus"] ?? null,
    });
  }

  const ownerProjections = await Promise.all((ownerships ?? []).map(async ({ unit_id }) => {
    const { data } = await supabase.rpc("get_owned_unit_lease_renewal_status", { p_unit_id: unit_id });
    return data?.[0] ?? null;
  }));
  for (const projection of ownerProjections) {
    if (!projection || items.has(projection.lease_id)) continue;
    items.set(projection.lease_id, {
      leaseId: projection.lease_id,
      unitLabel: unitLabel.get(projection.unit_id) ?? `${isAr ? "الوحدة" : "Unit"} · ${projection.unit_id.slice(0, 8)}`,
      relationship: "OWNER",
      leaseStatus: !projection.lease_ends_on || projection.lease_ends_on > today ? "ACTIVE" : "ENDED",
      startsOn: null,
      endsOn: projection.lease_ends_on,
      successorStartsOn: null,
      requestStatus: projection.status as PortalLeaseItem["requestStatus"],
    });
  }

  return <PortalLeasesClient items={[...items.values()]} locale={locale as "ar" | "en"} />;
}

function LoadError({ locale }: { locale: "ar" | "en" }) {
  return <section role="alert" className="rounded-xl border border-rose-200 bg-card p-6"><h1 className="font-bold">{locale === "ar" ? "تعذر تحميل العقود" : "Could not load leases"}</h1><p className="mt-2 text-sm text-slate-500">{locale === "ar" ? "حدّث الصفحة، وإذا استمرت المشكلة فتواصل مع الإدارة." : "Refresh the page. If the problem continues, contact management."}</p></section>;
}

function Unavailable({ locale }: { locale: "ar" | "en" }) {
  return <section className="rounded-xl border border-border/70 bg-card p-6"><h1 className="font-bold">{locale === "ar" ? "تجديد العقود غير متاح في الباقة" : "Lease renewals are not included in this plan"}</h1></section>;
}
