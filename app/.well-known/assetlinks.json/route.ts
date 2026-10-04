import { NextResponse } from "next/server";

// Android App Links verification. The signing-certificate fingerprints are
// deployment configuration (debug, upload and Play-signing keys differ), so
// they come from the environment. With none configured the file is an empty
// list, which verifies nothing -- links then open in the browser, where the web
// activation page works on its own.
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: process.env.ANDROID_APP_ID ?? "com.aqarbooks.aqarbooks_mobile",
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
