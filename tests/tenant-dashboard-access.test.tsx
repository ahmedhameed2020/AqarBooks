import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1.2 — the tenant dashboard must not query, nor render figures for, finance data the
 * viewer cannot read, and a failed query must read as an error, never as zero.
 *
 * The real server component is rendered with a recording Supabase stand-in and a permission
 * set per case; child widgets are stubbed to plain text so the assertions are about which
 * sections exist and which queries ran.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, locale: _l, ...p }: { children?: ReactNode; locale?: string } & Record<string, unknown>) => <a {...p}>{children}</a>,
}));
vi.mock("@/app/[locale]/(app)/dashboard/kpi-card", () => ({
  KpiCard: ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => <div data-kpi={label}>{value}{hint ? `|${hint}` : ""}</div>,
  MiniStat: ({ label, value }: { label: string; value: string }) => <div data-mini={label}>{value}</div>,
}));
vi.mock("@/app/[locale]/(app)/dashboard/count-up", () => ({ CountUp: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/app/[locale]/(app)/dashboard/charts", () => ({
  RevenueExpenseTrend: () => <div data-widget="trend" />,
  AgingChart: () => <div data-widget="aging" />,
  CollectionTargetGauge: ({ target }: { target: number }) => <div data-widget="gauge" data-target={target} />,
}));
vi.mock("@/app/[locale]/(app)/dashboard/insights-card", () => ({
  InsightsCard: ({ target }: { target: number }) => <div data-widget="insights" data-target={target} />,
}));
vi.mock("@/components/ai/executive-financial-insights-card", () => ({ ExecutiveFinancialInsightsCard: () => <div data-widget="ai-insights" /> }));
vi.mock("@/app/[locale]/(app)/dashboard/dashboard-actions", () => ({ DashboardActions: () => <div data-widget="actions" /> }));
vi.mock("@/app/[locale]/(app)/dashboard/occupancy-widget", () => ({ OccupancyWidget: (p: { unitsCount: number; ownedCount: number }) => <div data-widget="occupancy">{p.unitsCount}/{p.ownedCount}</div> }));
vi.mock("@/app/[locale]/(app)/dashboard/tenant-dashboard-tabs", () => ({
  TenantDashboardTabs: (p: { overviewContent: ReactNode; tasksContent: ReactNode; operationsContent: ReactNode }) => (
    <div>{p.overviewContent}{p.tasksContent}{p.operationsContent}</div>
  ),
}));

type Result = { data?: unknown; count?: number | null; error?: { message: string } | null };
type TrialBalanceArgs = { p_organization_id: string; p_start_date: string; p_end_date: string };
let granted = new Set<string>();
let calls: string[] = [];
let rpcCalls: { fn: string; args: TrialBalanceArgs }[] = [];
let tableResults: Record<string, Result> = {};
let rpcResult: Result = { data: [], error: null };

function builder(table: string) {
  const result = () => ({ data: null, count: null, error: null, ...(tableResults[table] ?? {}) });
  const b: Record<string, unknown> = {};
  for (const m of ["select", "in", "is", "order", "limit"]) b[m] = () => b;
  for (const m of ["eq", "lte", "gte"]) {
    b[m] = (column: string, value: string) => {
      calls.push(`${m}:${table}:${column}:${value}`);
      return b;
    };
  }
  b.maybeSingle = async () => result();
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => { calls.push(`from:${table}`); return builder(table); },
    rpc: async (fn: string, args: TrialBalanceArgs) => {
      calls.push(`rpc:${fn}`);
      rpcCalls.push({ fn, args });
      return { data: null, count: null, error: null, ...rpcResult };
    },
  }),
}));
vi.mock("@/lib/auth/nav-permissions", () => ({
  buildPermissionChecker: async () => (key?: string) => (key ? granted.has(key) : true),
}));

const { TenantDashboard } = await import("@/app/[locale]/(app)/dashboard/tenant-dashboard");

const org = { id: "org-1", name: "Org", default_currency: "EGP" };
const render = async (locale: "en" | "ar" = "en") => renderToStaticMarkup(await TenantDashboard({ organization: org, locale }));
const queried = (name: string) => calls.includes(name);

const PERIOD = { id: "p1", name: "2026", start_date: "2026-01-01", end_date: "2026-12-31" };
const TB = [
  { category: "REVENUE", balance: 1234 },
  { category: "EXPENSE", balance: 234 },
];

