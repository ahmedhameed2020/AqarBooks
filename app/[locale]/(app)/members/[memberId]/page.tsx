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
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "../../dashboard/kpi-card";
import { UnitBalanceBadge } from "../../property/unit-balance-badge";
import { DuesTable } from "../../property/dues-table";
import { PaymentsTable } from "../../property/payments-table";
import { BackButton } from "../../property/back-button";

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

  return (
    <main className="space-y-6 p-6">
      <BackButton locale={locale} />

      <div>
        <h1 className="text-xl font-semibold">{member.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          {[member.email, member.phone].filter(Boolean).join(" · ") || (isAr ? "بلا بيانات تواصل" : "No contact info")}
        </p>
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
    </main>
  );
}
