import { NextResponse } from "next/server";

// iOS Universal Links. The Team ID is deployment configuration; without it the
// file declares no apps and links open in Safari (the web page still works).
export const dynamic = "force-dynamic";

export function GET() {
  const teamId = (process.env.IOS_TEAM_ID ?? "").trim();
  const bundleId = process.env.IOS_BUNDLE_ID ?? "com.aqarbooks.aqarbooksMobile";
  const details = /^[A-Z0-9]{10}$/.test(teamId)
    ? [{ appIDs: [`${teamId}.${bundleId}`], components: [{ "/": "/activate/*" }] }]
    : [];
  return new NextResponse(JSON.stringify({ applinks: { details } }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
