import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { clientEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/types";

const intlMiddleware = createMiddleware(routing);

const PROTECTED_SEGMENTS = ["dashboard", "admin", "platform"];

function isProtectedPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return PROTECTED_SEGMENTS.includes(segments[1] ?? "");
}

// Named `middleware` (not Next 16's `proxy`) on purpose: `proxy.*` is pinned to
// the Node.js runtime by `next build`, and @opennextjs/cloudflare only supports
// edge middleware. See docs/deployment.md for the full rationale.
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const locale = request.nextUrl.pathname.split("/")[1] || routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("redirect_to", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // `i/` excluded alongside `api`: short invite/reminder redirect links
  // (app/i/[slug]/route.ts) must resolve without a locale prefix, both to
  // stay as short as possible and because they run before any session/
  // locale context exists for the invitee.
  matcher: ["/((?!api|i/|_next|_vercel|.*\\..*).*)"],
};
