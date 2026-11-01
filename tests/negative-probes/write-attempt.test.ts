import { describe, it } from "vitest";
import { createGateFixture } from "../helpers/gate-release";

/**
 * Not a test of the product: the probe that tests/isolated-target-negative-runs.test.ts launches in a CHILD process with a
 * deliberately broken environment. It attempts the first thing every write-capable suite does (build a fixture: users,
 * organization, rows). With the isolation gate working it must die before anything is written. In a normal run it is skipped.
 */
describe.skipIf(process.env.AQAR_NEGATIVE_PROBE !== "1")("negative probe (child process only)", () => {
  it("attempts a fixture write", async () => {
    await createGateFixture();
  });
});
