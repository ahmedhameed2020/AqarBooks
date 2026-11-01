import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Droplets, AlertCircle } from "lucide-react";
import { CamAllocationClient, type CamUnitRow } from "./cam-allocation-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM Allocation) — AqarBooks"
      : "Common Area Maintenance (CAM) Allocation Report — AqarBooks",
    description: isAr
      ? "توزيع مصاريف الخدمات المشتركة، الأمن، النظافة، وصيانة المرافق واللاندسكيب على الوحدات والملاك بالمتر المربع."
      : "Common Area Maintenance (CAM) allocation schedule apportioning shared facility expenses across units based on area.",
  };
}

export default async function CamAllocationPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.dues.read"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تقرير توزيع الخدمات المشتركة (CAM)" : "CAM Allocation Report"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير توزيع تكاليف الخدمات المشتركة."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: levy, error: levyError } = await supabase
    .from("service_charge_levies")
    .select("id, name, total_amount, allocation_basis, status")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (levyError) {
    return <CamError isAr={isAr} />;
  }

  let rows: CamUnitRow[] = [];
  let totalSharedExpense = 0;
  let totalGrossArea = 0;
  let costPerSqm = 0;

  if (levy) {
    const [
      { data: allocations, error: allocationError },
      { data: propertiesRaw },
      { data: resortsRaw },
    ] = await Promise.all([
      supabase
        .from("service_charge_allocations")
        .select("id, unit_id, basis_value, share_amount, due_id")
        .eq("organization_id", organization.id)
        .eq("levy_id", levy.id),
      supabase.from("properties").select("id, name").eq("organization_id", organization.id),
      supabase.from("resorts").select("id, name").eq("organization_id", organization.id),
    ]);

    if (allocationError) {
      return <CamError isAr={isAr} />;
    }

    const unitIds = Array.from(new Set((allocations ?? []).map((row) => row.unit_id)));
    const dueIds = Array.from(
      new Set((allocations ?? []).map((row) => row.due_id).filter((id): id is string => Boolean(id))),
    );

    const unitsResult = unitIds.length
      ? await supabase.from("units").select("id, code, unit_type, area, property_id").in("id", unitIds)
      : { data: [] as { id: string; code: string; unit_type: string | null; area: number | null; property_id: string | null }[], error: null };
    const ownershipsResult = unitIds.length
      ? await supabase.from("unit_ownerships").select("unit_id, member_id, is_primary_contact").in("unit_id", unitIds)
      : { data: [] as { unit_id: string; member_id: string; is_primary_contact: boolean | null }[], error: null };
    const paymentsResult = dueIds.length
      ? await supabase.from("effective_payment_allocations").select("due_id, amount").eq("organization_id", organization.id).in("due_id", dueIds)
      : { data: [] as { due_id: string; amount: number }[], error: null };

    if (unitsResult.error || ownershipsResult.error || paymentsResult.error) {
      return <CamError isAr={isAr} />;
    }

    const memberIds = Array.from(new Set((ownershipsResult.data ?? []).map((row) => row.member_id)));
    const membersResult = memberIds.length
      ? await supabase.from("members").select("id, full_name, phone").in("id", memberIds)
      : { data: [] as { id: string; full_name: string; phone: string | null }[], error: null };
    if (membersResult.error) {
      return <CamError isAr={isAr} />;
    }

    const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]));
    const propertyName = new Map(
      [...(propertiesRaw ?? []), ...(resortsRaw ?? [])].map((row) => [row.id, row.name] as const),
    );
    const memberById = new Map((membersResult.data ?? []).map((member) => [member.id, member]));
    const ownerByUnit = new Map<string, { full_name: string; phone: string | null }>();
    for (const ownership of ownershipsResult.data ?? []) {
      const member = memberById.get(ownership.member_id);
      if (!member) continue;
      if (!ownerByUnit.has(ownership.unit_id) || ownership.is_primary_contact) {
        ownerByUnit.set(ownership.unit_id, member);
      }
    }
    const paidByDue = new Map<string, number>();
    for (const payment of paymentsResult.data ?? []) {
      paidByDue.set(payment.due_id, (paidByDue.get(payment.due_id) ?? 0) + Number(payment.amount ?? 0));
    }

    totalSharedExpense = Number(levy.total_amount ?? 0);
    totalGrossArea = (unitsResult.data ?? []).reduce((sum, unit) => sum + Number(unit.area ?? 0), 0);
    costPerSqm = totalGrossArea > 0 ? totalSharedExpense / totalGrossArea : 0;

    rows = (allocations ?? [])
      .map((allocation) => {
        const unit = unitById.get(allocation.unit_id);
        const owner = ownerByUnit.get(allocation.unit_id);
        const share = Number(allocation.share_amount ?? 0);
        const billed = allocation.due_id ? share : 0;
        const paid = allocation.due_id ? paidByDue.get(allocation.due_id) ?? 0 : 0;
        return {
          unitId: allocation.unit_id,
          unitCode: unit?.code ?? "—",
          unitType: unit?.unit_type ?? "—",
          resortName: unit?.property_id ? propertyName.get(unit.property_id) ?? "—" : "—",
          ownerName: owner?.full_name ?? (isAr ? "غير مربوط بمالك" : "No owner on record"),
          ownerPhone: owner?.phone ?? "—",
          areaSqm: Number(unit?.area ?? 0),
          shareRatio: totalSharedExpense > 0 ? (share / totalSharedExpense) * 100 : 0,
          allocatedCost: share,
          billedCam: billed,
          paidCam: paid,
          balanceDue: billed - paid,
        } satisfies CamUnitRow;
      })
      .sort((a, b) => b.allocatedCost - a.allocatedCost);
  }

  return (
    <CamAllocationClient
      rows={rows}
      totalSharedExpense={totalSharedExpense}
      totalGrossArea={totalGrossArea}
      costPerSqm={costPerSqm}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}

function CamError({ isAr }: { isAr: boolean }) {
  return (
    <div className="p-8 text-center space-y-3">
      <div className="size-12 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
        <AlertCircle className="size-6" />
      </div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-white">
        {isAr ? "تعذر تحميل توزيع CAM" : "The CAM allocation report could not be loaded"}
      </h1>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">
        {isAr
          ? "لم تُقرأ البيانات من قاعدة البيانات. أعد المحاولة؛ لا تُعرض أرقام ناقصة."
          : "Data could not be read from the database. Try again; no partial numbers are shown."}
      </p>
    </div>
  );
}

