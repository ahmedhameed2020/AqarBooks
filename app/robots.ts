import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/*/dashboard",
        "/*/admin",
        "/*/finance",
        "/*/finance/*",
        "/*/platform",
        "/*/platform/*",
        "/*/property",
        "/*/members",
        "/*/login",
        // The public demo runs the real product screens. Those screens are all
        // already listed above, so a crawler could not reach them anyway --
        // but the demo's own entry page is publicly reachable and would
        // otherwise compete with the landing page it exists to support. The
        // landing page and /pricing stay the acquisition surfaces (spec §31).
        // This prefix also covers /demo/request, which is intended: that page
        // already sets noindex in its own metadata.
        "/*/demo",
      ],
    },
  };
}
