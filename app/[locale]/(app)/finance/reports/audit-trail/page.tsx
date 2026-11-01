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
  const canAudit = await hasPermission(organization.id, "finance.audit.read");

  // Two sources, each readable only by the people its own policy allows:
  //  * financial_audit_logs  - the hash-chained financial events (opening balances, dues, reversals):
  //                            finance.audit.read OR finance.reports.read
  //  * platform_audit_logs   - administrative events of this organization (roles, users, periods...):
  //                            finance.audit.read only
  const [financial, platform] = await Promise.all([
    supabase
      .from("financial_audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, metadata, occurred_at")
      .eq("organization_id", organization.id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    canAudit
      ? supabase
          .from("platform_audit_logs")
          .select("id, actor_id, action, entity_type, entity_id, reason, safe_change_summary, created_at")
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A failed read must not look like "no events": say so instead of rendering an empty table.
  if (financial.error || platform.error) {
    return (
      <div role="alert" data-testid="audit-error" className="p-8 text-center space-y-2">
        <AlertCircle className="mx-auto size-8 text-rose-600" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? "تعذّر تحميل سجل التدقيق" : "The audit trail could not be loaded"}
        </p>
        <p className="text-xs text-slate-500">{isAr ? "لم يُعرض أي سجل." : "No records are shown."}</p>
      </div>
    );
  }

  const actorIds = [
    ...new Set([
      ...(financial.data ?? []).map((l) => l.actor_user_id),
      ...(platform.data ?? []).map((l) => l.actor_id),
    ].filter((v): v is string => Boolean(v))),
  ];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: actors } = await supabase.rpc("get_audit_actor_names", {
      p_organization_id: organization.id,
      p_actor_ids: actorIds,
    });
    for (const a of actors ?? []) if (a.full_name) names.set(a.id, a.full_name);
  }
  const actorName = (id: string | null) =>
    id ? names.get(id) ?? (isAr ? "مستخدم آخر" : "Another user") : isAr ? "النظام الآلي (System)" : "System";

  // Financial-chain actions are UPPER_SNAKE_CASE (PAYMENT_REVERSED); the report's filters and badges match
  // dotted lower-case verbs (payment.reversed), so normalise them.
  const normaliseAction = (a: string) => a.toLowerCase().replace(/_([a-z]+)$/, ".$1").replace(/_/g, ".");
  const reasonOf = (meta: unknown) => {
    const m = (meta ?? {}) as { reason?: string };
    return m.reason?.trim() || "";
  };

  const items: AuditTrailItem[] = [
    ...(financial.data ?? []).map((log) => ({
      id: `fin-${log.id}`,
      action: normaliseAction(log.action),
      entityType: String(log.entity_type).toLowerCase(),
      entityId: log.entity_id || "—",
      actorName: actorName(log.actor_user_id),
      reason: reasonOf(log.metadata) || (isAr ? "حدث مالي مسجّل في السلسلة المحمية" : "Financial event on the protected chain"),
      timestamp: log.occurred_at ? log.occurred_at.replace("T", " ").slice(0, 19) : "—",
    })),
    ...(platform.data ?? []).map((log) => ({
      id: `plat-${log.id}`,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id || "—",
      actorName: actorName(log.actor_id),
      reason: log.reason || (isAr ? "إجراء إداري معتمد" : "Standard operational update"),
      timestamp: log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "—",
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <AuditTrailClient
      items={items}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
