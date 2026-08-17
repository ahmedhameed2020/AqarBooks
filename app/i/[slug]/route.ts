import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Short redirect for member portal invitations -- see
// supabase/migrations/20260902000002_member_invitation_short_links.sql for
// why the real Supabase action_link can't just be sent directly (~250+
// chars, reads as spam). No locale prefix on purpose: this has to run
// before any session/locale context exists for the invitee, and stay as
// short as possible. Excluded from the i18n middleware via middleware.ts's
// matcher.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("member_invitation_short_links")
    .select("action_link, expires_at, invitation_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data || new Date(data.expires_at) < new Date()) {
    return NextResponse.redirect(new URL("/en/portal/login?error=invite_link_invalid", _request.url));
  }

  // Re-check the underlying invitation is still pending -- the short link's
  // own expiry can outlive an invitation that was revoked/accepted/expired
  // in between (the lazy sweep only runs when a new invitation is created).
  const { data: invitation } = await admin
    .from("member_invitations")
    .select("status")
    .eq("id", data.invitation_id)
    .maybeSingle();

  if (invitation?.status !== "pending") {
    return NextResponse.redirect(new URL("/en/portal/login?error=invite_link_invalid", _request.url));
  }

  return NextResponse.redirect(data.action_link);
}
