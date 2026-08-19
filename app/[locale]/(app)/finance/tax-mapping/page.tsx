import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  Scale,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  FileCheck2,
  Percent,
} from "lucide-react";
import { TaxMappingClient, type MappingItem } from "./tax-mapping-client";
import type { NatureOption } from "./tax-mapping-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "التصنيف والربط الضريبي للإيرادات — عقار بوكس"
      : "Revenue Tax Classification & Mapping — AqarBooks",
    description: isAr
      ? "ربط بنود وأنواع المطالبات المالية بتصنيفات مصلحة الضرائب وتحديد خضوعها للقيمة المضافة أو الإعفاء."
      : "Map due types to statutory revenue natures and determine VAT treatment.",
  };
}

export default async function TaxMappingPage({
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

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.tax_mapping.manage"),
    hasPermission(organization.id, "finance.tax_mapping.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "التصنيف الضريبي للإيرادات" : "Revenue Tax Classification"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية الاطلاع على ربط أنواع المستحقات بطبيعة الإيراد."
            : "You don't have permission to view due type tax classification."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: rowsData }, { data: naturesData }] = await Promise.all([
    supabase.rpc("list_due_type_tax_mappings", {
      p_organization_id: organization.id,
    }),
    supabase
      .from("revenue_natures")
      .select("code, name_ar, name_en, is_derived, sort_order")
      .order("sort_order"),
  ]);

  const rows = (rowsData ?? []) as unknown as MappingItem[];
  const natures = (naturesData ?? []) as Array<{
    code: string;
    name_ar: string;
    name_en: string;
    is_derived: boolean;
  }>;

  const options: NatureOption[] = natures.map((n) => ({
    code: n.code,
    label: isAr ? n.name_ar : n.name_en,
    isDerived: n.is_derived,
  }));

  const totalCount = rows.length;
  const approvedCount = rows.filter((r) => r.status === "APPROVED").length;
  const pendingCount = totalCount - approvedCount;
  const complianceRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Scale className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "التصنيف والربط الضريبي للإيرادات" : "Revenue Tax Classification & Mapping"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "ربط أنواع المستحقات والمطالبات بطبيعة الإيراد لتحديد المعالجة الضريبية (14% أو إعفاء 0%)."
                  : "Map due types to statutory revenue natures and govern VAT treatments across all billing."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE STATUTORY COMPLIANCE KPIS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Due Types */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "إجمالي بنود المطالبات" : "Total Due Types"}
            </span>
            <div className="rounded-xl p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Layers className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {totalCount}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{isAr ? "بند مسجل" : "types"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "معرفة بالدليل المحاسبي" : "Registered billing types"}</span>
          </div>
        </div>

        {/* KPI 2: Approved Mappings */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "المعتمدة والموثقة قانونياً" : "Approved & Stamped"}
            </span>
            <div className="rounded-xl p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedCount}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{isAr ? "بند معتمد" : "approved"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold">
            <span>{isAr ? "جاهزة للترحيل الضريبي المباشر" : "Ready for tax posting"}</span>
          </div>
        </div>

        {/* KPI 3: Pending Review */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "بانتظار المراجعة والاعتماد" : "Review Required"}
            </span>
            <div className="rounded-xl p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400">
              {pendingCount}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{isAr ? "بند معلق" : "pending"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{pendingCount > 0 ? (isAr ? "يمنع الترحيل الضريبي حتى الاعتماد" : "Blocks tax posting until approved") : (isAr ? "لا توجد بنود معلقة" : "All approved")}</span>
          </div>
        </div>

        {/* KPI 4: Compliance Readiness Rate */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "نسبة الجاهزية الضريبية" : "Compliance Readiness"}
            </span>
            <div className="rounded-xl p-2 bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {complianceRate}%
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "اكتمال الربط بالمعايير القانونية" : "Statutory mapping coverage"}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STATUTORY GUIDANCE BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-900/50 dark:bg-purple-950/40 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
            <Scale className="size-4" />
          </div>
          <div className="space-y-1 text-xs">
            <h3 className="font-black text-slate-900 dark:text-white">
              {isAr
                ? "قواعد التصنيف الضريبي والامتثال القانوني"
                : "Statutory Tax Classification Principles"}
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {isAr
                ? "لا يُشتق التصنيف الضريبي آلياً من اسم المستحق؛ الربط والتصنيف يجب أن يكون مقصوداً ومعتمداً. أي نوع مستحق غير معتمد يمنع ترحيل الضريبة آلياً لضمان عدم إعفاء أو إخضاع أي إيراد بالخطأ."
                : "No tax treatment is ever inferred from a due type name. Mapping must be deliberate and approved. Unapproved types block tax posting to prevent accidental exemption or wrongful taxation."}
            </p>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN TAX MAPPINGS CLIENT
          ────────────────────────────────────────────────────────────────────────── */}
      <TaxMappingClient
        mappings={rows}
        natures={options}
        canManage={canManage}
        locale={locale}
      />
    </div>
  );
}
