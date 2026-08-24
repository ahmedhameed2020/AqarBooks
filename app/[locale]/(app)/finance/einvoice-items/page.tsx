import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  Barcode,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  AlertCircle,
  Tag,
} from "lucide-react";
import {
  EInvoiceItemsClient,
  type CatalogueItemRow,
  type DueTypeLinkRow,
  type EmissionGap,
} from "./einvoice-items-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تكويد وأصناف الفاتورة الإلكترونية — AqarBooks"
      : "E-Invoice Item Coding & Catalogue — AqarBooks",
    description: isAr
      ? "إدارة كتالوج الأصناف الضريبية، أكواد EGS و GS1، وربط بنود المطالبات بالأكواد المعتمدة لدى مصلحة الضرائب."
      : "Manage statutory item catalogue, GS1/EGS authority codes, and due type mappings.",
  };
}

export default async function EInvoiceItemsPage({
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
    hasPermission(organization.id, "finance.einvoice.manage"),
    hasPermission(organization.id, "finance.einvoice.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "أصناف وتكويد الفاتورة الإلكترونية" : "E-Document Items & Coding"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية الاطلاع على كتالوج وتكويد أصناف الفاتورة الإلكترونية."
            : "You don't have permission to view e-invoice items and coding."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: itemsData }, { data: linksData }, { data: gapsData }] = await Promise.all([
    supabase.rpc("list_catalogue_items", { p_organization_id: organization.id }),
    supabase.rpc("list_due_type_catalogue_links", { p_organization_id: organization.id }),
    supabase.rpc("check_einvoice_emission_readiness", { p_organization_id: organization.id }),
  ]);

  const items = (itemsData ?? []) as unknown as CatalogueItemRow[];
  const links = (linksData ?? []) as unknown as DueTypeLinkRow[];
  const gaps = (gapsData ?? []) as unknown as EmissionGap[];

  const totalDueTypes = links.length;
  const codedDueTypes = links.filter((l) => l.catalogue_item_id && l.item_code).length;
  const uncodedDueTypes = totalDueTypes - codedDueTypes;
  const isEmissionReady = gaps.length === 0;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Barcode className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "تكويد وأصناف الفاتورة الإلكترونية" : "E-Invoice Item Coding & Catalogue"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "ربط بنود الاستحقاقات بأكواد مصلحة الضرائب المعتمدة (معيار EGS / GS1) لضمان قبول الفواتير آلياً."
                  : "Catalogue item authority coding (EGS / GS1 standards) ensuring automated invoice acceptance."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE CODING & EMISSION KPIS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Emission Readiness */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "جاهزية إرسال الفواتير" : "Emission Readiness"}
            </span>
            <div className={`rounded-xl p-2 ${isEmissionReady ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"}`}>
              {isEmissionReady ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            {isEmissionReady ? (
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {isAr ? "جاهز 100%" : "Ready 100%"}
              </span>
            ) : (
              <>
                <span className="text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                  {gaps.length}
                </span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  {isAr ? "نواقص" : "Gaps"}
                </span>
              </>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isEmissionReady ? (isAr ? "لا توجد موانع للإصدار" : "No blocking gaps") : (isAr ? "تحتاج استكمال التكويد" : "Fix gaps to emit")}</span>
          </div>
        </div>

        {/* KPI 2: Total Catalogue Items */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "أصناف الكتالوج المعرفة" : "Catalogue Items"}
            </span>
            <div className="rounded-xl p-2 bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <Package className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">
              {items.length}
            </span>
            <span className="text-xs text-slate-500 font-bold">{isAr ? "صنف" : "items"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "مسجلة بكود السلطة" : "With standard codes"}</span>
          </div>
        </div>

        {/* KPI 3: Coded Due Types */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "البنود المكودة والمربوطة" : "Coded & Linked Types"}
            </span>
            <div className="rounded-xl p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Tag className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums text-blue-600 dark:text-blue-400">
              {codedDueTypes}
            </span>
            <span className="text-xs text-slate-500 font-bold">/ {totalDueTypes}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-600 font-bold">
            <span>{isAr ? "جاهزة للطباعة والرفع الإلكتروني" : "Ready for e-invoice export"}</span>
          </div>
        </div>

        {/* KPI 4: Uncoded Types */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "بنود تحتاج تكويد" : "Uncoded / Unlinked"}
            </span>
            <div className="rounded-xl p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tabular-nums ${uncodedDueTypes > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}`}>
              {uncodedDueTypes}
            </span>
            <span className="text-xs text-slate-500 font-bold">{isAr ? "بند" : "types"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{uncodedDueTypes === 0 ? (isAr ? "تم تكويد جميع البنود" : "All coded") : (isAr ? "تظهر معلقة لتفادي الرفض" : "Needs mapping")}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STATUTORY ITEM CODING GUIDANCE BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/40 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Barcode className="size-4" />
          </div>
          <div className="space-y-1 text-xs">
            <h3 className="font-black text-slate-900 dark:text-white">
              {isAr
                ? "اشتراطات مصلحة الضرائب لتكويد أصناف الفاتورة الإلكترونية"
                : "Tax Authority Mandatory Item Coding Standards"}
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {isAr
                ? "تشترط منظومة الفاتورة الإلكترونية وجود كود صنف ضريبي معتمد (EGS أو GS1) لكل سطر في الفاتورة، ولا يُقبل الوصف النصي الحر. يضمن ربط بنود المطالبات بالأصناف هنا قبول الفواتير فور إرسالها دون أي أخطاء رفض من مصلحة الضرائب."
                : "Tax authorities require an official item code (EGS or GS1 standard) for each invoice line item. Pre-mapping due types to catalogue items guarantees seamless validation and prevents rejection."}
            </p>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ITEMS & CODING CLIENT
          ────────────────────────────────────────────────────────────────────────── */}
      <EInvoiceItemsClient
        items={items}
        links={links}
        gaps={gaps}
        organizationId={organization.id}
        canManage={canManage}
        locale={locale}
      />
    </div>
  );
}
