import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Either the request-scoped client (RLS applies, alerts are filtered to what
 * the reader may see) or the admin client used by the nightly digest, which has
 * no session to run as. The digest compensates by filtering recipients on
 * permissions instead -- see lib/alerts/digest.ts.
 */
export type AlertsClient = SupabaseClient<Database>;

// Operational alerts, derived from the ledger at read time.
//
// Nothing here is stored. Each alert is a question asked of live data, so it
// exists exactly as long as its cause does and cannot drift: deposit the
// cheque and the cheque alert is gone on the next render, with nothing to
// clean up. The screen this replaces held three hand-written alerts naming a
// bank the schema has no column for and a tenant who does not exist, identical
// for every organization and impossible to remove.
//
// Permission handling is deliberately implicit. Every query below runs through
// the caller's own session, so an alert about dues appears only for someone who
// may read dues; anyone else simply gets no rows. Alerts never reveal something
// its reader could not open.

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AlertCategory = "FINANCIAL" | "LEASES" | "CHEQUES" | "PORTAL";

export interface OperationalAlert {
  /**
   * Encodes the FACT, not the alert type, so silencing is scoped to the exact
   * situation. Per-entity alerts carry the row id plus the value that made them
   * fire; if a lease is extended its key changes and the alert legitimately
   * comes back rather than staying buried. Aggregate alerts carry their count,
   * so dismissing "231 overdue" hides that number, not the subject forever.
   */
  key: string;
  category: AlertCategory;
  severity: AlertSeverity;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href: string;
  actionAr: string;
  actionEn: string;
  /** ISO date the alert is anchored to, for sorting by urgency. */
  dueDate: string | null;
}

export interface AlertSettings {
  chequeLeadDays: number;
  leaseLeadDays: number;
  overdueMinDays: number;
  chequesEnabled: boolean;
  leasesEnabled: boolean;
  overdueEnabled: boolean;
  unreachableOwnersEnabled: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  chequeLeadDays: 7,
  leaseLeadDays: 30,
  overdueMinDays: 1,
  chequesEnabled: true,
  leasesEnabled: true,
  overdueEnabled: true,
  unreachableOwnersEnabled: true,
};

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function getAlertSettings(
  organizationId: string,
  client?: AlertsClient,
): Promise<AlertSettings> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("alert_settings")
    .select(
      "cheque_lead_days, lease_lead_days, overdue_min_days, cheques_enabled, leases_enabled, overdue_enabled, unreachable_owners_enabled",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  // A missing row is the normal state for a new organization, and means
  // "defaults" -- not "no alerts".
  if (!data) return DEFAULT_ALERT_SETTINGS;

  return {
    chequeLeadDays: data.cheque_lead_days,
    leaseLeadDays: data.lease_lead_days,
    overdueMinDays: data.overdue_min_days,
    chequesEnabled: data.cheques_enabled,
    leasesEnabled: data.leases_enabled,
    overdueEnabled: data.overdue_enabled,
    unreachableOwnersEnabled: data.unreachable_owners_enabled,
  };
}

/**
 * Every alert this organization currently warrants, already filtered by the
 * caller's dismissals. Ordered most urgent first.
 */
