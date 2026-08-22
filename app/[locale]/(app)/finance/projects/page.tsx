import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ProjectsClient, type ProjectRow } from "./projects-client";
import { type Option } from "./project-forms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "المشاريع والأعمال تحت التنفيذ | AqarBooks" : "Projects & WIP | AqarBooks",
    description: isAr
      ? "رسملة تكاليف المشاريع تحت التنفيذ وتحريرها إلى تكلفة المبيعات عند البيع."
      : "Capitalise project costs into work in progress and release them to cost of sales on sale.",
  };
}

export default async function ProjectsPage({
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

  const canManage = await hasPermission(organization.id, "finance.accounts.manage");

  const supabase = await createClient();
  const [{ data: projectsRaw }, { data: accounts }, { data: properties }] = await Promise.all([
    supabase.rpc("list_projects", { p_organization_id: organization.id }),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET", "LIABILITY", "EXPENSE"])
      .order("code"),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name"),
  ]);

  const projects = (projectsRaw ?? []) as unknown as ProjectRow[];
  const currency = organization.default_currency ?? "EGP";

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;
  const assetAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: label(a) }));
  const expenseAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: label(a) }));
  const creditAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET" || a.category === "LIABILITY")
    .map((a) => ({ id: a.id, label: label(a) }));
  const propertyOptions: Option[] = (properties ?? []).map((p) => ({ id: p.id, label: p.name }));

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 text-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "المشاريع والأعمال تحت التنفيذ (WIP)" : "Projects & Work in Progress"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {isAr ? "رسملة وتكاليف" : "WIP Accounting"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? "إدارة موازنات المشاريع الإنشائية، رسملة تكاليف التطوير، وتحريرها إلى تكلفة المبيعات فور تسليم الوحدات."
              : "Project budget tracking, WIP construction cost capitalisation, and release to cost of sales upon delivery."}
          </p>
        </div>
      </div>

      {/* Main Interactive Client Table & KPIs */}
      <ProjectsClient
        projects={projects}
        assetAccounts={assetAccounts}
        expenseAccounts={expenseAccounts}
        creditAccounts={creditAccounts}
        propertyOptions={propertyOptions}
        canManage={canManage}
        locale={locale}
        currency={currency}
        organizationName={organization.name}
      />
    </div>
  );
}
