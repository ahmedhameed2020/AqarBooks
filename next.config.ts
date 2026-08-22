import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:locale/finance/reports/owner-statements",
        destination: "/:locale/finance/reports/owner-statement",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);

// Makes Cloudflare bindings available to `next dev`, so local development hits
// the same `getCloudflareContext()` API the deployed Worker uses.
initOpenNextCloudflareForDev();
