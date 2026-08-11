import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Bypasses RLS. Only for server-only routes that legitimately need to cross
 * tenant boundaries (e.g. platform Super Admin queries, demo_leads insert).
 * Every caller must perform its own authorization check before using this.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