export async function getOperationalAlerts(
  organizationId: string,
  userId: string | null,
  client?: AlertsClient,
): Promise<OperationalAlert[]> {
  const supabase = client ?? (await createClient());
  const settings = await getAlertSettings(organizationId, supabase);
  const today = new Date().toISOString().slice(0, 10);
  const alerts: OperationalAlert[] = [];

  /* ------------------------------------------------------- overdue dues */
  if (settings.overdueEnabled) {
    const cutoff = isoInDays(-settings.overdueMinDays);
    const { data: overdue } = await supabase
      .from("dues")
      .select("amount, due_date")
      .eq("organization_id", organizationId)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .lt("due_date", cutoff);

    const rows = overdue ?? [];
    if (rows.length > 0) {
      const total = rows.reduce((s, d) => s + Number(d.amount), 0);
      const oldest = rows.reduce(
        (min, d) => (d.due_date < min ? d.due_date : min),
        rows[0].due_date as string,
      );
      alerts.push({
        key: `overdue_dues:${rows.length}`,
        category: "FINANCIAL",
        severity: "CRITICAL",
        titleAr: `${rows.length} مطالبة متأخرة السداد`,
        titleEn: `${rows.length} overdue dues`,
        bodyAr: `إجمالي ${fmt(total)} غير محصّل، وأقدم مطالبة مستحقة منذ ${oldest}.`,
        bodyEn: `${fmt(total)} uncollected, the oldest due since ${oldest}.`,
        href: "/finance/reports/aging",
        actionAr: "فتح تقرير أعمار الديون",
        actionEn: "Open aging report",
        dueDate: oldest,
      });
    }
  }

  /* ----------------------------------------------------- cheques due soon */
  if (settings.chequesEnabled) {
    const horizon = isoInDays(settings.chequeLeadDays);
    const { data: cheques } = await supabase
      .from("cheques")
      .select("amount, due_date, direction")
      .eq("organization_id", organizationId)
      .in("status", ["ISSUED", "RECEIVED", "DEPOSITED"])
      .lte("due_date", horizon)
      .order("due_date", { ascending: true });

    const rows = cheques ?? [];
    if (rows.length > 0) {
      const total = rows.reduce((s, c) => s + Number(c.amount), 0);
      const soonest = rows[0].due_date as string;
      alerts.push({
        key: `cheques_due:${rows.length}:${soonest}`,
        category: "CHEQUES",
        severity: soonest <= today ? "CRITICAL" : "WARNING",
        titleAr: `${rows.length} شيك يستحق خلال ${settings.chequeLeadDays} يوم`,
        titleEn: `${rows.length} cheque(s) due within ${settings.chequeLeadDays} days`,
        bodyAr: `بإجمالي ${fmt(total)}، وأقربها في ${soonest}.`,
        bodyEn: `${fmt(total)} in total, the nearest on ${soonest}.`,
        href: "/finance/reports/pdc",
        actionAr: "فتح سجل الشيكات",
        actionEn: "Open cheque register",
        dueDate: soonest,
      });
    }
  }

  /* --------------------------------------------------- leases expiring */
  if (settings.leasesEnabled) {
    const horizon = isoInDays(settings.leaseLeadDays);
    const { data: leases } = await supabase
      .from("unit_leases")
      .select("id, ends_on, rent_amount, unit_id")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .not("ends_on", "is", null)
      .lte("ends_on", horizon)
      .order("ends_on", { ascending: true });

    const rows = leases ?? [];
    // One alert per lease: each is a separate decision to renew or end, and
    // collapsing them into a count would hide which unit needs attention.
    for (const lease of rows) {
      const endsOn = lease.ends_on as string;
      alerts.push({
        key: `lease_expiring:${lease.id}:${endsOn}`,
        category: "LEASES",
        severity: endsOn <= today ? "CRITICAL" : "WARNING",
        titleAr: `عقد إيجار ينتهي في ${endsOn}`,
        titleEn: `Lease ends on ${endsOn}`,
        bodyAr: `قيمة الإيجار ${fmt(Number(lease.rent_amount ?? 0))}. يلزم قرار بالتجديد أو الإنهاء.`,
        bodyEn: `Rent ${fmt(Number(lease.rent_amount ?? 0))}. A renewal or termination decision is needed.`,
        href: `/property/${lease.unit_id}`,
        actionAr: "فتح ملف الوحدة",
        actionEn: "Open unit",
        dueDate: endsOn,
      });
    }
  }

  /* ----------------------------------------------- owners with no contact */
  if (settings.unreachableOwnersEnabled) {
    const { data: unreachable } = await supabase
      .from("members")
      .select("id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .is("email", null)
      .is("phone", null);

    const count = (unreachable ?? []).length;
    if (count > 0) {
      alerts.push({
        key: `unreachable_owners:${count}`,
        category: "PORTAL",
        severity: "INFO",
        titleAr: `${count} مالك بلا وسيلة تواصل`,
        titleEn: `${count} owners with no contact details`,
        bodyAr: "لا يمكن دعوتهم للبوابة ولا إرسال تذكيرات لهم حتى يُسجَّل بريد أو هاتف.",
        bodyEn: "They cannot be invited to the portal or sent reminders until an email or phone is recorded.",
        href: "/members",
        actionAr: "فتح دليل الملاك",
        actionEn: "Open owners",
        dueDate: null,
      });
    }
  }

  /* ------------------------------------------------------- dismissals */
  // userId is null for the scheduled digest: dismissals are a per-person
  // reading state, and applying one person's to a shared email would silence
  // an alert for colleagues who never hid anything.
  let silenced = new Set<string>();
  if (userId) {
    const { data: dismissed } = await supabase
      .from("alert_dismissals")
      .select("alert_key")
      .eq("user_id", userId)
      .eq("organization_id", organizationId);
    silenced = new Set((dismissed ?? []).map((d) => d.alert_key));
  }

  const severityRank: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

  return alerts
    .filter((a) => !silenced.has(a.key))
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    );
}
