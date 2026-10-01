import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const manifest = {
  id: "/gate-scanner",
  name: "AqarBooks Gate Scanner",
  short_name: "Gate Scanner",
  description: "Secure visitor access scanner for AqarBooks gate operations.",
  start_url: "/en/operations/gate",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#071f2b",
  theme_color: "#07425d",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
} satisfies MetadataRoute.Manifest;

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/manifest+json",
    },
  });
}
