import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalVisitorsClient, type PortalVisitorInvitationItem } from "./portal-visitors-client";

type InvitationRow = {
  id: string;
  invitation_no: string;
  guest_name: string;
  valid_from: string;
  valid_until: string;
  usage_policy: PortalVisitorInvitationItem["usagePolicy"];
  status: PortalVisitorInvitationItem["status"];
  unit_id: string;
  property_id: string;
};

export default async function PortalVisitorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitor_invitations")
    .select("id, invitation_no, guest_name, valid_from, valid_until, usage_policy, status, unit_id, property_id")
    .order("created_at", { ascending: false });

  if (error) console.error("[PortalVisitorsPage] invitations query failed:", error.message);
  const invitations = (data ?? []) as InvitationRow[];
  const unitIds = [...new Set(invitations.map((item) => item.unit_id))];
  const propertyIds = [...new Set(invitations.map((item) => item.property_id))];

  const [{ data: units }, { data: properties }] = await Promise.all([
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.code]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));

  const items: PortalVisitorInvitationItem[] = invitations.map((item) => ({
    id: item.id,
    invitationNo: item.invitation_no,
    guestName: item.guest_name,
    validFrom: item.valid_from,
    validUntil: item.valid_until,
    usagePolicy: item.usage_policy,
    status: item.status,
    unitCode: unitById.get(item.unit_id) ?? "—",
    propertyName: propertyById.get(item.property_id) ?? "—",
  }));

  return <PortalVisitorsClient invitations={items} locale={locale as "ar" | "en"} />;
}
