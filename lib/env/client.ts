import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://placeholder-project.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("placeholder-anon-key"),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
});

// The placeholders keep a build working without credentials, but at runtime
// they make every Supabase call fail -- which reads as "wrong password" on the
// login screen. Say so loudly instead of failing silently.
export const usingPlaceholderSupabaseConfig =
  clientEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder-project") ||
  clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";

if (usingPlaceholderSupabaseConfig && typeof window === "undefined") {
  console.error(
    "[env] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing at build time -- " +
      "falling back to placeholders. Every sign-in will fail until they are set.",
  );
}
