import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateResortForm } from "./create-resort-form";
import { ResortsTableClient } from "./resorts-table-client";
import {
  Building,
  Globe2,
  ShieldCheck,
} from "lucide-react";

export default async function ResortsPage({
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

  const supabase = await createClient();
  const { data: resorts } = await supabase
    .from("resorts")
    .select("id, name, code, timezone, property_type, address, phone")
    .eq("organization_id", organization.id)
    .order("name");

  const totalEntities = resorts?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 mb-1">
            <span>{isAr ? "الإدارة العقارية" : "Property Asset Management"}</span>
            <span>/</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{isAr ? "الكيانات الخمسة" : "5 Entities"}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {isAr ? "الكيانات والمشاريع العقارية" : "Real Estate Entities & Projects"}
          </h1>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? "إدارة المنتجعات السياحية، الأبراج السكنية، الفلل، المحلات والمراكز التجارية، واتحادات الملاك في مصر ودول الخليج."
              : "Manage resorts, residential towers, private villas, commercial plazas, and HOAs across Egypt & GCC."}
          </p>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-600/20">
            <Building className="size-5.5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{isAr ? "إجمالي الكيانات العقارية" : "Total Entities"}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">{totalEntities}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <Globe2 className="size-5.5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{isAr ? "النطاق الإقليمي" : "Regional Scope"}</p>
            <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{isAr ? "مصر ودول الخليج (GCC)" : "Egypt & GCC Ready"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <ShieldCheck className="size-5.5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{isAr ? "العزل والحماية" : "Tenant Isolation"}</p>
            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">PostgreSQL RLS (100%)</p>
          </div>
        </div>
      </div>

      {/* 3. Interactive Creation Component */}
      <CreateResortForm organizationId={organization.id} locale={locale} />

      {/* 4. Real Estate Entities Data Table with Edit and Delete */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5 flex items-center justify-between dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">
            {isAr ? "سجل الكيانات العقارية المعتمدة" : "Active Real Estate Entities Register"}
          </h3>
          <span className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
            {isAr ? `${totalEntities} كيان مسجل` : `${totalEntities} registered`}
          </span>
        </div>

        <ResortsTableClient resorts={resorts || []} locale={locale} />
      </div>
    </div>
  );
}
