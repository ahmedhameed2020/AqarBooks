import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { RevokeVisitorButton } from "@/app/[locale]/portal/(member)/visitors/[invitationId]/revoke-visitor-button";
import {
  getVisitorEffectiveStatus,
  VISITOR_STATUS_LABELS,
  VISITOR_USAGE_LABELS,
  type VisitorInvitationStatus,
  type VisitorUsagePolicy,
} from "@/app/[locale]/portal/(member)/visitors/visitor-labels";

export default async function StaffVisitorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; invitationId: string }>;
}) {
  const { locale, invitationId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.visitors.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: moduleEnabled }, { data: canManage }] = await Promise.all([
    supabase.rpc("visitor_management_enabled", { p_organization_id: organization.id }),
    supabase.rpc("visitor_invitation_staff_can_manage", { p_organization_id: organization.id }),
  ]);
  if (!moduleEnabled) notFound();

  const { data: invitation } = await supabase
    .from("visitor_invitations")
    .select("id, invitation_no, guest_name, guest_phone, guest_note, valid_from, valid_until, usage_policy, status, unit_id, property_id, invited_by_member_id, created_at, revoked_at")
    .eq("id", invitationId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!invitation) notFound();

  const [{ data: unit }, { data: property }, { data: member }] = await Promise.all([
    supabase.from("units").select("code").eq("id", invitation.unit_id).maybeSingle(),
    supabase.from("properties").select("name").eq("id", invitation.property_id).maybeSingle(),
    supabase.from("members").select("full_name, email, phone").eq("id", invitation.invited_by_member_id).maybeSingle(),
  ]);

  const effectiveStatus = getVisitorEffectiveStatus({
    status: invitation.status as VisitorInvitationStatus,
    valid_from: invitation.valid_from,
    valid_until: invitation.valid_until,
  });
  const statusLabel = VISITOR_STATUS_LABELS[effectiveStatus];
  const usageLabel = VISITOR_USAGE_LABELS[invitation.usage_policy as VisitorUsagePolicy];
  const canRevoke = Boolean(canManage) && invitation.status === "ACTIVE" && effectiveStatus !== "EXPIRED";

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{invitation.invitation_no}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{invitation.guest_name}</h1>
          <p className="text-xs font-medium text-slate-500">
            {property?.name ?? "—"} · {unit?.code ?? "—"} · {member?.full_name ?? "—"}
          </p>
        </div>
        <Link href="/operations/visitors" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "كل التصاريح" : "All Passes"}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusLabel.tone}>{isAr ? statusLabel.ar : statusLabel.en}</Badge>
            <Badge variant="outline">{isAr ? usageLabel.ar : usageLabel.en}</Badge>
          </div>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-slate-400">{isAr ? "صالح من" : "Valid from"}</dt><dd className="font-semibold">{new Date(invitation.valid_from).toLocaleString(isAr ? "ar-EG" : "en-US")}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "صالح حتى" : "Valid until"}</dt><dd className="font-semibold">{new Date(invitation.valid_until).toLocaleString(isAr ? "ar-EG" : "en-US")}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "الهاتف" : "Phone"}</dt><dd className="font-semibold">{invitation.guest_phone ?? "—"}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "أُنشئ في" : "Created"}</dt><dd className="font-semibold">{new Date(invitation.created_at).toLocaleString(isAr ? "ar-EG" : "en-US")}</dd></div>
          </dl>
          {invitation.guest_note ? (
            <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {invitation.guest_note}
            </p>
          ) : null}
          {canRevoke ? <RevokeVisitorButton invitationId={invitation.id} locale={locale as "ar" | "en"} /> : null}
        </section>

        <aside className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "العضو الداعي" : "Inviting Member"}</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div><dt className="text-slate-400">{isAr ? "الاسم" : "Name"}</dt><dd className="font-semibold">{member?.full_name ?? "—"}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "البريد" : "Email"}</dt><dd className="font-semibold">{member?.email ?? "—"}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "الهاتف" : "Phone"}</dt><dd className="font-semibold">{member?.phone ?? "—"}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
