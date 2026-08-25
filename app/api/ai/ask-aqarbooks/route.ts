import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { demoAiGate } from "@/lib/demo/ai-gate";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { askAqarBooks } from "@/lib/ai/ask-aqarbooks-engine";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Public demo policy: allowlist + abuse ceiling. A no-op for real tenants.
    const demoRefusal = await demoAiGate(req, "ask_aqarbooks");
    if (demoRefusal) return demoRefusal;

    const organization = await getPrimaryOrganization(user.id);
    if (!organization) {
      return NextResponse.json({ error: "NO_ACTIVE_ORGANIZATION" }, { status: 403 });
    }

    const body = await req.json();
    const query = body?.query as string;
    const pageContext = body?.pageContext;
    const locale = (body?.locale as string) || "ar";

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "EMPTY_QUERY" }, { status: 400 });
    }

    // P0 Invariant: Tenant ID and User Context are injected strictly from Server Session
    const response = await askAqarBooks({
      userQuery: query,
      tenantId: organization.id,
      userId: user.id,
      userPermissions: ["finance.reports.read", "finance.receivables.read", "finance.suppliers.read", "finance.expenses.read"],
      pageContext,
      locale,
    });

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