beforeEach(() => {
  granted = new Set();
  calls = [];
  rpcCalls = [];
  rpcResult = { data: TB, error: null };
  tableResults = {
    fiscal_periods: { data: PERIOD },
    dues: { data: [{ id: "d1", amount: 900, due_date: "2020-01-01", status: "ISSUED", unit_id: "u" }] },
    effective_payment_allocations: { data: [] },
    payments: { data: [{ id: "pay1", receipt_number: "R-1", amount: 50, method: "CASH", payment_date: "2020-01-01", status: "POSTED" }] },
    cashier_sessions: { count: 3 },
    journal_entries: { count: 4 },
    cheques: { count: 5 },
    units_with_financials: { count: 148 },
    members: { count: 112 },
  };
});

describe("viewer without finance permissions (gate operator / technician)", () => {
  it("runs no finance query at all and never calls the trial balance", async () => {
    const html = await render();
    expect(queried("rpc:get_trial_balance")).toBe(false);
    for (const t of ["dues", "payments", "effective_payment_allocations", "cashier_sessions", "journal_entries", "cheques", "fiscal_periods", "units_with_financials", "members"]) {
      expect(queried(`from:${t}`), t).toBe(false);
    }
    expect(html).toContain('data-state="denied"');
  });

  it("renders no financial figure that could be mistaken for a real zero", async () => {
    const html = await render();
    // Figures are rendered as data-kpi / data-mini elements; a denied section shows a panel instead.
    expect(html).not.toMatch(/data-(kpi|mini)=/);
    expect(html).not.toContain("No collections recorded yet");
    expect(html).not.toContain("No overdue dues");
    expect(html).not.toContain('data-widget="trend"');
    expect(html).not.toContain('data-widget="aging"');
    expect(html).not.toContain("No open fiscal period"); // a period banner is for people who can act on periods
  });
});

