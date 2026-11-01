/**
 * What the tenant dashboard may query and show, decided from the viewer's permissions.
 *
 * The dashboard used to run every finance query for every organization member and print the
 * results. A denied or failed query then rendered as 0, which reads as a real financial result
 * ("no revenue", "no overdue dues"). Each domain below is now either queried and shown, or not
 * queried at all, and a failed query is reported as an error, never as zero.
 *
 * Key sets mirror the row-level-security policies that actually gate the underlying data
 * (supabase/migrations/20261009140000_phase1_2_finance_read_permissions.sql and the existing
 * dues / payments / journal_entries policies), so the UI never asks for what the database
 * will refuse.
 */
export const DASHBOARD_KEYS = {
  /** get_trial_balance RPC and the reports hub */
  reports: ["finance.reports.read"],
  /** dues table (dues_select_permission) */
  dues: ["finance.dues.read"],
  /** payments + payment_allocations (payments_select_permission) */
  payments: ["finance.payments.read"],
  /** journal_entries (journal_entries_select_permission) */
  entries: ["finance.reports.read", "finance.entries.create"],
  /** cashier_sessions (cashier_sessions_select_permission) */
  cashier: ["cashier.transactions.read", "cashier.sessions.open", "cashier.sessions.close", "cashier.reconciliations.approve", "finance.audit.read"],
  /** cheques (cheques_select_permission) */
  cheques: ["banking.accounts.view", "banking.cheques.manage", "finance.reports.read", "finance.payments.read", "cashier.transactions.read", "finance.audit.read"],
  /** fiscal period banner: only people who can act on periods or read reports */
  periods: ["finance.reports.read", "finance.periods.manage"],
  /** unit / member counts */
  property: ["property.units.view", "property.members.view", "property.units.manage", "property.members.manage"],
} as const;

export const ALL_DASHBOARD_KEYS: string[] = [...new Set(Object.values(DASHBOARD_KEYS).flat())];

export type SectionState = "ok" | "denied" | "error";

export type DashboardAccess = {
  reports: boolean;
  /** dues.read: outstanding / overdue / aging / collection rate */
  dues: boolean;
  /** payments.read: collections today/month and the recent receipts */
  payments: boolean;
  entries: boolean;
  cashier: boolean;
  cheques: boolean;
  periods: boolean;
  property: boolean;
};

export function resolveDashboardAccess(has: (key?: string) => boolean): DashboardAccess {
  const any = (keys: readonly string[]) => keys.some((k) => has(k));
  return {
    reports: any(DASHBOARD_KEYS.reports),
    dues: any(DASHBOARD_KEYS.dues),
    payments: any(DASHBOARD_KEYS.payments),
    entries: any(DASHBOARD_KEYS.entries),
    cashier: any(DASHBOARD_KEYS.cashier),
    cheques: any(DASHBOARD_KEYS.cheques),
    periods: any(DASHBOARD_KEYS.periods),
    property: any(DASHBOARD_KEYS.property),
  };
}

/** A section is shown only when allowed AND every query it depends on succeeded. */
export function sectionState(allowed: boolean, results: ReadonlyArray<{ error?: unknown } | null | undefined>): SectionState {
  if (!allowed) return "denied";
  return results.some((r) => r?.error) ? "error" : "ok";
}
