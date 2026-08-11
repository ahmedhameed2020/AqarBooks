import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Users, AlertCircle, Wallet, TrendingUp, UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "../dashboard/kpi-card";
import { Money } from "@/components/money";
import { AddMemberDialog } from "./add-member-dialog";
import { MembersTable } from "./members-table";
import { MembersFilters } from "./members-filters";
import { MembersPagination } from "./members-pagination";
import { MembersNavProvider } from "./members-nav-context";
import { MemberDrawer, type MemberDrawerData } from "./member-drawer";

const PAGE_SIZE = 50;
const SORT_COLUMN: Record<string, string> = { name: "full_name", units: "units_count", balance: "total_balance" };
const DUE_TYPE_FALLBACK = "—";

async function getDrawerData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  memberId: string,
  isAr: boolean,
): Promise<MemberDrawerData | null> {
  const { data: member } = await supabase
    .from("members_with_financials")
    .select("*")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!member) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: ownerships } = await supabase
    .from("unit_ownerships")
    .select("unit_id, end_date")
    .eq("organization_id", organizationId)
    .eq("member_id", memberId);
  const activeUnitIds = (ownerships ?? []).filter((o) => !o.end_date || o.end_date >= today).map((o) => o.unit_id);

  const { data: unitRows } = activeUnitIds.length
    ? await supabase.from("units_with_financials").select("id, code, balance").in("id", activeUnitIds)
    : { data: [] };
  const units = (unitRows ?? []).sort((a, b) => b.balance - a.balance);

  let dues: MemberDrawerData["dues"] = [];
  if (activeUnitIds.length) {
    const { data: dueRows } = await supabase
      .from("dues")
      .select("id, due_type_id, amount, due_date, status")
      .eq("organization_id", organizationId)
      .in("unit_id", activeUnitIds)
      .order("due_date", { ascending: false })
      .limit(5);
    const dueTypeIds = [...new Set((dueRows ?? []).map((d) => d.due_type_id))];
    const { data: dueTypes } = dueTypeIds.length
      ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
      : { data: [] };
    const typeNameById = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));
    dues = (dueRows ?? []).map((d) => ({
      id: d.id,
      date: d.due_date,
      type: typeNameById.get(d.due_type_id) ?? DUE_TYPE_FALLBACK,
      amount: d.amount,
      status: d.status,
    }));
  }

  const { data: paymentRows } = await supabase
    .from("payments")
    .select("id, amount, method, payment_date")
    .eq("organization_id", organizationId)
    .eq("member_id", memberId)
    .eq("status", "POSTED")
    .order("payment_date", { ascending: false })
    .limit(5);
  const payments = (paymentRows ?? []).map((p) => ({ id: p.id, date: p.payment_date, amount: p.amount, method: p.method }));

  return {
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    phone: member.phone,
    unitsCount: member.units_count,
    totalBalance: member.total_balance,
    units,
    dues,
    payments,
  };
}

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    ownership?: string;
    arrears?: string;
    page?: string;
    sort?: string;
    dir?: string;
    member?: string;
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
  const currency = organization.default_currency;
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  // KPIs are org-wide (all resorts) and always computed from
  // units_with_financials directly, never by summing members_with_financials
  // .total_balance -- a unit with multiple active co-owners would otherwise
  // be double-counted (each co-owner shows the unit's full balance, by the
  // approved phase-3 policy). Matches /property's arrears figure exactly
  // whenever the organization has a single resort.
  const [
    { count: membersCount },
    { count: membersWithArrears },
    { data: unitBalances },
    { data: monthPayments },
    { data: allMembers },
    { data: allUnits },
  ] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase
      .from("members_with_financials")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("has_arrears", true),
    supabase.from("units_with_financials").select("balance").eq("organization_id", organization.id),
    supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organization.id)
      .eq("status", "POSTED")
      .gte("payment_date", monthStart),
    supabase.from("members").select("id, full_name").eq("organization_id", organization.id).order("full_name"),
    supabase
      .from("units_with_financials")
      .select("id, code, building_name_ar, building_name_en")
      .eq("organization_id", organization.id)
      .order("code"),
  ]);

  const totalArrears = (unitBalances ?? []).reduce((s, u) => s + (u.balance > 0 ? u.balance : 0), 0);
  const collectedThisMonth = (monthPayments ?? []).reduce((s, p) => s + p.amount, 0);

  let query = supabase
    .from("members_with_financials")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id);

  if (sp.q) {
    const term = sp.q.replace(/"/g, "");
    query = query.or(`full_name.ilike."%${term}%",phone.ilike."%${term}%",email.ilike."%${term}%"`);
  }
  if (sp.ownership === "owns") query = query.gt("units_count", 0);
  else if (sp.ownership === "none") query = query.eq("units_count", 0);
  if (sp.arrears === "1") query = query.eq("has_arrears", true);

  const sortColumn = (sp.sort && SORT_COLUMN[sp.sort]) || "full_name";
  const ascending = sp.dir !== "desc";
  const { data: members, count } = await query.order(sortColumn, { ascending }).range(from, to);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const memberIds = (members ?? []).map((m) => m.id);
  const { data: ownerships } = memberIds.length
    ? await supabase
        .from("unit_ownerships")
        .select("member_id, unit_id, end_date")
        .eq("organization_id", organization.id)
        .in("member_id", memberIds)
    : { data: [] };
  const unitCodeById = new Map((allUnits ?? []).map((u) => [u.id, u.code]));
  const unitCodesByMember = new Map<string, string[]>();
  for (const o of ownerships ?? []) {
    if (o.end_date && o.end_date < today) continue;
    const code = unitCodeById.get(o.unit_id);
    if (!code) continue;
    const list = unitCodesByMember.get(o.member_id) ?? [];
    list.push(code);
    unitCodesByMember.set(o.member_id, list);
  }

  const drawerData = sp.member ? await getDrawerData(supabase, organization.id, sp.member, isAr) : null;

  const noMembersAtAll = (membersCount ?? 0) === 0;

  return (
    <MembersNavProvider>
      <main className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{isAr ? "الأعضاء" : "Members"}</h1>
            <p className="text-sm text-muted-foreground">
              {isAr ? "أعضاء المنظمة وملكيتهم للوحدات وأرصدتهم." : "Organization members, their unit ownership, and balances."}
            </p>
          </div>
          <AddMemberDialog
            organizationId={organization.id}
            members={allMembers ?? []}
            units={allUnits ?? []}
            locale={locale}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={isAr ? "إجمالي الأعضاء" : "Total members"}
            value={String(membersCount ?? 0)}
            icon={<Users className="size-4.5" />}
          />
          <KpiCard
            label={isAr ? "أعضاء عليهم متأخرات" : "Members with arrears"}
            value={String(membersWithArrears ?? 0)}
            icon={<AlertCircle className="size-4.5" />}
            tone={(membersWithArrears ?? 0) > 0 ? "negative" : undefined}
          />
          <KpiCard
            label={isAr ? `إجمالي المتأخرات (${currency})` : `Total arrears (${currency})`}
            value={<Money amount={totalArrears} locale={locale} tone={totalArrears > 0 ? "negative" : undefined} zeroLabel={isAr ? "لا يوجد" : "None"} />}
            icon={<Wallet className="size-4.5" />}
            tone={totalArrears > 0 ? "negative" : undefined}
          />
          <KpiCard
            label={isAr ? `المحصّل هذا الشهر (${currency})` : `Collected this month (${currency})`}
            value={<Money amount={collectedThisMonth} currency={currency} locale={locale} />}
            icon={<TrendingUp className="size-4.5" />}
            tone="positive"
          />
        </div>

        {noMembersAtAll ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <UserPlus className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{isAr ? "لا يوجد أعضاء بعد" : "No members yet"}</p>
              <p className="text-sm text-muted-foreground">
                {isAr ? "ابدأ بإضافة أول عضو من الأعلى." : "Start by adding your first member above."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <MembersFilters locale={locale} />
            <MembersTable
              members={members ?? []}
              unitCodesByMember={unitCodesByMember}
              locale={locale}
              currency={currency}
            />
            <MembersPagination page={page} totalPages={totalPages} totalCount={count ?? 0} locale={locale} />
          </>
        )}
      </main>

      <MemberDrawer data={drawerData} locale={locale} currency={currency} />
    </MembersNavProvider>
  );
}
