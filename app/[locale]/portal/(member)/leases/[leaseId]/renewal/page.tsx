import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, KeyRound, ShieldCheck } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Badge } from "@/components/ui/badge";
import { formatLeaseDate, LEASE_RENEWAL_STATUS_COPY, PORTAL_PRIMARY_LEASE_STATUSES, type LeaseRenewalStatus } from "@/lib/lease-renewal-ui";
import { RenewalRequestForm } from "./renewal-request-form";

export default async function PortalLeaseRenewalPage({ params }: { params: Promise<{ locale: string; leaseId: string }> }) {
  const { locale, leaseId } = await params;
  setRequestLocale(locale as Locale);
  const loc = locale as "ar" | "en";
  const isAr = loc === "ar";
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");
  const supabase = await createClient();

  const { data: enabled } = await supabase.rpc("lease_lifecycle_enabled", { p_organization_id: ctx.member.organization_id });
  if (!enabled) notFound();

  const { data: tenantLease, error: leaseError } = await supabase.from("unit_leases")
    .select("id,unit_id,status,starts_on,ends_on,renewed_from_lease_id")
    .eq("id", leaseId).eq("tenant_member_id", ctx.member.id)
    .in("status", [...PORTAL_PRIMARY_LEASE_STATUSES]).maybeSingle();
  if (leaseError) return <DetailError locale={loc} />;

  let relationship: "TENANT" | "OWNER" = "TENANT";
  let lease: { id: string; unit_id: string; status: string; starts_on: string | null; ends_on: string | null; renewed_from_lease_id: string | null } | null = tenantLease;
  let ownerProjection: { status: string; requested_at: string; decided_at: string | null; lease_ends_on: string | null } | null = null;
  if (!lease) {
    relationship = "OWNER";
    const today = new Date().toISOString().slice(0, 10);
    const { data: ownerships } = await supabase.from("unit_ownerships").select("unit_id").eq("member_id", ctx.member.id).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`);
    for (const ownership of ownerships ?? []) {
      const { data } = await supabase.rpc("get_owned_unit_lease_renewal_status", { p_unit_id: ownership.unit_id });
      const match = data?.find((row) => row.lease_id === leaseId);
      if (match) {
        ownerProjection = match;
        lease = { id: match.lease_id, unit_id: match.unit_id, status: !match.lease_ends_on || match.lease_ends_on > today ? "ACTIVE" : "ENDED", starts_on: null, ends_on: match.lease_ends_on, renewed_from_lease_id: null };
        break;
      }
    }
  }
  if (!lease) notFound();

  const { data: request } = relationship === "TENANT"
    ? await supabase.from("lease_renewal_requests").select("id,status,proposed_starts_on,proposed_ends_on,successor_lease_id,created_at,decided_at").eq("lease_id", leaseId).maybeSingle()
    : { data: ownerProjection ? { id: leaseId, status: ownerProjection.status, proposed_starts_on: null, proposed_ends_on: null, successor_lease_id: null, created_at: ownerProjection.requested_at, decided_at: ownerProjection.decided_at } : null };
  const { data: successor } = relationship === "TENANT"
    ? await supabase.from("unit_leases").select("id,status,starts_on,ends_on").eq("renewed_from_lease_id", leaseId).in("status", ["SCHEDULED", "ACTIVE"]).maybeSingle()
    : { data: null };
  const requestCopy = request?.status ? LEASE_RENEWAL_STATUS_COPY[request.status as LeaseRenewalStatus] : null;
  const proposedStartsOn = lease.ends_on ? addOneDay(lease.ends_on) : "";

  return (
    <div className="space-y-6 pb-12">
      <Link href="/portal/leases" locale={loc} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600"><ArrowLeft className="size-4 rtl:rotate-180" />{isAr ? "العودة إلى العقود" : "Back to leases"}</Link>
      <header className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold text-indigo-600">{isAr ? "دورة حياة العقد" : "Lease lifecycle"}</p><h1 className="mt-1 text-2xl font-bold">{isAr ? "حالة التجديد" : "Renewal status"}</h1><p className="mt-2 text-sm text-slate-500">{relationship === "OWNER" ? (isAr ? "عرض ضيق لحالة التجديد بصفتك مالكًا حاليًا." : "A narrow renewal-status view for the current owner.") : (isAr ? "راجع الفترة الحالية وأرسل طلب التجديد." : "Review the current term and submit a renewal request.")}</p></div>
        <Badge variant={lease.status === "ACTIVE" ? "success" : "info"}>{lease.status === "ACTIVE" ? (isAr ? "عقد جارٍ" : "Current lease") : (isAr ? "عقد منتهٍ" : "Ended lease")}</Badge>
      </header>

      <section aria-labelledby="current-term-title" className="space-y-4">
        <h2 id="current-term-title" className="flex items-center gap-2 text-sm font-bold"><KeyRound className="size-4 text-indigo-500" />{isAr ? "الفترة الحالية" : "Current term"}</h2>
        <dl className="grid gap-3 border-y border-border/70 py-4 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">{isAr ? "تاريخ البداية" : "Starts"}</dt><dd className="mt-1 font-semibold">{formatLeaseDate(lease.starts_on, loc)}</dd></div>
          <div><dt className="text-xs text-slate-500">{isAr ? "تاريخ النهاية" : "Ends"}</dt><dd className="mt-1 font-semibold">{formatLeaseDate(lease.ends_on, loc)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="request-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="request-title" className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="size-4 text-indigo-500" />{isAr ? "طلب التجديد" : "Renewal request"}</h2>{requestCopy ? <Badge variant={requestCopy.tone}>{isAr ? requestCopy.ar : requestCopy.en}</Badge> : null}</div>
        {request ? (
          <dl className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">{isAr ? "تاريخ الطلب" : "Requested"}</dt><dd className="mt-1 font-medium">{new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", { dateStyle: "medium" }).format(new Date(request.created_at))}</dd></div>
            <div><dt className="text-xs text-slate-500">{isAr ? "بداية مقترحة" : "Proposed start"}</dt><dd className="mt-1 font-medium">{formatLeaseDate(request.proposed_starts_on, loc)}</dd></div>
            <div><dt className="text-xs text-slate-500">{isAr ? "نهاية مقترحة" : "Proposed end"}</dt><dd className="mt-1 font-medium">{formatLeaseDate(request.proposed_ends_on, loc)}</dd></div>
          </dl>
        ) : relationship === "TENANT" && lease.status === "ACTIVE" && proposedStartsOn ? (
          <RenewalRequestForm leaseId={lease.id} proposedStartsOn={proposedStartsOn} locale={loc} />
        ) : <p className="rounded-xl border border-dashed border-border/70 p-5 text-sm text-slate-500">{isAr ? "لا يوجد إجراء متاح لهذا العقد." : "No action is available for this lease."}</p>}
      </section>

      {successor ? <section aria-labelledby="successor-title" className="space-y-3"><h2 id="successor-title" className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-emerald-500" />{isAr ? "العقد القادم" : "Scheduled successor"}</h2><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4"><Badge variant="info">{successor.status === "SCHEDULED" ? (isAr ? "مجدول" : "Scheduled") : (isAr ? "نشط" : "Active")}</Badge><p className="mt-3 text-sm font-medium">{formatLeaseDate(successor.starts_on, loc)} – {formatLeaseDate(successor.ends_on, loc)}</p><p className="mt-2 text-xs text-slate-500">{isAr ? "لا تتوفر إجراءات يدوية للعقد المجدول قبل تاريخ بدايته." : "No manual actions are available for a scheduled lease before it starts."}</p></div></section> : null}
    </div>
  );
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function DetailError({ locale }: { locale: "ar" | "en" }) {
  return <section role="alert" className="rounded-xl border border-rose-200 bg-card p-6">{locale === "ar" ? "تعذر تحميل حالة التجديد." : "Could not load renewal status."}</section>;
}
