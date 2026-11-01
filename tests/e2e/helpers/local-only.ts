/**
 * Playwright `test` with an egress guard: the browser may only talk to loopback. Anything else is aborted
 * before it leaves the machine and recorded; the test fails if any such request was attempted.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ blockedRequests: string[] }>({
  blockedRequests: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
        blocked.push(`${route.request().method()} ${url.origin}`);
        return route.abort("blockedbyclient");
      });
      await use(blocked);
      expect(blocked, "the browser attempted a request to a non-local destination").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
