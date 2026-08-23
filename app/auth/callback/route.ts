import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/ar/dashboard";

  // A failed exchange must return the user to the door they came through. An
  // owner bounced to the staff login sees a screen that asks for a password
  // the portal does not have, and has no way back.
  const isPortalDestination = /^\/[a-z]{2}\/portal(\/|$)/.test(next);
  const failureLocale = /^\/([a-z]{2})\//.exec(next)?.[1] ?? "ar";
  const failurePath = isPortalDestination
    ? `/${failureLocale}/portal/login?error=auth_callback_failed`
    : `/${failureLocale}/login?error=auth_callback_failed`;

  const supabase = await createClient();

  // 1. PKCE Code Exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
      
      if (forwardedHost) {
        return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 2. Token Hash Verification (e.g. recovery, email verification, magic link)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
      
      if (forwardedHost) {
        return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If auth fails or no code/token provided, redirect to the right login.
  return NextResponse.redirect(`${origin}${failurePath}`);
}
