import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import type { Locale } from "@/i18n/routing";
import { ProfileForm } from "./profile-form";

export default async function AdminProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;

  if (!organization) return null; // layout already renders the "no org" state

  const canManage = await hasPermission(organization.id, "tenant.settings.manage");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-black text-slate-950 dark:text-white">
          {isAr ? "إعدادات الكيان والامتثال الضريبي" : "Organization Profile & Tax Identity"}
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          {isAr
            ? "البيانات الأساسية للمنشأة، تحديد دولة الكيان، الربط الضريبي التلقائي، والعملة الافتراضية."
            : "Legal entity information, home country jurisdiction, automatic statutory tax binding, and default currency."}
        </p>
      </div>
      <ProfileForm
        organizationId={organization.id}
        name={organization.name}
        defaultCurrency={organization.default_currency || "EGP"}
        taxJurisdiction={(organization.tax_jurisdiction as any) || "EG"}
        taxId={organization.tax_id || ""}
        address={organization.address || ""}
        phone={organization.phone || ""}
        email={organization.email || ""}
        entityType={organization.entity_type || ""}
        locale={locale}
        readOnly={!canManage}
      />
    </div>
  );
}