describe("accountant-like viewer (reports, dues, payments, entries)", () => {
  beforeEach(() => {
    granted = new Set(["finance.reports.read", "finance.dues.read", "finance.payments.read", "finance.entries.create"]);
  });
  it("queries and shows exactly what is permitted", async () => {
    const html = await render();
    expect(calls.filter((c) => c === "rpc:get_trial_balance")).toHaveLength(7); // the open period + 6 months
    expect(html).toContain('data-kpi="Total Revenue — accrual (EGP)"');
    expect(html).toContain('data-kpi="Total Expenses — accrual (EGP)"');
    expect(html).toContain("1234");
    expect(html).toContain('data-kpi="Outstanding Receivables"');
    expect(html).toContain('data-mini="Unposted entries">4');
    // finance.reports.read also opens the cheque register (cheques_select_permission); cashier sessions need cashier.* keys
    expect(queried("from:cheques")).toBe(true);
    expect(html).toContain('data-mini="Pending cheques">5');
    expect(queried("from:cashier_sessions")).toBe(false);
    expect(html).not.toContain('data-mini="Open sessions"');
    expect(queried("from:units_with_financials")).toBe(false);
  });

  it("labels current-period expenses as accrual in Arabic", async () => {
    const html = await render("ar");
    expect(html).toContain('data-kpi="إجمالي المصروفات الاستحقاقية (EGP)"');
  });

  it("limits the current-period KPI to an open period containing today", async () => {
    await render();
    const today = new Date().toISOString().slice(0, 10);
    expect(calls).toContain(`lte:fiscal_periods:start_date:${today}`);
    expect(calls).toContain(`gte:fiscal_periods:end_date:${today}`);
  });

  it("uses UTC date-only month boundaries across a local new year", async () => {
    const previousTimeZone = process.env.TZ;
    try {
      process.env.TZ = "Asia/Riyadh";
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-31T21:30:00.000Z")); // 2026-01-01 00:30 in Riyadh

      await render();

      const monthlyRanges = rpcCalls
        .filter((call) => call.fn === "get_trial_balance")
        .slice(-6)
        .map(({ args }) => [args.p_start_date, args.p_end_date]);
      expect(monthlyRanges).toEqual([
        ["2025-07-01", "2025-07-31"],
        ["2025-08-01", "2025-08-31"],
        ["2025-09-01", "2025-09-30"],
        ["2025-10-01", "2025-10-31"],
        ["2025-11-01", "2025-11-30"],
        ["2025-12-01", "2025-12-31"],
      ]);
    } finally {
      vi.useRealTimers();
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it("explains when no open period contains today instead of claiming none exists", async () => {
    tableResults.fiscal_periods = { data: null, error: null };
    const html = await render();
    expect(html).toContain("No open period contains today");
    expect(html).not.toContain("No open fiscal period. Please activate a period");
  });

  it("labels the trend as accrual rather than cash flow or budget", async () => {
    const html = await render();
    expect(html).toContain("Monthly accrual revenue and expense comparison");
    expect(html).not.toContain("Monthly budget and cashflow comparison");
  });

  it("uses one collection target for the gauge and insights", async () => {
    const html = await render();
    expect(html).toContain('data-widget="gauge" data-target="90"');
    expect(html).toContain('data-widget="insights" data-target="90"');
    expect(html).not.toContain("Monthly Goal");
  });
});

describe("partial permissions never produce partial (wrong) figures", () => {
  it("dues.read without payments.read does not show receivables: outstanding needs both", async () => {
    granted = new Set(["finance.dues.read"]);
    const html = await render();
    expect(queried("from:dues")).toBe(false);
    expect(html).not.toContain('data-kpi="Outstanding Receivables"');
    expect(html).toContain("Receivables: not available for your permissions");
  });
  it("payments.read alone shows collections but not receivables", async () => {
    granted = new Set(["finance.payments.read"]);
    const html = await render();
    expect(html).toContain('data-mini="Collected today"');
    expect(html).not.toContain('data-kpi="Outstanding Receivables"');
  });
});

describe("failures are errors, not zeros", () => {
  it("a trial-balance failure for a permitted viewer renders an error panel, not 0", async () => {
    granted = new Set(["finance.reports.read"]);
    rpcResult = { data: null, error: { message: "boom" } };
    const html = await render();
    expect(html).toContain('data-state="error"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('data-kpi="Total Revenue — accrual (EGP)"');
    expect(html).not.toContain('data-widget="trend"');
  });
  it("a failed dues query for a permitted viewer is an error, not 'No overdue dues'", async () => {
    granted = new Set(["finance.dues.read", "finance.payments.read"]);
    tableResults.dues = { data: null, error: { message: "rls" } };
    const html = await render();
    expect(html).toContain('data-state="error"');
    expect(html).not.toContain("No overdue dues");
    expect(html).not.toContain('data-kpi="Outstanding Receivables"');
  });
  it("a failed effective-allocation query never renders receivables as successful figures", async () => {
    granted = new Set(["finance.dues.read", "finance.payments.read"]);
    tableResults.effective_payment_allocations = { data: null, error: { message: "rls" } };
    const html = await render();
    expect(queried("from:effective_payment_allocations")).toBe(true);
    expect(queried("from:payment_allocations")).toBe(false);
    expect(html).toContain('data-state="error"');
    expect(html).not.toContain('data-kpi="Outstanding Receivables"');
    expect(html).not.toContain('data-mini="Overdue dues"');
    expect(html).not.toContain("No overdue dues");
  });
  it("distinguishes a fiscal-period read failure from no open period in English", async () => {
    granted = new Set(["finance.reports.read"]);
    tableResults.fiscal_periods = { data: null, error: { message: "boom" } };
    const html = await render();
    expect(html).toContain("Unable to load fiscal period");
    expect(html).not.toContain("No open period");
    expect(html).not.toContain("No open fiscal period");
  });
  it("distinguishes a fiscal-period read failure from no open period in Arabic", async () => {
    granted = new Set(["finance.reports.read"]);
    tableResults.fiscal_periods = { data: null, error: { message: "boom" } };
    const html = await render("ar");
    expect(html).toContain("تعذر تحميل الفترة المالية");
    expect(html).not.toContain("لا توجد فترة");
  });
});

describe("units and members use real counts, not simulated shares", () => {
  it("a viewer with property access gets the widget built from the queried active-unit counts", async () => {
    granted = new Set(["property.units.view"]);
    tableResults.units_with_financials = { count: 148 };
    tableResults.members = { count: 112 };
    const html = await render();
    expect(queried("from:units_with_financials")).toBe(true);
    expect(html).toContain('data-widget="occupancy">148/148');
  });
});
