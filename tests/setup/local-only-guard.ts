/**
 * Global vitest setup: every Supabase client a test (or the app code it imports) constructs must point at the verified
 * isolated stack (never the development stack). The check runs inside createClient(), i.e. before the original constructor and
 * before the first request, so a mis-pointed .env.local fails the suite before any write happens.
 */
import { vi } from "vitest";
import { assertClientUrlIsVerifiedTarget } from "../helpers/isolated-target";
import { guardCreateClient } from "./guarded-create-client";

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, createClient: guardCreateClient(actual.createClient, assertClientUrlIsVerifiedTarget) };
});
