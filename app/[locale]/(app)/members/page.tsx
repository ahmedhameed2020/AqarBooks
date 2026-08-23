import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Users, AlertCircle, Wallet, TrendingUp, UserPlus, Sparkles, Download, FileSpreadsheet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
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
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;
const SORT_COLUMN: Record<string, string> = { name: "full_name", units: "units_count", balance: "total_balance" };
const DUE_TYPE_FALLBACK = "—";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "دليل الملاك والمستأجرين والأعضاء — عقار بوكس"
      : "Members, Owners & Tenants Directory — AqarBooks",
    description: isAr
      ? "إدارة سجلات الملاك والمستأجرين، ملكيات الوحدات، أرصدة الحسابات، والمطالبات المالية."
      : "Manage owners, tenants, unit ownerships, financial balances, and collection statements.",
  };
}

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
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center py-20">
        <p className="max-w-md text-sm text-muted-foreground">
          {isAr ? "حسابك غير مرتبط بأي منظمة بعد." : "Your account isn't linked to an organization yet."}
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const currency = organization.default_currency;
  // Gates the archive / delete items in each row's action menu. Read once here
  // rather than per row.
  const canManage = await hasPermission(organization.id, "property.members.manage");
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

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
      <div className="w-full max-w-7xl mx-auto space-y-6 pb-20">
        {/* ──────────────────────────────────────────────────────────────────────────
            1. EXECUTIVE HERO BANNER
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 px-3 py-1 text-xs font-bold gap-1.5 shadow-2xs">
                  <Users className="size-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{isAr ? "دليل الملاك والمستأجرين" : "Members & Tenants CRM"}</span>
                </Badge>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {membersCount ?? 0} {isAr ? "عضو مسجل" : "Registered Members"}
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "سجل الأعضاء والملاك وإدارة الحسابات" : "Members Directory & Account Balances"}
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-medium">
                {isAr
                  ? "متابعة سجلات الملاك، ملكيات الوحدات العقارية، الأرصدة المالية، وإصدار سندات القبض وكشوف الحسابات المباشرة."
                  : "Track owners, real estate units, financial balances, payment receipts, and owner statements."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href="/import" locale={locale}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold h-9 px-3.5 gap-1.5 rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-800"
                >
                  <Sparkles className="size-3.5 text-amber-600" />
                  <span>{isAr ? "استيراد بالذكاء الاصطناعي" : "AI Smart Import"}</span>
                </Button>
              </Link>

              <AddMemberDialog
                organizationId={organization.id}
                members={allMembers ?? []}
                units={allUnits ?? []}
                locale={locale}
              />
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-800">
              <p className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي الأعضاء والملاك" : "Total Members"}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{membersCount ?? 0}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{isAr ? "أعضاء عليهم متأخرات" : "Members with Arrears"}</p>
              <p className="text-xl font-black text-rose-700 dark:text-rose-300 mt-1">{membersWithArrears ?? 0}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{isAr ? `إجمالي المتأخرات (${currency})` : `Total Arrears (${currency})`}</p>
              <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-1 font-mono">
                <Money amount={totalArrears} locale={locale} zeroLabel={isAr ? "0" : "0"} />
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{isAr ? `المحصّل هذا الشهر (${currency})` : `Collected This Month`}</p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                <Money amount={collectedThisMonth} locale={locale} />
              </p>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            2. FILTER STUDIO & DATA TABLE
            ────────────────────────────────────────────────────────────────────────── */}
        {noMembersAtAll ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center dark:border-slate-800 dark:bg-slate-900">
            <div className="size-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <UserPlus className="size-7" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900 dark:text-white">
                {isAr ? "لا يوجد أعضاء مسجلين بعد" : "No members registered yet"}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {isAr ? "ابدأ بإضافة أول عضو أو استيراد ملف العملاء بالذكاء الاصطناعي." : "Add your first member or import via Excel."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <MembersFilters
              locale={locale}
              organizationName={organization.name}
              currency={currency}
            />
            <MembersTable
              members={members ?? []}
              unitCodesByMember={unitCodesByMember}
              locale={locale}
              currency={currency}
              organizationId={organization.id}
              canManage={canManage}
            />
            <MembersPagination page={page} totalPages={totalPages} totalCount={count ?? 0} locale={locale} />
          </div>
        )}
      </div>

      <MemberDrawer data={drawerData} locale={locale} currency={currency} />
    </MembersNavProvider>
  );
}
