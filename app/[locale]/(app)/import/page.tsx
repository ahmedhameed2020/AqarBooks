import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { Locale } from "@/i18n/routing";
import { ImportWizard } from "./import-wizard";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "المستورد الذكي ومعالجة البيانات بالذكاء الاصطناعي — عقار بوكس"
      : "AI Smart Real Estate Data Importer — AqarBooks",
    description: isAr
      ? "استيراد ومعالجة ملفات الوحدات والعقارات والملاك تلقائياً بالمطابقة الدلالية والتنظيف الذكي."
      : "Import and process units, real estate assets, and member records with AI semantic mapping and data cleaning.",
  };
}

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ resort?: string }>;
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

  const denied = await denyIfMissingPermission(organization.id, "property.units.manage", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: resorts } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  const selectedResortId = sp.resort ?? resorts?.[0]?.id;
  const [buildingsResult, zonesResult, membersResult] = selectedResortId
    ? await Promise.all([
        supabase
          .from("buildings")
          .select("id, code, name_ar, name_en")
          .eq("property_id", selectedResortId)
          .order("code", { ascending: true }),
        supabase
          .from("zones")
          .select("id, name_ar, name_en")
          .eq("property_id", selectedResortId)
          .order("name_ar", { ascending: true }),
        supabase
          .from("members")
          .select("id, full_name, email, phone")
          .eq("organization_id", organization.id)
          .order("full_name", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <main className="space-y-6">
      <ImportWizard
        locale={locale}
        organizationId={organization.id}
        resorts={resorts ?? []}
        resortId={selectedResortId ?? undefined}
        buildings={buildingsResult.data ?? []}
        zones={(zonesResult.data as any) ?? []}
        members={membersResult.data ?? []}
      />
    </main>
  );
}
