import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { UserCheck, AlertCircle } from "lucide-react";
import { OwnerStatementClient, type OwnerItem, type OwnerUnitStatement } from "./owner-statement-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "كشف حساب وتوزيعات أرباح الملاك — AqarBooks"
      : "Owner Distribution Statement — AqarBooks",
    description: isAr
      ? "كشف الحساب المالي للملاك والمستثمرين: حصر الإيجارات المحصلة، عمولات الإدارة، خصومات الصيانة، وصافي الأرباح المستحقة."
      : "Property owner statement of account: collected revenues, management fees, maintenance deductions, and net payout.",
  };
}

export default async function OwnerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ member?: string; owner?: string }>;
}) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  const requestedMemberId = sp.member || sp.owner;
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
          {isAr ? "كشف حساب وتوزيعات الملاك" : "Owner Distribution Statement"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض كشوف حسابات الملاك."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch owners (members with ownerships)
  const { data: ownershipsData } = await supabase
    .from("unit_ownerships")
    .select("member_id, unit_id, members(id, full_name, phone_number, email), units(id, code, property_id, resorts(id, name))")
    .eq("organization_id", organization.id);

  // 2. Fetch dues and payments to calculate financials
  const { data: duesData } = await supabase
    .from("dues")
    .select("id, unit_id, amount, status, due_date, due_types(name_ar, name_en)")
    .eq("organization_id", organization.id);

  // dues carry no paid_amount; collection is the sum of allocations from
  // posted payments.
  const [{ data: dueAllocations }, { data: postedPayments }] = await Promise.all([
    supabase
      .from("payment_allocations")
      .select("due_id, amount, payment_id")
      .in("due_id", (duesData ?? []).map((d) => d.id)),
    supabase
      .from("payments")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "POSTED"),
  ]);

  const postedPaymentIds = new Set((postedPayments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of dueAllocations ?? []) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }

  // 3. Map owners
  const ownersMap = new Map<string, OwnerItem>();
  const unitStatements: OwnerUnitStatement[] = [];

  ownershipsData?.forEach((o) => {
    const mem = o.members as unknown as { id: string; full_name: string; phone_number?: string; email?: string } | null;
    const unit = o.units as unknown as { id: string; code: string; property_id: string; resorts?: { id: string; name: string } } | null;

    if (!mem?.id || !unit?.id) return;

    if (!ownersMap.has(mem.id)) {
      ownersMap.set(mem.id, {
        id: mem.id,
        name: mem.full_name,
        phone: mem.phone_number || "",
        email: mem.email || "",
        unitsCount: 0,
      });
    }
    const currentOwner = ownersMap.get(mem.id)!;
    currentOwner.unitsCount += 1;

    // Unit financial calculation from dues
    const unitDues = duesData?.filter((d) => d.unit_id === unit.id) || [];
    const totalCollected = unitDues.reduce((sum, d) => sum + (paidByDue.get(d.id) ?? 0), 0);
    const totalOutstanding = unitDues.reduce(
      (sum, d) => sum + Math.max(0, Number(d.amount || 0) - (paidByDue.get(d.id) ?? 0)),
      0
    );

    // No management fee or maintenance reserve is configured anywhere in the
    // schema, so the statement reports what was actually collected rather than
    // deducting assumed percentages from it.
    const netPayout = totalCollected;

    unitStatements.push({
      ownerId: mem.id,
      unitId: unit.id,
      unitCode: unit.code,
      resortName: unit.resorts?.name || "الكيان الرئيسي",
      grossCollected: totalCollected,
      outstandingReceivables: totalOutstanding,
      netPayout,
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
  });

  return (
    <OwnerStatementClient
      owners={Array.from(ownersMap.values())}
      unitStatements={unitStatements}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
      initialOwnerId={requestedMemberId}
    />
  );
}
