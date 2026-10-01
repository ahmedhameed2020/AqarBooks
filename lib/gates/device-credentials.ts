import "server-only";

import { createHash, randomBytes } from "node:crypto";

export type DeviceSecret = {
  raw: string;
  sha256: string;
  hint: string;
};

export function generateDeviceSecret(): DeviceSecret {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
    hint: raw.slice(-8),
  };
}
