import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { DunningClient, type Candidate, type Policy } from "./dunning-client";
import { type NoticeRow } from "./dunning-forms";

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
    title: isAr ? "التحصيل وإشعارات التأخير | AqarBooks" : "Collections & Dunning | AqarBooks",
    description: isAr
      ? "مستويات التحصيل، المستحقات المتأخرة المؤهَّلة للإشعار، وسجل الإشعارات المرفوعة."
      : "Dunning stages, overdue debts eligible for a notice, and the register of notices raised.",
  };
}

export default async function DunningPage({
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
    hasPermission(organization.id, "finance.dunning.manage"),
    hasPermission(organization.id, "finance.dunning.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-start">
        <h1 className="text-xl font-bold text-red-900">
          {isAr ? "التحصيل وإشعارات التأخير" : "Collections & Dunning"}
        </h1>
        <p className="text-sm text-red-700">
          {isAr
            ? "لا تملك صلاحية الاطلاع على التحصيل."
            : "You do not have permission to view collections."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: policiesRaw }, { data: candidatesRaw }, { data: noticesRaw }] = await Promise.all([
    supabase
      .from("dunning_policies")
      .select("stage, name_ar, name_en, days_overdue, minimum_amount, is_active")
      .eq("organization_id", organization.id)
      .order("stage"),
    supabase.rpc("list_dunning_candidates", { p_organization_id: organization.id }),
    supabase.rpc("list_dunning_notices", { p_organization_id: organization.id }),
  ]);

  const candidates = (candidatesRaw ?? []) as unknown as Candidate[];
  const notices = (noticesRaw ?? []) as unknown as NoticeRow[];
  const policies = (policiesRaw ?? []) as unknown as Policy[];
  const currency = organization.default_currency ?? "EGP";

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 text-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "التحصيل وإشعارات التأخير" : "Collections & Dunning"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {isAr ? "مراحل تصعيدية" : "Staged Dunning"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? "متابعة المبالغ المتأخرة، إصدار إشعارات المطالبة والتأخير متعددة المراحل، وتسجيل قنوات التسليم والطباعة."
              : "Track overdue debts, trigger multi-stage dunning notices, and record delivery channels & PDF notices."}
          </p>
        </div>
      </div>

      {/* Main Interactive Dunning Client */}
      <DunningClient
        candidates={candidates}
        notices={notices}
        policies={policies}
        canManage={canManage}
        locale={locale}
        currency={currency}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </div>
  );
}
