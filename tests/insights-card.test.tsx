import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, locale: _locale, ...props }: { children?: ReactNode; locale?: string } & Record<string, unknown>) => (
    <a {...props}>{children}</a>
  ),
}));

const { InsightsCard } = await import("@/app/[locale]/(app)/dashboard/insights-card");

type InsightsCardProps = Parameters<typeof InsightsCard>[0];

const completeProps: InsightsCardProps = {
  collectionRate: null,
  target: 90,
  overdueCount: 0,
  overdueAmount: 0,
  unpostedCount: 0,
  outstandingCheques: 0,
  surplus: 0,
  currency: "EGP",
  locale: "en",
};

function renderInsights(props: Partial<InsightsCardProps>, locale: "en" | "ar") {
  return renderToStaticMarkup(<InsightsCard {...completeProps} {...props} locale={locale} />);
}

describe("InsightsCard with incomplete follow-up data", () => {
  it("does not give an all-clear in English when journal entries could not be read", () => {
    const html = renderInsights({ unpostedCount: null }, "en");
    expect(html).toContain("Some indicators could not be verified");
    expect(html).not.toContain("Nothing needs attention here");
  });

  it("does not give an all-clear in Arabic when journal entries could not be read", () => {
    const html = renderInsights({ unpostedCount: null }, "ar");
    expect(html).toContain("تعذر التحقق من بعض المؤشرات");
    expect(html).not.toContain("لا توجد عناصر تحتاج متابعة");
  });

  it("does not give an all-clear in English when cheques could not be read", () => {
    const html = renderInsights({ outstandingCheques: null }, "en");
    expect(html).toContain("Some indicators could not be verified");
    expect(html).not.toContain("Nothing needs attention here");
  });

  it("does not give an all-clear in Arabic when cheques could not be read", () => {
    const html = renderInsights({ outstandingCheques: null }, "ar");
    expect(html).toContain("تعذر التحقق من بعض المؤشرات");
    expect(html).not.toContain("لا توجد عناصر تحتاج متابعة");
  });
});
