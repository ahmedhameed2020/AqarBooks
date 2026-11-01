// Production smoke: read-only, runs only against an https origin with an
// explicit probe account. Deliberately separate from playwright.config.ts so
// the local-only guard there stays intact.
if (!process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error("PLAYWRIGHT_BASE_URL is required (e.g. https://aqarbooks.com)");
}
const uri = new URL(process.env.PLAYWRIGHT_BASE_URL);
if (uri.protocol !== "https:") {
  throw new Error(`production smoke refuses non-https origin: ${uri.host}`);
}
if (!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD) {
  throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required");
}

export default {
  testDir: "./tests/production",
  timeout: 150_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
};
