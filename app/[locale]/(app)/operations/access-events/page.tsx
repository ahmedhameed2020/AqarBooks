import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { listAccessEvidence } from "@/lib/actions/gate-evidence";
import type { Locale } from "@/i18n/routing";
import { AccessEventFilters } from "./access-event-filters";

type RawSearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function AccessEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.access_events.view", locale);
  if (denied) return denied;

  const db = await createClient();
  const { data: moduleEnabled } = await db.rpc("gate_operations_enabled", { p_organization_id: organization.id });
  if (!moduleEnabled) {
    return <div className="rounded-2xl border border-border/70 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "سجل البوابة غير مفعل" : "Access events are not enabled"}</h1></div>;
  }

  const filters = {
    property: first(raw.property), gate: first(raw.gate), decision: first(raw.decision),
    reason: first(raw.reason), direction: first(raw.direction), invitation: first(raw.invitation),
    guest: first(raw.guest), operator: first(raw.operator), from: first(raw.from), to: first(raw.to),
    page: first(raw.page) ?? "1", pageSize: first(raw.pageSize) ?? "50",
  };
  const [evidence, gateResult, propertyResult] = await Promise.all([
    listAccessEvidence(filters),
    db.from("gates").select("id, code, name_ar, name_en").eq("organization_id", organization.id).order("code"),
    db.from("properties").select("id, name").eq("organization_id", organization.id).order("name"),
  ]);
  if (!evidence.ok) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">{isAr ? "مرشحات غير صالحة أو تعذر تحميل السجل." : "Invalid filters or the evidence ledger could not be loaded."}</div>;
  }

  const gates = (gateResult.data ?? []).map((gate) => ({ id: gate.id, label: `${gate.code} · ${isAr ? gate.name_ar : gate.name_en}` }));
  const properties = (propertyResult.data ?? []).map((property) => ({ id: property.id, label: property.name }));

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{isAr ? "سجل أدلة الدخول والخروج" : "Access evidence ledger"}</h1>
        <p className="text-xs font-medium text-slate-500">{isAr ? "قرارات البوابة والتسويات غير القابلة للتعديل، مع تصدير آمن." : "Immutable gate decisions and reconciliations with safe export."}</p>
      </div>

      <AccessEventFilters key={JSON.stringify(filters)} initial={filters} properties={properties} gates={gates} page={evidence.page} pageSize={evidence.pageSize} total={evidence.total} locale={locale as "ar" | "en"} />

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="hidden grid-cols-[.75fr_1fr_.8fr_.7fr_.8fr_.8fr] gap-3 border-b border-border/70 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500 lg:grid dark:bg-slate-900">
          <span>{isAr ? "الوقت" : "Time"}</span><span>{isAr ? "الزائر" : "Visitor"}</span><span>{isAr ? "الموقع" : "Location"}</span><span>{isAr ? "القرار" : "Decision"}</span><span>{isAr ? "السبب" : "Reason"}</span><span>{isAr ? "المشغل" : "Operator"}</span>
        </div>
        {evidence.rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-500">{isAr ? "لا توجد أدلة مطابقة" : "No matching evidence"}</div>
        ) : <div className="divide-y divide-border/70">{evidence.rows.map((event) => {
          const decisionTone = event.decision === "ALLOW" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : event.decision === "DENY" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-indigo-200 bg-indigo-50 text-indigo-700";
          const gateName = event.gateCode ? `${event.gateCode} · ${isAr ? event.gateNameAr : event.gateNameEn}` : "—";
          return (
            <div key={event.id} className="grid gap-3 p-4 lg:grid-cols-[.75fr_1fr_.8fr_.7fr_.8fr_.8fr] lg:items-center">
              <p className="text-xs text-slate-500">{new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</p>
              <div><p className="text-sm font-black text-slate-950 dark:text-white">{event.guestName ?? (isAr ? "زائر غير محدد" : "Unidentified visitor")}</p><p className="text-[11px] text-slate-500">{event.invitationNo ?? "—"} · {event.unitCode ?? "—"}</p></div>
              <div><p className="text-xs font-semibold">{event.propertyName}</p><p className="text-[11px] text-slate-500">{gateName}</p></div>
              <Badge variant="outline" className={`w-fit ${decisionTone}`}>{event.decision} · {event.direction}</Badge>
              <div><p className="font-mono text-[11px] text-slate-500">{event.reasonCode}</p>{event.decision === "RECONCILE" ? <p className="text-[10px] font-bold text-indigo-600">{isAr ? "تسوية إشغال" : "Occupancy reconciliation"}</p> : null}</div>
              <p className="truncate text-xs text-slate-500" title={event.operatorName}>{event.operatorName}</p>
            </div>
          );
        })}</div>}
      </div>
    </div>
  );
}
