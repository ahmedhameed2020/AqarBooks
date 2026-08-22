import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { SystemHealthClient } from "./system-client";

export default async function SystemHealthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();

  const [{ count: tenantCount }, { count: auditLogCount }] = await Promise.all([
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.from("platform_audit_logs").select("*", { count: "exact", head: true }),
  ]);

  return (
    <SystemHealthClient
      locale={locale}
      tenantCount={tenantCount ?? 0}
      auditLogCount={auditLogCount ?? 0}
    />
  );
}
