import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { JournalEntryForm } from "./journal-entry-form";

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
  const [{ data: accounts }, { data: periods }] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{isAr ? "قيد جديد" : "New Journal Entry"}</h1>
      {!periods?.length && (
        <p className="text-sm text-destructive">
          {isAr
            ? "لا توجد فترة مالية مفتوحة. افتح فترة من إدارة السنوات المالية أولًا."
            : "No open fiscal period. Open one from Fiscal Periods first."}
        </p>
      )}
      <JournalEntryForm
        organizationId={organization.id}
        accounts={accounts ?? []}
        periods={periods ?? []}
        locale={locale}
      />
    </div>
  );
}
