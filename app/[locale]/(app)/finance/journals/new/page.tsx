import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { JournalEntryForm } from "./journal-entry-form";
import { FileText, ArrowRight, ArrowLeft } from "lucide-react";

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
    title: isAr ? "إنشاء قيد يومية جديد | AqarBooks" : "New Journal Entry | AqarBooks",
    description: isAr
      ? "إنشاء وتسجيل قيد يومية محاسبي يدوي في دفتر الأستاذ العام."
      : "Compose and record manual double-entry journal transactions.",
  };
}

export default async function NewJournalEntryPage({
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
  const [{ data: accounts }, { data: periods }, { data: orgData }] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date"),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link
          href="/finance/journals"
          locale={locale as Locale}
          className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 mb-2"
        >
          {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
          <span>{isAr ? "العودة إلى سجل القيود اليومية" : "Back to Journal Entries"}</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm">
            <FileText className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-950 dark:text-white">
              {isAr ? "إنشاء قيد يومية محاسبي جديد" : "New Journal Entry"}
            </h1>
            <p className="text-xs text-slate-500">
              {isAr
                ? "تسجيل حركة محاسبية مزدوجة (مدين / دائن) مع التحقق الفوري من التوازن."
                : "Record double-entry transactions with live balance validation."}
            </p>
          </div>
        </div>
      </div>

      {!periods?.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {isAr
            ? "تنبيه: لا توجد فترة مالية مفتوحة حالياً. يرجى فتح فترة مالية من إدارة السنوات المالية قبل ترحيل القيود."
            : "Warning: No open fiscal period. Open one from Fiscal Periods management before posting entries."}
        </div>
      )}

      <JournalEntryForm
        organizationId={organization.id}
        accounts={accounts ?? []}
        periods={periods ?? []}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
