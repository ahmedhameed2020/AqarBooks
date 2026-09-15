import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StaffVisitorsClient, type StaffVisitorInvitationItem } from "./visitors-client";

type InvitationRow = {
  id: string;
  invitation_no: string;
  guest_name: string;
  valid_from: string;
  valid_until: string;
  usage_policy: StaffVisitorInvitationItem["usagePolicy"];
  status: StaffVisitorInvitationItem["status"];
  unit_id: string;
  property_id: string;
  invited_by_member_id: string;
};

export default async function VisitorsOperationsPage({
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

  const denied = await denyIfMissingPermission(organization.id, "operations.visitors.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: moduleEnabled } = await supabase.rpc("visitor_management_enabled", {
    p_organization_id: organization.id,
  });
  const { data: canManage } = await supabase.rpc("visitor_invitation_staff_can_manage", {
    p_organization_id: organization.id,
  });

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "تصاريح الزوار غير مفعلة" : "Visitor passes are not enabled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAr
            ? "فعّل استحقاق إدارة الزوار لهذه المنشأة قبل استقبال دعوات من بوابة الملاك."
            : "Enable visitor management for this organization before receiving owner portal invitations."}
        </p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("visitor_invitations")
    .select("id, invitation_no, guest_name, valid_from, valid_until, usage_policy, status, unit_id, property_id, invited_by_member_id")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) console.error("[VisitorsOperationsPage] invitations query failed:", error.message);
  const invitations = (data ?? []) as InvitationRow[];
  const unitIds = [...new Set(invitations.map((item) => item.unit_id))];
  const propertyIds = [...new Set(invitations.map((item) => item.property_id))];
  const memberIds = [...new Set(invitations.map((item) => item.invited_by_member_id))];

  const [{ data: units }, { data: properties }, { data: members }] = await Promise.all([
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : { data: [] },
    memberIds.length ? supabase.from("members").select("id, full_name").in("id", memberIds) : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.code]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const memberById = new Map((members ?? []).map((member) => [member.id, member.full_name]));

  const items: StaffVisitorInvitationItem[] = invitations.map((item) => ({
    id: item.id,
    invitationNo: item.invitation_no,
    guestName: item.guest_name,
    validFrom: item.valid_from,
    validUntil: item.valid_until,
    usagePolicy: item.usage_policy,
    status: item.status,
    unitCode: unitById.get(item.unit_id) ?? "—",
    propertyName: propertyById.get(item.property_id) ?? "—",
    memberName: memberById.get(item.invited_by_member_id) ?? "—",
  }));

  return <StaffVisitorsClient invitations={items} canManage={Boolean(canManage)} locale={locale as "ar" | "en"} />;
}
