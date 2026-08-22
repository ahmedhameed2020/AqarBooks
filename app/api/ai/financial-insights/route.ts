import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateExecutiveFinancialInsight, type FinancialMetricsInput } from "@/lib/ai/financial-insights";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const metrics = body?.metrics as FinancialMetricsInput;
    const locale = (body?.locale as string) || "ar";

    if (!metrics || typeof metrics.totalDues !== "number") {
      return NextResponse.json({ error: "INVALID_METRICS" }, { status: 400 });
    }

    const insight = await generateExecutiveFinancialInsight(metrics, locale);
    return NextResponse.json(insight);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
