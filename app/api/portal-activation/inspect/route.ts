import { NextResponse } from "next/server";
import { ACTIVATION_TOKEN_RE } from "@/lib/portal-access/identity";
import { inspectActivation } from "@/lib/portal-access/orchestrate";
import { activationDeps } from "@/lib/portal-access/server";

const NO_STORE = { "Cache-Control": "no-store" };

// Public by design: the activation token IS the credential. Nothing is
// returned for an unknown token beyond "not_found", and the token is never
// logged.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!ACTIVATION_TOKEN_RE.test(token)) {
    return NextResponse.json({ state: "not_found" }, { headers: NO_STORE });
  }
  const result = await inspectActivation(activationDeps(), token);
  return NextResponse.json(result, { headers: NO_STORE });
}
