import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Wallet,
  Building2,
  CircleCheck,
  Clock3,
  Phone,
  Mail,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  Layers,
  FileText,
  User,
  Building,
  DollarSign,
  TrendingUp,
  Percent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { SendReminderDialog } from "../send-reminder-dialog";
import { InviteToPortalDialog } from "./invite-to-portal-dialog";
import { MemberStatementButton } from "./member-statement-button";
import { LinkUnitDialog, type UnitOption } from "./link-unit-dialog";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "الملف المالي للمالك والعقارات | عقار بوكس" : "Owner & Property Portfolio | AqarBooks",
  };
}

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
    .select("unit_id, share_percentage, start_date, end_date")
    .eq("organization_id", organization.id)
    .eq("member_id", memberId);

  const unitIds = [...new Set((ownerships ?? []).map((o) => o.unit_id))];
  const { data: units } = unitIds.length
    ? await supabase.from("units_with_financials").select("*").in("id", unitIds)
    : { data: [] };
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  const ownedUnits = (ownerships ?? [])
    .map((o) => ({
      ...o,
      unit: unitById.get(o.unit_id),
      isActive: !o.end_date || o.end_date >= today,
    }))
    .filter((o) => o.unit)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (b.unit?.balance || 0) - (a.unit?.balance || 0);
    });

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

  const { data: allOrgUnits } = await supabase
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

  // Primary contact phone
  const primaryPhoneObj = (memberPhones ?? []).find((p) => p.is_primary) || (memberPhones ?? [])[0];
  const displayPhone = primaryPhoneObj?.phone_number || member.phone || null;
  const whatsappNumber = displayPhone ? displayPhone.replace(/\D/g, "") : null;
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;

  return (
    <main className="space-y-6 p-6">
      {/* Back link */}
      <div>
        <Link
          href="/members"
          locale={locale}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowRight className="size-3.5 rtl:-scale-x-100" />
          {isAr ? "رجوع لدليل الأعضاء والملاك" : "Back to members"}
        </Link>
      </div>

      {/* Executive Hero Banner & Profile Card */}
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card to-slate-900/20 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Identity block */}
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <div className="size-16 sm:size-20 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-lg ring-4 ring-indigo-500/15 shrink-0">
              {member.full_name.trim().slice(0, 1)}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {member.full_name}
                </h1>
                <Badge
                  variant="outline"
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    member.is_company
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                      : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                  }`}
                >
                  {member.is_company ? (
                    <>
                      <Building className="size-3 me-1 inline-block" />
                      {isAr ? "شركة / جهة اعتبارية" : "Corporate"}
                    </>
                  ) : (
                    <>
                      <User className="size-3 me-1 inline-block" />
                      {isAr ? "مالك فردي" : "Individual"}
                    </>
                  )}
                </Badge>
              </div>

              {/* Contact chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {displayPhone && (
                  <a
                    href={`tel:${displayPhone}`}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold transition-colors"
                  >
                    <Phone className="size-3 text-indigo-500" />
                    <span>{displayPhone}</span>
                  </a>
                )}

                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-semibold border border-emerald-500/30 transition-colors"
                  >
                    <MessageCircle className="size-3 fill-emerald-500 text-emerald-500" />
                    <span>WhatsApp</span>
                  </a>
                )}

                {member.email && (
                  <a
                    href={`mailto:${member.email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition-colors"
                  >
                    <Mail className="size-3 text-slate-400" />
                    <span>{member.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 pt-4 lg:pt-0 border-t lg:border-t-0 border-border/60">
            {canManage && (
              <LinkUnitDialog
                organizationId={organization.id}
                memberId={member.id}
                memberName={member.full_name}
                units={(allOrgUnits ?? []).map((u) => ({
                  id: u.id,
                  code: u.code,
                  building_name_ar: u.building_name_ar,
                  building_name_en: u.building_name_en,
                }))}
                locale={locale}
              />
            )}

            <Link
              href={`/finance/reports/owner-statement?member=${member.id}`}
              locale={locale}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileText className="size-3.5 text-indigo-500" />
              <span>{isAr ? "كشف حساب وتوزيعات المالك" : "Owner Statement"}</span>
            </Link>

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
                  <MessageCircle className="size-3.5 text-emerald-500" />
                  {isAr ? "تذكير بالسداد" : "Remind"}
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
      </section>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isAr ? `إجمالي الرصيد المستحق (${currency})` : `Total Outstanding Balance (${currency})`}
          value={<Money amount={totalBalance} locale={locale} tone={totalBalance > 0 ? "negative" : "positive"} />}
          icon={<Wallet className="size-5" />}
          tone={totalBalance > 0 ? "negative" : "positive"}
          hint={totalBalance > 0 ? (isAr ? "مطلوب سداده" : "Due for payment") : (isAr ? "الحساب مسوى بالكامل" : "Fully settled")}
        />
        <KpiCard
          label={isAr ? "العقارات والوحدات المملوكة" : "Owned Properties & Units"}
          value={String(activeUnits.length)}
          icon={<Building2 className="size-5" />}
          hint={isAr ? `إجمالي الحصص (${activeUnits.length} وحدة)` : `${activeUnits.length} active units`}
        />
        <KpiCard
          label={isAr ? `إجمالي السداد والتحصيل (${currency})` : `Total Paid & Collected (${currency})`}
          value={<Money amount={totalPaid} locale={locale} tone="positive" />}
          icon={<CircleCheck className="size-5" />}
          tone="positive"
          hint={isAr ? "سندات مقيدة ومثبتة" : "Posted receipts"}
        />
        <KpiCard
          label={isAr ? "آخر دفعة مسجلة" : "Last Recorded Payment"}
          value={lastPayment ? <Money amount={lastPayment.amount} currency={currency} locale={locale} /> : "—"}
          hint={lastPayment?.payment_date || (isAr ? "لا توجد دفعات" : "No payments")}
          icon={<Clock3 className="size-5" />}
        />
      </div>

      {/* Portfolio Tabs Container */}
      <Tabs defaultValue="units" className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          <TabsTrigger value="units" className="gap-2 rounded-lg font-bold">
            <Building2 className="size-4" />
            <span>{isAr ? "الوحدات العقارية المملوكة" : "Owned Units"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {ownedUnits.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="dues" className="gap-2 rounded-lg font-bold">
            <FileText className="size-4" />
            <span>{isAr ? "المطالبات والاستحقاقات" : "Financial Dues"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {formattedDues.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2 rounded-lg font-bold">
            <DollarSign className="size-4" />
            <span>{isAr ? "سندات التحصيل والدفع" : "Payments & Receipts"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {formattedPayments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Owned Units */}
        <TabsPanel value="units" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? "قائمة العقارات والوحدات المسجلة باسم المالك" : "Registered Real Estate Units"}
            </h2>
            {canManage && (
              <LinkUnitDialog
                organizationId={organization.id}
                memberId={member.id}
                memberName={member.full_name}
                units={(allOrgUnits ?? []).map((u) => ({
                  id: u.id,
                  code: u.code,
                  building_name_ar: u.building_name_ar,
                  building_name_en: u.building_name_en,
                }))}
                locale={locale}
                trigger={
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold">
                    <Building2 className="size-3.5" />
                    <span>{isAr ? "➕ ربط وحدة إضافية" : "➕ Link Another Unit"}</span>
                  </Button>
                }
              />
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="font-bold">{isAr ? "كود الوحدة" : "Unit Code"}</TableHead>
                  <TableHead className="font-bold">{isAr ? "المبنى / العقار" : "Building"}</TableHead>
                  <TableHead className="font-bold">{isAr ? "المنطقة" : "Zone"}</TableHead>
                  <TableHead className="font-bold">{isAr ? "نسبة الملكية" : "Ownership Share"}</TableHead>
                  <TableHead className="font-bold">{isAr ? "حالة الملكية" : "Status"}</TableHead>
                  <TableHead className="font-bold">{isAr ? "رصيد الذمة للوحدة" : "Unit Balance"}</TableHead>
                  <TableHead className="text-end font-bold">{isAr ? "الإجراء" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownedUnits.length ? (
                  ownedUnits.map((o) => (
                    <TableRow key={o.unit_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <TableCell className="font-bold">
                        <Link
                          href={`/property/${o.unit_id}`}
                          locale={locale}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                        >
                          <span>{o.unit!.code}</span>
                          <ExternalLink className="size-3 opacity-60" />
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                        {(isAr ? o.unit!.building_name_ar : o.unit!.building_name_en) ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400">
                        {(isAr ? o.unit!.zone_name_ar : o.unit!.zone_name_en) ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {o.share_percentage}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-semibold text-[11px] px-2 py-0.5",
                            o.isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300"
                          )}
                        >
                          {o.isActive ? (isAr ? "ملكية سارية" : "Active") : (isAr ? "منتهية" : "Ended")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <UnitBalanceBadge balance={o.unit!.balance} currency={currency} locale={locale} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Link
                          href={`/property/${o.unit_id}`}
                          locale={locale}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <ExternalLink className="size-3.5 text-indigo-500 me-1" />
                          <span className="text-xs">{isAr ? "بروفايل الوحدة" : "Unit Profile"}</span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                      <Building2 className="size-8 mx-auto opacity-30" />
                      <p className="text-sm font-semibold">
                        {isAr ? "لا توجد وحدات عقارية مربوطة بهذا المالك حتى الآن" : "No owned units linked yet"}
                      </p>
                      {canManage && (
                        <div className="pt-2">
                          <LinkUnitDialog
                            organizationId={organization.id}
                            memberId={member.id}
                            memberName={member.full_name}
                            units={(allOrgUnits ?? []).map((u) => ({
                              id: u.id,
                              code: u.code,
                              building_name_ar: u.building_name_ar,
                              building_name_en: u.building_name_en,
                            }))}
                            locale={locale}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsPanel>

        {/* Tab 2: Dues */}
        <TabsPanel value="dues" className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "سجل الاستحقاقات والمطالبات المالية" : "Financial Dues & Invoices"}
          </h2>
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
            <DuesTable organizationId={organization.id} memberId={memberId} locale={locale} currency={currency} />
          </div>
        </TabsPanel>

        {/* Tab 3: Payments */}
        <TabsPanel value="payments" className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "سجل السندات والمدفوعات المسددة" : "Payments & Receipts Ledger"}
          </h2>
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
            <PaymentsTable organizationId={organization.id} memberId={memberId} locale={locale} currency={currency} />
          </div>
        </TabsPanel>
      </Tabs>
    </main>
  );
}
