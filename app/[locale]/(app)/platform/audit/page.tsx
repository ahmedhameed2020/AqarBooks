import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuditClient, type AuditLogItem } from "./audit-client";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("platform_audit_logs")
    .select("id, action, entity_type, entity_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  return <AuditClient entries={(entries ?? []) as AuditLogItem[]} locale={locale} />;
}
