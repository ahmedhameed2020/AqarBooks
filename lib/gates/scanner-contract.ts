import { z } from "zod";

const gateScanRequestSchema = z.object({
  deviceId: z.string().uuid(),
  deviceCredential: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/),
  gateId: z.string().uuid(),
  direction: z.enum(["ENTRY", "EXIT"]),
  qrPayload: z.string().trim().min(20).max(220),
  clientScanId: z.string().uuid(),
});

export type GateScanRequest = z.infer<typeof gateScanRequestSchema>;

export function parseGateScanRequest(input: unknown): GateScanRequest {
  return gateScanRequestSchema.parse(input);
}
