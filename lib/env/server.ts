import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://placeholder-project.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("placeholder-anon-key"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("placeholder-service-role-key"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

// Resolved lazily, not at module load. On Cloudflare Workers the secrets are
// only attached to process.env once a request is being handled, so reading
// them while the module is first evaluated would silently capture the
// placeholders and every admin call would then fail against a project that
// does not exist.
function resolve(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });

  if (parsed.SUPABASE_SERVICE_ROLE_KEY === "placeholder-service-role-key") {
    // Don't cache a placeholder -- the real secret may just not be attached yet.
    console.error(
      "[env] SUPABASE_SERVICE_ROLE_KEY is not set. Anything using the admin " +
        "client (invites, user status changes, imports) will fail.",
    );
    return parsed;
  }

  cached = parsed;
  return parsed;
}

export const serverEnv = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return resolve().NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return resolve().NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return resolve().SUPABASE_SERVICE_ROLE_KEY;
  },
  get NEXT_PUBLIC_SITE_URL() {
    return resolve().NEXT_PUBLIC_SITE_URL;
  },
};
