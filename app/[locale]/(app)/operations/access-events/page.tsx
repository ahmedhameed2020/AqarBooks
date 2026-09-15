import { setRequestLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/routing";

type SearchParams = {
  decision?: string;
  direction?: string;
  gate?: string;
  q?: string;
};

type EventRow = {
  id: string;
  property_id: string;
  gate_id: string;
  visitor_invitation_id: string | null;
  unit_id: string | null;
  direction: "ENTRY" | "EXIT";
  decision: "ALLOW" | "DENY";
  reason_code: string;
  guest_name: string | null;
  invitation_no: string | null;
  is_inside_after: boolean | null;
  occurred_at: string;
};

export default async function AccessEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.access_events.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: moduleEnabled } = await supabase.rpc("gate_operations_enabled", {
    p_organization_id: organization.id,
  });

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "سجل البوابة غير مفعل" : "Access events are not enabled"}
        </h1>
      </div>
    );
  }

  let query = supabase
    .from("access_events")
    .select("id, property_id, gate_id, visitor_invitation_id, unit_id, direction, decision, reason_code, guest_name, invitation_no, is_inside_after, occurred_at")
    .eq("organization_id", organization.id)
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (filters.decision === "ALLOW" || filters.decision === "DENY") query = query.eq("decision", filters.decision);
  if (filters.direction === "ENTRY" || filters.direction === "EXIT") query = query.eq("direction", filters.direction);
  if (filters.gate) query = query.eq("gate_id", filters.gate);

  const [{ data: rows, error }, { data: gates }, { data: properties }, { data: units }] = await Promise.all([
    query,
    supabase.from("gates").select("id, name_ar, name_en, code").eq("organization_id", organization.id),
    supabase.from("properties").select("id, name").eq("organization_id", organization.id),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
  ]);

  if (error) console.error("[AccessEventsPage] events query failed:", error.message);

  const q = filters.q?.trim().toLowerCase() ?? "";
  const gateById = new Map((gates ?? []).map((gate) => [gate.id, { name: isAr ? gate.name_ar : gate.name_en, code: gate.code }]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.code]));

  const events = ((rows ?? []) as EventRow[]).filter((event) => {
    if (!q) return true;
    const gate = gateById.get(event.gate_id);
    return [
      event.guest_name ?? "",
      event.invitation_no ?? "",
      gate?.name ?? "",
      gate?.code ?? "",
      propertyById.get(event.property_id) ?? "",
      event.unit_id ? unitById.get(event.unit_id) ?? "" : "",
      event.reason_code,
    ].some((value) => value.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {isAr ? "سجل دخول وخروج الزوار" : "Access Event Ledger"}
        </h1>
        <p className="text-xs font-medium text-slate-500">
          {isAr ? "سجل غير قابل للتعديل لقرارات البوابة." : "Immutable gate decisions for visitor passes."}
        </p>
      </div>

      <form className="grid gap-3 rounded-2xl border border-border/70 bg-card p-3 md:grid-cols-[1fr_.5fr_.5fr_.7fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={filters.q ?? ""} placeholder={isAr ? "بحث بالزائر أو التصريح أو البوابة" : "Search guest, pass, gate"} className="h-10 rounded-xl ps-9" />
        </div>
        <select name="decision" defaultValue={filters.decision ?? ""} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">{isAr ? "كل القرارات" : "All decisions"}</option>
          <option value="ALLOW">{isAr ? "مسموح" : "Allowed"}</option>
          <option value="DENY">{isAr ? "مرفوض" : "Denied"}</option>
        </select>
        <select name="direction" defaultValue={filters.direction ?? ""} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">{isAr ? "كل الاتجاهات" : "All directions"}</option>
          <option value="ENTRY">{isAr ? "دخول" : "Entry"}</option>
          <option value="EXIT">{isAr ? "خروج" : "Exit"}</option>
        </select>
        <select name="gate" defaultValue={filters.gate ?? ""} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">{isAr ? "كل البوابات" : "All gates"}</option>
          {(gates ?? []).map((gate) => (
            <option key={gate.id} value={gate.id}>{isAr ? gate.name_ar : gate.name_en}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">
          {isAr ? "تصفية" : "Filter"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="hidden grid-cols-[.8fr_1fr_.7fr_.7fr_.8fr_.8fr] gap-3 border-b border-border/70 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500 lg:grid">
          <span>{isAr ? "الوقت" : "Time"}</span>
          <span>{isAr ? "الزائر" : "Visitor"}</span>
          <span>{isAr ? "البوابة" : "Gate"}</span>
          <span>{isAr ? "الوحدة" : "Unit"}</span>
          <span>{isAr ? "القرار" : "Decision"}</span>
          <span>{isAr ? "السبب" : "Reason"}</span>
        </div>
        <div className="divide-y divide-border/70">
          {events.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-500">
              {isAr ? "لا توجد أحداث مطابقة" : "No matching access events"}
            </div>
          ) : events.map((event) => {
            const gate = gateById.get(event.gate_id);
            return (
              <div key={event.id} className="grid gap-3 p-4 lg:grid-cols-[.8fr_1fr_.7fr_.7fr_.8fr_.8fr] lg:items-center">
                <p className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString(isAr ? "ar-EG" : "en-US")}</p>
                <div>
                  <p className="text-sm font-black text-slate-950 dark:text-white">{event.guest_name ?? (isAr ? "غير معروف" : "Unknown")}</p>
                  <p className="text-[11px] text-slate-500">{event.invitation_no ?? "—"}</p>
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{gate ? `${gate.name} · ${gate.code}` : "—"}</p>
                <p className="text-xs text-slate-500">{event.unit_id ? unitById.get(event.unit_id) ?? "—" : "—"}</p>
                <Badge variant="outline" className={event.decision === "ALLOW" ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700" : "w-fit border-rose-200 bg-rose-50 text-rose-700"}>
                  {event.decision} · {event.direction}
                </Badge>
                <p className="font-mono text-[11px] text-slate-500">{event.reason_code}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
