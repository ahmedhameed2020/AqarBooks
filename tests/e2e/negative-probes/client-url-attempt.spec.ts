import { test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Probe launched in a CHILD Playwright process by tests/isolated-target-negative-runs.test.ts. The environment is a correct
 * isolated-stack one, but the client URL this test builds (AQAR_PROBE_CLIENT_URL) is somewhere else. With the guard installed by
 * playwright.config.ts, createClient must throw before anything is built or sent. Skipped in every normal run.
 */
test.skip(process.env.AQAR_NEGATIVE_PROBE !== "1" || !process.env.AQAR_PROBE_CLIENT_URL, "child-process probe only");

test("builds a client for a URL that differs from the verified target", () => {
  createClient(process.env.AQAR_PROBE_CLIENT_URL!, "probe-key");
});
