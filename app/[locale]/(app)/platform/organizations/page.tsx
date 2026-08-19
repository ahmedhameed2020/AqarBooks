import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { OrganizationsClient, type OrgItem } from "./organizations-client";

export default async function OrganizationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, slug, status, default_currency, created_at")
    .order("created_at", { ascending: false });

  return (
    <OrganizationsClient
      organizations={(organizations ?? []) as OrgItem[]}
      locale={locale}
    />
  );
}
