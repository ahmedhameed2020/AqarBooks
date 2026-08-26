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
        // Creates real Supabase Auth accounts across a 4-step wizard --
        // same category as /login: a sign-in/account-creation door, not an
        // acquisition surface. /pricing is what should rank; this shouldn't.
        "/*/get-started",
        "/*/get-started/*",
        // The public demo runs the real product screens. Those screens are all
        // already listed above, so a crawler could not reach them anyway --
        // but the demo's own entry page signs the visitor in, and an indexed
        // sign-in door is not something to invite crawlers through. The
        // landing page and /pricing stay the acquisition surfaces.
        // This prefix also covers /demo/request, which is intended: that page
        // already sets noindex in its own metadata.
        "/*/demo",
      ],
    },
  };
}
