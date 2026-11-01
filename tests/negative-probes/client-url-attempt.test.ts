import { describe, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Child-process probe for tests/isolated-target-negative-runs.test.ts: the environment is a CORRECT clean-stack one, but the
 * client URL the test builds (AQAR_PROBE_CLIENT_URL) points elsewhere. createClient must throw before anything is built or sent.
 * Constructing a client sends no request even if the guard were missing; nothing is called on it.
 */
describe.skipIf(process.env.AQAR_NEGATIVE_PROBE !== "1" || !process.env.AQAR_PROBE_CLIENT_URL)("client URL probe (child process only)", () => {
  it("builds a client for a URL that differs from the verified target", () => {
    createClient(process.env.AQAR_PROBE_CLIENT_URL!, "probe-key");
  });
});
