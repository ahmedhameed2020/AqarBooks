import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { ArrowRight, Wallet, Building2, CircleCheck, Clock3 } from "lucide-react";
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
import { AddMemberDialog } from "../add-member-dialog";
import { SendReminderDialog } from "../send-reminder-dialog";
import { InviteToPortalDialog } from "./invite-to-portal-dialog";
import { MemberStatementButton } from "./member-statement-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
// TODO: `./member-statement-dialog`, `./member-tags`, `./member-activity`,
// and `./member-documents` were referenced here but never implemented --
// confirmed via `git log --all` that no commit on any branch in this repo
// ever added these files. This is member-CRM scope (tags, activity log,
// document uploads, PDF statement), which is out of scope for the current
// baseline cleanup. The imports and their JSX usage below were removed
// pending that feature; see git history for
// `app/[locale]/(app)/members/[memberId]/page.tsx`.
// (`./back-to-members-button` was also removed here, but replaced with a
// plain Link below -- back-navigation isn't CRM scope.)

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

  // TODO: this used to also fetch member_tags/member_tag_assignments,
  // member_activity_log (+ actor profile names), and member_documents to
  // feed MemberTags/MemberActivity/MemberDocuments below -- those components
  // were never implemented (see the TODO near the top-of-file imports), so
  // those queries were removed rather than left running for no consumer.
  const { data: allUnits } = await supabase
    .from("units_with_financials")
    .select("id, code, building_name_ar, building_name_en")
    .eq("organization_id", organization.id)
    .order("code");

  const { data: memberDues } = await supabase
    .from("dues")
    .select("id, amount, due_date, status, due_type_id, unit_id")
    .eq("organization_id", organization.id)
    .in("unit_id", unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"])
    .order("due_date", { ascending: true });

  const dueTypeIds = [...new Set((memberDues ?? []).map((d) => d.due_type_id))];
  const { data: dueTypes } = dueTypeIds.length
    ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
    : { data: [] };
  const dueTypeName = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));

  const formattedDues = (memberDues ?? []).map((d) => ({
    date: d.due_date,
    type: dueTypeName.get(d.due_type_id) ?? (isAr ? "مطالبة مالية" : "Fee Due"),
    amount: d.amount,
    unitCode: unitById.get(d.unit_id)?.code ?? null,
    status: d.status,
  }));

  const formattedPayments = (payments ?? []).map((p) => ({
    date: p.payment_date,
    method: "PAYMENT",
    amount: p.amount,
  }));

  return (
    <main className="space-y-6 p-6">
      <Link
        href="/members"
        locale={locale}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ArrowRight className="size-3.5 rtl:-scale-x-100" />
        {isAr ? "رجوع للأعضاء" : "Back to members"}
      </Link>

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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <AddMemberDialog
              organizationId={organization.id}
              members={[{ id: member.id, full_name: member.full_name }]}
              units={(allUnits ?? []).map((u) => ({
                id: u.id,
                code: u.code,
                building_name_ar: u.building_name_ar,
                building_name_en: u.building_name_en,
              }))}
              locale={locale}
            />
          )}

          <MemberStatementButton
            organizationName={organization.name}
            propertyName={organization.name}
            currency={currency}
            memberName={member.full_name}
            dues={formattedDues}
            payments={formattedPayments}
            locale={locale}
          />

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

      {/*
        TODO: "Notes & activity" (MemberActivity) and "Documents"
        (MemberDocuments) were never implemented -- removed, see
        top-of-file TODO.
      */}
    </main>
  );
}
