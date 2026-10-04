import { NextResponse } from "next/server";
import { ACTIVATION_TOKEN_RE } from "@/lib/portal-access/identity";
import { completeActivation } from "@/lib/portal-access/orchestrate";
import { activationDeps } from "@/lib/portal-access/server";

const NO_STORE = { "Cache-Control": "no-store" };

const STATUS: Record<string, number> = {
  invalid_token: 404,
  expired: 410,
  used: 410,
  revoked: 410,
  weak_password: 422,
  needs_signin: 401,
  email_mismatch: 403,
  already_linked: 409,
  identity_in_use: 409,
  server_error: 500,
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : undefined;
  if (!ACTIVATION_TOKEN_RE.test(token) || (password !== undefined && password.length > 200)) {
    return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 400, headers: NO_STORE });
  }
  const header = request.headers.get("authorization") ?? "";
  const bearerJwt = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? null;

  const result = await completeActivation(activationDeps(), { token, password, bearerJwt });
  if (result.ok) return NextResponse.json(result, { headers: NO_STORE });
  return NextResponse.json(result, { status: STATUS[result.reason] ?? 400, headers: NO_STORE });
}
