import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = {
  ...defineCloudflareConfig(),
  // OpenNext builds the Next.js app by shelling out to `npm run build` by
  // default. Since `npm run build` is itself `opennextjs-cloudflare build`
  // (so that Cloudflare Workers Builds produces a deployable bundle from its
  // default build command), that default would recurse infinitely. Pointing
  // it straight at the Next.js CLI breaks the cycle.
  buildCommand: "npx next build",
};

export default config;
