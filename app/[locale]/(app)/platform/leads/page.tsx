import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { LeadsClient, type DemoLeadItem } from "./leads-client";

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("demo_leads")
    .select("id, full_name, organization_name, email, phone, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return <LeadsClient leads={(leads ?? []) as DemoLeadItem[]} locale={locale} />;
}
