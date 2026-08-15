import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { Wallet, Building2, CircleCheck, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "../../dashboard/kpi-card";
import { UnitBalanceBadge } from "../../property/unit-balance-badge";
import { DuesTable } from "../../property/dues-table";
import { PaymentsTable } from "../../property/payments-table";
import { BackToMembersButton } from "./back-to-members-button";
import { AddMemberDialog } from "../add-member-dialog";
import { MemberStatementDialog } from "./member-statement-dialog";
import { SendReminderDialog } from "../send-reminder-dialog";
import { InviteToPortalDialog } from "./invite-to-portal-dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { MemberTags } from "./member-tags";
import { MemberActivity, type ActivityEntry } from "./member-activity";
import { MemberDocuments, type MemberDocument } from "./member-documents";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale: locale as Locale });
  const organization = await getPrimaryOrganization(user!.id);
  if (!organization) notFound();

  const supabase = await createClient();

  // Explicit organization_id scoping (not relying on RLS alone), matching
  // the unit detail page's convention: a memberId from another tenant must
  // 404, never leak through as a silent empty page.
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, email, phone, is_company")
    .eq("id", memberId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!member) notFound();

  const canManage = await hasPermission(organization.id, "property.members.manage");

  const { data: memberPhones } = await supabase
    .from("member_phones")
    .select("id, phone_number, label, is_primary, can_receive_whatsapp")
    .eq("member_id", member.id)
    .eq("organization_id", organization.id)
    .order("is_primary", { ascending: false });

  const currency = organization.default_currency;
  const today = new Date().toISOString().slice(0, 10);

  const { data: ownerships } = await supabase
    .from("unit_ownerships")
    .select("unit_id, share_percentage, end_date")
    .eq("organization_id", organization.id)
    .eq("member_id", memberId);

  const unitIds = [...new Set((ownerships ?? []).map((o) => o.unit_id))];
  const { data: units } = unitIds.length
    ? await supabase.from("units_with_financials").select("*").in("id", unitIds)
    : { data: [] };
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  const ownedUnits = (ownerships ?? [])
    .map((o) => ({ ...o, unit: unitById.get(o.unit_id), isActive: !o.end_date || o.end_date >= today }))
    .filter((o) => o.unit)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.unit!.balance - a.unit!.balance;
    });

  // The units_with_financials view attributes only one "current owner" per
  // unit (by priority), so its owner_id can't be used to sum a co-owner's
  // balance. "Total balance" here is defined as the sum across this
  // member's currently-active ownership stakes -- matches /property exactly
  // whenever they're the sole/primary owner (the common case), but can
  // differ from /property's per-unit owner_name attribution on a unit with
  // multiple active co-owners, since each co-owner's page would otherwise
  // show the unit's full balance.
  const activeUnits = ownedUnits.filter((o) => o.isActive);
  const totalBalance = activeUnits.reduce((s, o) => s + (o.unit?.balance ?? 0), 0);

  const { data: payments } = await supabase
    .from("payments")
    .select("amount, payment_date")
    .eq("organization_id", organization.id)
    .eq("member_id", memberId)
    .eq("status", "POSTED")
    .order("payment_date", { ascending: false });
  const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0);
  const lastPayment = (payments ?? [])[0] ?? null;

  const [{ data: allTags }, { data: tagAssignments }, { data: activityRows }, { data: documentRows }, { data: allUnits }] = await Promise.all([
    supabase.from("member_tags").select("id, name").eq("organization_id", organization.id).order("name"),
    supabase.from("member_tag_assignments").select("tag_id").eq("member_id", memberId),
    supabase
      .from("member_activity_log")
      .select("id, type, body, created_at, actor_id")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("member_documents")
      .select("id, file_name, file_size, file_path, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
    supabase.from("units_with_financials").select("id, code, building_name_ar, building_name_en").eq("organization_id", organization.id).order("code"),
  ]);

  const actorIds = [...new Set((activityRows ?? []).map((a) => a.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: actorProfiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const actorNameById = new Map((actorProfiles ?? []).map((p) => [p.id, p.full_name]));

  const activityEntries: ActivityEntry[] = (activityRows ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    body: a.body,
    createdAt: a.created_at,
    actorName: a.actor_id ? (actorNameById.get(a.actor_id) ?? null) : null,
  }));

  const documents: MemberDocument[] = (documentRows ?? []).map((d) => ({
    id: d.id,
    fileName: d.file_name,
    fileSize: d.file_size,
    filePath: d.file_path,
    createdAt: d.created_at,
  }));

  return (
    <main className="space-y-6 p-6">
      <BackToMembersButton locale={locale} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{member.full_name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {member.email && <span>{member.email}</span>}
            {(memberPhones ?? []).length > 0 ? (
              (memberPhones ?? []).map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${
                    p.is_primary ? "bg-primary/10 text-primary font-medium" : "bg-muted text-muted-foreground"
                  }`}
                  dir="ltr"
                >
                  <span>{p.phone_number}</span>
                  <span className="text-[10px] uppercase text-muted-foreground/70">({p.label})</span>
                  {p.can_receive_whatsapp && <span className="text-[10px] text-emerald-500 font-bold">WA</span>}
                </span>
              ))
            ) : (
              member.phone && <span dir="ltr">{member.phone}</span>
            )}
            {!member.email && (!memberPhones || memberPhones.length === 0) && !member.phone && (
              <span>{isAr ? "بلا بيانات تواصل" : "No contact info"}</span>
            )}
          </div>
          <MemberTags
            memberId={member.id}
            organizationId={organization.id}
            allTags={allTags ?? []}
            assignedTagIds={(tagAssignments ?? []).map((t) => t.tag_id)}
            locale={locale}
            canManage={canManage}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <AddMemberDialog
              organizationId={organization.id}
              members={[{ id: member.id, full_name: member.full_name, phone: member.phone }]}
              units={(allUnits ?? []).map((u) => ({
                id: u.id,
                code: u.code,
                building_name_ar: u.building_name_ar,
                building_name_en: u.building_name_en,
              }))}
              locale={locale}
              defaultTab="ownership"
              defaultMemberId={member.id}
            />
          )}
          <SendReminderDialog
            memberId={member.id}
            organizationId={organization.id}
            memberName={member.full_name}
            phone={member.phone}
            email={member.email}
            balance={totalBalance}
            currency={currency}
            locale={locale}
            trigger={
              <Button variant="outline" size="sm">
                <MessageCircle className="size-3.5" />
                {isAr ? "تذكير" : "Remind"}
              </Button>
            }
          />
          <MemberStatementDialog
            memberId={member.id}
            memberName={member.full_name}
            locale={locale}
          />
          <InviteToPortalDialog
            memberId={member.id}
            memberName={member.full_name}
            locale={locale}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isAr ? `الرصيد الإجمالي (${currency})` : `Total balance (${currency})`}
          value={<Money amount={totalBalance} locale={locale} tone={totalBalance > 0 ? "negative" : "positive"} />}
          icon={<Wallet className="size-4.5" />}
          tone={totalBalance > 0 ? "negative" : "positive"}
        />
        <KpiCard
          label={isAr ? "الوحدات المملوكة" : "Owned units"}
          value={String(activeUnits.length)}
          icon={<Building2 className="size-4.5" />}
        />
        <KpiCard
          label={isAr ? `إجمالي المدفوع (${currency})` : `Total paid (${currency})`}
          value={<Money amount={totalPaid} locale={locale} tone="positive" />}
          icon={<CircleCheck className="size-4.5" />}
          tone="positive"
        />
        <KpiCard
          label={isAr ? "آخر دفعة" : "Last payment"}
          value={lastPayment ? <Money amount={lastPayment.amount} currency={currency} locale={locale} /> : "—"}
          hint={lastPayment?.payment_date}
          icon={<Clock3 className="size-4.5" />}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "الوحدات المملوكة" : "Owned units"}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? "رقم الوحدة" : "Unit"}</TableHead>
                <TableHead>{isAr ? "المبنى" : "Building"}</TableHead>
                <TableHead>{isAr ? "المنطقة" : "Zone"}</TableHead>
                <TableHead>{isAr ? "نسبة الملكية" : "Ownership share"}</TableHead>
                <TableHead>{isAr ? "حالة الملكية" : "Ownership status"}</TableHead>
                <TableHead>{isAr ? "رصيد الوحدة" : "Unit balance"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownedUnits.length ? (
                ownedUnits.map((o) => (
                  <TableRow key={o.unit_id}>
                    <TableCell className="font-medium">
                      <Link href={`/property/${o.unit_id}`} locale={locale} className="hover:underline">
                        {o.unit!.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(isAr ? o.unit!.building_name_ar : o.unit!.building_name_en) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(isAr ? o.unit!.zone_name_ar : o.unit!.zone_name_en) ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{o.share_percentage}%</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-transparent",
                          o.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {o.isActive ? (isAr ? "نشطة" : "Active") : (isAr ? "منتهية" : "Ended")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <UnitBalanceBadge balance={o.unit!.balance} currency={currency} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد وحدات مملوكة" : "No owned units"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الاستحقاقات" : "Dues history"}</h2>
        <DuesTable organizationId={organization.id} memberId={memberId} locale={locale} currency={currency} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الدفعات" : "Payments history"}</h2>
        <PaymentsTable organizationId={organization.id} memberId={memberId} locale={locale} currency={currency} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{isAr ? "الملاحظات والنشاط" : "Notes & activity"}</h2>
          <MemberActivity
            memberId={member.id}
            organizationId={organization.id}
            entries={activityEntries}
            locale={locale}
            canManage={canManage}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{isAr ? "المستندات" : "Documents"}</h2>
          <MemberDocuments
            memberId={member.id}
            organizationId={organization.id}
            documents={documents}
            locale={locale}
            canManage={canManage}
          />
        </section>
      </div>
    </main>
  );
}
