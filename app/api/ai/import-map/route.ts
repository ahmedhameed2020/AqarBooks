import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { demoAiGate } from "@/lib/demo/ai-gate";
import { mapImportHeadersAi } from "@/lib/ai/import-mapper";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Public demo policy: allowlist + abuse ceiling. A no-op for real tenants.
    const demoRefusal = await demoAiGate(req, "import_mapping");
    if (demoRefusal) return demoRefusal;

    const body = await req.json();
    const headers = body?.headers as string[];
    const sampleRows = body?.sampleRows as string[][];

    if (!Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json({ error: "INVALID_HEADERS" }, { status: 400 });
    }

    const result = await mapImportHeadersAi(headers, sampleRows);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
