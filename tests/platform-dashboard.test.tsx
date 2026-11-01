import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, locale: _locale, ...props }: { children?: ReactNode; locale?: string } & Record<string, unknown>) => <a {...props}>{children}</a>,
}));
vi.mock("@/app/[locale]/(app)/dashboard/kpi-card", () => ({
  KpiCard: ({ label, value }: { label: string; value: ReactNode }) => <div data-kpi={label}>{value}</div>,
}));

type Result = { data: unknown; error: { message: string } | null };
let results: Record<string, Result>;

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit"]) b[method] = () => b;
  b.then = (resolve: (value: unknown) => unknown) => resolve(results[table]);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => builder(table),
  }),
}));

const { PlatformDashboard } = await import("@/app/[locale]/(app)/dashboard/platform-dashboard");
const render = async () => renderToStaticMarkup(await PlatformDashboard({ locale: "en" }));

describe("platform dashboard read states", () => {
  beforeEach(() => {
    results = {
      organizations: { data: [{ id: "org-1", name: "Org", status: "ACTIVE", created_at: "2026-01-01" }], error: null },
      demo_leads: { data: [], error: null },
      platform_audit_logs: { data: [], error: null },
    };
  });

  it("does not make an unsupported system-health claim", async () => {
    const html = await render();
    expect(html).not.toContain("System Healthy");
    expect(html).toContain("Operational snapshot");
  });

  it("shows read failures instead of zero counts or empty financial-looking states", async () => {
    results.organizations = { data: null, error: { message: "organizations failed" } };
    results.demo_leads = { data: null, error: { message: "leads failed" } };
    results.platform_audit_logs = { data: null, error: { message: "audit failed" } };

    const html = await render();

    expect(html).toContain('data-kpi="Active organizations">—');
    expect(html).toContain('data-kpi="New demo leads">—');
    expect(html).toContain("Could not load organizations");
    expect(html).toContain("Could not load recent audit activity");
    expect(html).not.toContain("No organizations yet");
    expect(html).not.toContain("No audit events recorded yet");
  });
});
