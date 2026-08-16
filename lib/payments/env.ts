import "server-only";
import { z } from "zod";

const paymentsEnvSchema = z.object({
  PAYMOB_SECRET_KEY: z.string().min(1),
  PAYMOB_PUBLIC_KEY: z.string().min(1),
  PAYMOB_HMAC_SECRET: z.string().min(1),
  PAYMOB_INTEGRATION_ID: z.string().min(1),
  FAWRY_MERCHANT_CODE: z.string().min(1),
  FAWRY_SECURE_KEY: z.string().min(1),
  FAWRY_BASE_URL: z.string().url().default("https://atfawry.fawrystaging.com"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type PaymentsEnv = z.infer<typeof paymentsEnvSchema>;

let cached: PaymentsEnv | null = null;

// Called ONLY from server-side code (route handlers, server actions, and
// the adapter modules those two call into) -- never import this file from
// a "use client" component. This file must never appear in a client
// bundle; the `server-only` import above makes any accidental client
// import a hard build failure rather than relying on convention alone.
export function getPaymentsEnv(): PaymentsEnv {
  if (cached) return cached;
  const parsed = paymentsEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `PAYMENTS_ENV_INVALID: missing/invalid payment provider env vars: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`
    );
  }
  cached = parsed.data;
  return cached;
}
