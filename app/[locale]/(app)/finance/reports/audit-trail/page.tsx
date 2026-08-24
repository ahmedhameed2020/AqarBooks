import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { AuditTrailClient, type AuditTrailItem } from "./audit-trail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "سجل التدقيق والحركات الملغاة ومكافحة التلاعب — AqarBooks"
      : "Audit Trail & Anti-Fraud Governance Report — AqarBooks",
    description: isAr
      ? "كشف رقابي وحوكمة للتدقيق المالي: تتبع السندات الملغاة، القيود العكسية، وتعديلات الفواتير مع توثيق الأسباب والمستخدمين."
      : "Internal audit and governance report tracking voided transactions, reversals, manual adjustments, and actor logs.",
  };
}

export default async function AuditTrailPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.audit.read"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "سجل التدقيق والرقابة المالية" : "Audit Trail Report"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض سجلات التدقيق والرقابة المالية."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Fetch audit logs
  const { data: auditData } = await supabase
    .from("platform_audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, reason, safe_change_summary, created_at, profiles(full_name)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const items: AuditTrailItem[] = (auditData || []).map((log) => {
    const profile = log.profiles as unknown as { full_name?: string } | null;
    return {
      id: log.id,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id || "—",
      actorName: profile?.full_name || "النظام الآلي (System)",
      reason: log.reason || (isAr ? "إجراء إداري معتمد" : "Standard operational update"),
      timestamp: log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "—",
    };
  });

  return (
    <AuditTrailClient
      items={items}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
