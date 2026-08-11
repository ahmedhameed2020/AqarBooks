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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "الملف التعريفي" : "Organization profile"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "معرّف: " : "Slug: "}
          {organization.slug}
        </p>
      </div>
      <ProfileForm
        organizationId={organization.id}
        name={organization.name}
        defaultCurrency={organization.default_currency}
        locale={locale}
        readOnly={!canManage}
      />
    </div>
  );
}
