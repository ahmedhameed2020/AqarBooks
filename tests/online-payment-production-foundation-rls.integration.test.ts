import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

function localCredentials() {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
  });
  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

describe("online payment production foundation access boundaries", () => {
  const env = localCredentials();
  const anon = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false },
  });
  const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  it("keeps production pilot enrollment service-role only", async () => {
    const [{ error: anonError }, { error: serviceError }] = await Promise.all([
      anon.from("online_payment_production_pilots").select("organization_id").limit(1),
      service.from("online_payment_production_pilots").select("organization_id").limit(1),
    ]);

    expect(anonError?.code).toBe("42501");
    expect(serviceError).toBeNull();
  });

  it("allows no anonymous event reads or writes", async () => {
    const { error: readError } = await anon
      .from("online_payment_events")
      .select("id")
      .limit(1);
    const { error: writeError } = await anon.from("online_payment_events").insert({});

    expect(readError?.code).toBe("42501");
    expect(writeError?.code).toBe("42501");
  });

  it("keeps the durable inbox reachable by the service role", async () => {
    const { error } = await service.from("online_payment_events").select("id").limit(1);
    expect(error).toBeNull();
  });
});
