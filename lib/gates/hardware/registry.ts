import "server-only";
import { noopAdapter } from "./noop-adapter";
import type { GateHardwareAdapter } from "./types";

/** Adding a vendor requires an explicit review plus a database allowlist change. */
export function getGateHardwareAdapter(name: string): GateHardwareAdapter | null {
  return name === "NOOP" ? noopAdapter : null;
}
