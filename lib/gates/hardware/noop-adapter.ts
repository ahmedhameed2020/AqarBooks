import "server-only";
import type { GateHardwareAdapter } from "./types";

/** No network request, physical operation, or claimed opening. */
export const noopAdapter: GateHardwareAdapter = {
  async dispatchOpen() { return { status: "NOT_CONFIGURED" }; },
};
