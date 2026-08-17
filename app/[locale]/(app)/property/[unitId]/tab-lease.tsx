import { User, Wallet, Calendar, ShieldCheck } from "lucide-react";
import { Money } from "@/components/money";
import { createClient } from "@/lib/supabase/server";
import { CreateLeaseDialog } from "./create-lease-dialog";
import { ActivateLeaseButton, CancelLeaseButton, EndLeaseButton } from "./lease-action-buttons";

const FREQUENCY_LABEL: Record<string, { ar: string; en: string }> = {
  MONTHLY: { ar: "شهري", en: "Monthly" },
  QUARTERLY: { ar: "ربع سنوي", en: "Quarterly" },
  YEARLY: { ar: "سنوي", en: "Yearly" },
};

const STATUS_LABEL: Record<string, { ar: string; en: string; className: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { ar: "نشط", en: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ENDED: { ar: "منتهٍ", en: "Ended", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  CANCELLED: { ar: "ملغى", en: "Cancelled", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

export async function TabLease({
  organizationId,
  unitId,
  locale,
  currency,
}: {
  organizationId: string;
  unitId: string;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const supabase = await createClient();

  const [{ data: leases }, { data: members }, { data: dueTypes }, { data: accounts }] = await Promise.all([
    supabase
      .from("unit_leases")
      .select("id, tenant_member_id, status, starts_on, ends_on, rent_amount, rent_frequency, security_deposit_amount, billing_recipient, end_reason, created_at")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase.from("members").select("id, full_name").eq("organization_id", organizationId).order("full_name"),
    supabase.from("due_types").select("id, name_ar, name_en").eq("organization_id", organizationId),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organizationId)
      .eq("is_group", false)
      .eq("category", "ASSET"),
  ]);

  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const activeLease = (leases ?? []).find((l) => l.status === "ACTIVE");
  const draftLeases = (leases ?? []).filter((l) => l.status === "DRAFT");
  const historyLeases = (leases ?? []).filter((l) => l.status === "ENDED" || l.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{isAr ? "الإيجار والإشغال" : "Lease & occupancy"}</h2>
        <CreateLeaseDialog
          organizationId={organizationId}
          unitId={unitId}
          members={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
          dueTypes={(dueTypes ?? []).map((d) => ({ id: d.id, label: isAr ? d.name_ar : d.name_en }))}
          receivableAccounts={(accounts ?? []).map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
          locale={locale}
        />
      </div>

      {activeLease ? (
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  <User className="size-4 text-muted-foreground" />
                  {memberName.get(activeLease.tenant_member_id) ?? "—"}
                </span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_LABEL.ACTIVE.className}`}>
                  {isAr ? STATUS_LABEL.ACTIVE.ar : STATUS_LABEL.ACTIVE.en}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-3.5" />
                  <Money amount={activeLease.rent_amount} currency={currency} locale={locale} />
                  {" / "}
                  {isAr ? FREQUENCY_LABEL[activeLease.rent_frequency]?.ar : FREQUENCY_LABEL[activeLease.rent_frequency]?.en}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {activeLease.starts_on} → {activeLease.ends_on ?? (isAr ? "غير محدد" : "open-ended")}
                </span>
                {activeLease.security_deposit_amount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5" />
                    {isAr ? "وديعة" : "Deposit"}: <Money amount={activeLease.security_deposit_amount} currency={currency} locale={locale} />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr ? "جهة الفوترة" : "Billed to"}:{" "}
                <span className="font-medium text-foreground">
                  {activeLease.billing_recipient === "TENANT" ? (isAr ? "المستأجر" : "Tenant") : (isAr ? "المالك" : "Owner")}
                </span>
              </p>
            </div>
            <EndLeaseButton leaseId={activeLease.id} locale={locale} />
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لا يوجد عقد إيجار نشط لهذه الوحدة" : "No active lease for this unit"}
        </div>
      )}

      {draftLeases.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "مسودات عقود" : "Draft leases"}</h3>
          <ul className="space-y-2">
            {draftLeases.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 p-3 text-sm">
                <div>
                  <p className="font-medium">{memberName.get(l.tenant_member_id) ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    <Money amount={l.rent_amount} currency={currency} locale={locale} />
                    {" · "}
                    {l.starts_on} → {l.ends_on ?? (isAr ? "غير محدد" : "open-ended")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ActivateLeaseButton leaseId={l.id} locale={locale} />
                  <CancelLeaseButton leaseId={l.id} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {historyLeases.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "سجل العقود السابقة" : "Lease history"}</h3>
          <ul className="space-y-2">
            {historyLeases.map((l) => {
              const label = STATUS_LABEL[l.status];
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 p-3 text-sm opacity-80">
                  <div>
                    <p className="font-medium">{memberName.get(l.tenant_member_id) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.starts_on} → {l.ends_on ?? "—"}
                      {l.end_reason ? ` · ${l.end_reason}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${label.className}`}>
                    {isAr ? label.ar : label.en}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
