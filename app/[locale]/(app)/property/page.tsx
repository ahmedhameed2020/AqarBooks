import { setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { Building2, Percent, AlertCircle, Wallet, FileUp, Sparkles, Building } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Money } from "@/components/money";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "../dashboard/kpi-card";
import { AddUnitDialog } from "./add-unit-dialog";
import { ManageStructureDialog } from "./manage-structure-dialog";
import { UnitsTable, UNIT_TYPES, OCCUPANCY_STATUSES } from "./units-table";
import { UnitsFilters } from "./units-filters";
import { UnitsPagination } from "./units-pagination";
import { ResortSelector } from "./resort-selector";
import { PropertyNavProvider } from "./property-nav-context";
import { UnitDrawer, type UnitDrawerData } from "./unit-drawer";

const PAGE_SIZE = 50;

async function getUnitDrawerData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  unitId: string,
  isAr: boolean,
): Promise<UnitDrawerData | null> {
  const { data: unit } = await supabase
    .from("units_with_financials")
    .select("*")
    .eq("id", unitId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!unit) return null;

  const { data: dueRows } = await supabase
    .from("dues")
    .select("id, due_type_id, amount, due_date, status")
    .eq("organization_id", organizationId)
    .eq("unit_id", unitId)
    .order("due_date", { ascending: false })
    .limit(5);
  const dueTypeIds = [...new Set((dueRows ?? []).map((d) => d.due_type_id))];
  const { data: dueTypes } = dueTypeIds.length
    ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
    : { data: [] };
  const typeNameById = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));
  const dues = (dueRows ?? []).map((d) => ({
    id: d.id,
    date: d.due_date,
    type: typeNameById.get(d.due_type_id) ?? "—",
    amount: d.amount,
    status: d.status,
  }));

  const { data: allUnitDues } = await supabase.from("dues").select("id").eq("organization_id", organizationId).eq("unit_id", unitId);
  const unitDueIds = (allUnitDues ?? []).map((d) => d.id);
  let payments: UnitDrawerData["payments"] = [];
  if (unitDueIds.length) {
    const { data: allocations } = await supabase
      .from("payment_allocations")
      .select("payment_id, amount")
      .in("due_id", unitDueIds);
    const paymentIds = [...new Set((allocations ?? []).map((a) => a.payment_id))];
    if (paymentIds.length) {
      const { data: paymentRows } = await supabase
        .from("payments")
        .select("id, method, payment_date, status")
        .eq("organization_id", organizationId)
        .in("id", paymentIds)
        .eq("status", "POSTED")
        .order("payment_date", { ascending: false })
        .limit(5);
      payments = (paymentRows ?? []).map((p) => ({
        id: p.id,
        date: p.payment_date,
        method: p.method,
        amount: (allocations ?? []).filter((a) => a.payment_id === p.id).reduce((s, a) => s + a.amount, 0),
      }));
    }
  }

  return {
    id: unit.id,
    code: unit.code,
    unitType: unit.unit_type,
    customTypeLabel: unit.custom_type_label,
    buildingName: isAr ? unit.building_name_ar : unit.building_name_en,
    zoneName: isAr ? unit.zone_name_ar : unit.zone_name_en,
    occupancyStatus: unit.occupancy_status,
    ownerId: unit.owner_id,
    ownerName: unit.owner_name,
    balance: unit.balance,
    totalDue: unit.total_due,
    totalPaid: unit.total_paid,
    dues,
    payments,
  };
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    resort?: string;
    q?: string;
    building?: string;
    zone?: string;
    type?: string;
    occupancy?: string;
    arrears?: string;
    page?: string;
    unit?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale: locale as Locale });
  const organization = await getPrimaryOrganization(user!.id);
  if (!organization) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          {isAr ? "حسابك غير مرتبط بأي منظمة بعد." : "Your account isn't linked to an organization yet."}
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: resorts } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  if (!resorts?.length) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">
          {isAr ? "أنشئ منتجعًا أولًا من إدارة المنظمة." : "Create a resort first from Organization Admin."}
        </p>
      </main>
    );
  }

  const resort = resorts.find((r) => r.id === sp.resort) ?? resorts[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const currency = organization.default_currency;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [{ data: buildings }, { data: zones }, { data: kpiRows }, { data: monthPayments }] = await Promise.all([
    supabase.from("buildings").select("id, name_ar, name_en").eq("property_id", resort.id).order("code"),
    supabase.from("zones").select("id, name_ar, name_en").eq("property_id", resort.id).order("name_ar"),
    supabase.from("units_with_financials").select("occupancy_status, balance").eq("property_id", resort.id),
    supabase
      .from("payments")
      .select("amount")
      .eq("property_id", resort.id)
      .eq("status", "POSTED")
      .gte("payment_date", monthStart),
  ]);

  const totalUnits = kpiRows?.length ?? 0;
  const occupiedUnits = (kpiRows ?? []).filter((r) => r.occupancy_status === "OCCUPIED").length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const totalArrears = (kpiRows ?? []).reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
  const collectedThisMonth = (monthPayments ?? []).reduce((s, p) => s + p.amount, 0);

  let query = supabase
    .from("units_with_financials")
    .select("*", { count: "exact" })
    .eq("property_id", resort.id);

  if (sp.q) {
    const term = sp.q.replace(/"/g, "").trim();
    const clauses = [
      `code.ilike."%${term}%"`,
      `owner_name.ilike."%${term}%"`,
      `building_name_ar.ilike."%${term}%"`,
      `building_name_en.ilike."%${term}%"`,
      `owner_phone.ilike."%${term}%"`,
    ];
    const numericArea = Number(term);
    if (!Number.isNaN(numericArea)) {
      clauses.push(`area.eq.${numericArea}`);
    }
    query = query.or(clauses.join(","));
  }
  if (sp.building) query = query.eq("building_id", sp.building);
  if (sp.zone) query = query.eq("zone_id", sp.zone);
  if (sp.type && (UNIT_TYPES as readonly string[]).includes(sp.type)) {
    query = query.eq("unit_type", sp.type as (typeof UNIT_TYPES)[number]);
  }
  if (sp.occupancy && (OCCUPANCY_STATUSES as readonly string[]).includes(sp.occupancy)) {
    query = query.eq("occupancy_status", sp.occupancy as (typeof OCCUPANCY_STATUSES)[number]);
  }
  if (sp.arrears === "1") query = query.eq("has_arrears", true);

  const { data: units, count } = await query.order("code").range(from, to);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const drawerData = sp.unit ? await getUnitDrawerData(supabase, organization.id, sp.unit, isAr) : null;

  return (
    <PropertyNavProvider>
      <main className="space-y-6 p-6">
        {/* Executive Glass Banner Header */}
        <div className="gradient-hero-banner relative overflow-hidden rounded-3xl border border-border/60 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Building className="size-3.5 text-primary" />
                <span>{resort.name}</span>
                <span>·</span>
                <span>{organization.name}</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {isAr ? "دليل وحدات المنتجع" : "Resort Units & Property Assets"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr
                  ? "إدارة الوحدات العقارية، حالات الإشغال، والذمم المالية للملاك"
                  : "Comprehensive property management, occupancy tracking, and owner balances"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {resorts.length > 1 && <ResortSelector resorts={resorts} selectedId={resort.id} locale={locale} />}

              <ManageStructureDialog
                organizationId={organization.id}
                resortId={resort.id}
                zones={zones ?? []}
                locale={locale}
              />
              <AddUnitDialog
                organizationId={organization.id}
                resortId={resort.id}
                buildings={buildings ?? []}
                zones={zones ?? []}
                locale={locale}
              />
            </div>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="reveal-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div style={{ "--reveal-i": 0 } as React.CSSProperties}>
            <KpiCard
              label={isAr ? "إجمالي الوحدات المسجلة" : "Total Registered Units"}
              value={String(totalUnits)}
              icon={<Building2 className="size-5" />}
              tone="info"
            />
          </div>
          <div style={{ "--reveal-i": 1 } as React.CSSProperties}>
            <KpiCard
              label={isAr ? "معدل الإشغال الإجمالي" : "Occupancy Rate"}
              value={`${occupancyRate}%`}
              hint={isAr ? `${occupiedUnits} وحدات مشغولة من أصل ${totalUnits}` : `${occupiedUnits} occupied of ${totalUnits}`}
              icon={<Percent className="size-5" />}
              tone={occupancyRate >= 70 ? "positive" : occupancyRate >= 40 ? "warning" : "negative"}
            />
          </div>
          <div style={{ "--reveal-i": 2 } as React.CSSProperties}>
            <KpiCard
              label={isAr ? `إجمالي المتأخرات القائمة (${currency})` : `Total Outstanding Arrears (${currency})`}
              value={<Money amount={totalArrears} locale={locale} tone={totalArrears > 0 ? "negative" : undefined} zeroLabel={isAr ? "لا يوجد" : "None"} />}
              icon={<AlertCircle className="size-5" />}
              tone={totalArrears > 0 ? "negative" : "positive"}
              changeLabel={totalArrears > 0 ? (isAr ? "تتطلب متابعة الملاك" : "Follow up required") : (isAr ? "رصيد منضبط" : "Fully settled")}
            />
          </div>
          <div style={{ "--reveal-i": 3 } as React.CSSProperties}>
            <KpiCard
              label={isAr ? `التحصيلات هذا الشهر (${currency})` : `Collected This Month (${currency})`}
              value={<Money amount={collectedThisMonth} currency={currency} locale={locale} />}
              icon={<Wallet className="size-5" />}
              tone="positive"
            />
          </div>
        </div>

        {totalUnits === 0 && !sp.q && !sp.building && !sp.zone && !sp.type && !sp.occupancy && !sp.arrears ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/50 py-16 text-center shadow-2xs">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </div>
            <div>
              <p className="text-base font-semibold">{isAr ? "لا توجد وحدات مسجلة بعد" : "No units registered yet"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAr ? "ابدأ بإضافة أول وحدة أو استيراد كشف الوحدات عبر CSV." : "Start by adding your first unit or importing units from CSV."}
              </p>
            </div>
            <div className="mt-2 flex gap-2">
              <AddUnitDialog
                organizationId={organization.id}
                resortId={resort.id}
                buildings={buildings ?? []}
                zones={zones ?? []}
                locale={locale}
              />
              <Link
                href={`/import?kind=units&resort=${resort.id}`}
                locale={locale}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <FileUp className="size-3.5" />
                {isAr ? "استيراد ملف CSV" : "Import CSV File"}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <UnitsFilters
              locale={locale}
              resortId={resort.id}
              resortName={resort.name}
              organizationName={organization.name}
              currency={currency}
              totalUnits={totalUnits}
              occupancyRate={occupancyRate}
              totalArrears={totalArrears}
              collectedThisMonth={collectedThisMonth}
              buildings={buildings ?? []}
              zones={zones ?? []}
            />
            <UnitsTable units={units ?? []} locale={locale} currency={currency} />
            <UnitsPagination page={page} totalPages={totalPages} totalCount={count ?? 0} locale={locale} />
          </>
        )}
      </main>

      <UnitDrawer data={drawerData} locale={locale} currency={currency} />
    </PropertyNavProvider>
  );
}
