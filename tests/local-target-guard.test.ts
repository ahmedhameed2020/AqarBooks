import { afterEach, describe, expect, it } from "vitest";
import { assertKnownLocalSupabaseUrl, isKnownLocalSupabaseUrl } from "./helpers/local-target";

describe("local-only test target guard", () => {
  it.each([
    "http://127.0.0.1:1", // unroutable dummy used by unit runs: nothing reachable, nothing written
  ])("accepts the only built-in target %s", (url) => {
    expect(isKnownLocalSupabaseUrl(url)).toBe(true);
    expect(() => assertKnownLocalSupabaseUrl(url)).not.toThrow();
  });

  it.each([
    // the Supabase CLI default is the DEVELOPMENT stack: never a default target any more, not even on loopback
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "https://abcdefghijklmnop.supabase.co",
    "http://abcdefghijklmnop.supabase.co:54321",
    "http://127.0.0.1:5432", // a Postgres port, not the API
    "http://127.0.0.1:54399", // some other local service
    "https://127.0.0.1:54321", // wrong scheme
    "http://user:pw@127.0.0.1:54321", // embedded credentials
    "http://localhost.evil.example:54321", // look-alike host
    "http://127.0.0.1.nip.io:54321",
    "",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isKnownLocalSupabaseUrl(url)).toBe(false);
    expect(() => assertKnownLocalSupabaseUrl(url)).toThrow(/Refusing to run/);
  });

  it("refuses a missing target", () => {
    expect(() => assertKnownLocalSupabaseUrl(undefined)).toThrow(/Refusing to run/);
  });

  it("never echoes credentials or the query string in the refusal", () => {
    try {
      assertKnownLocalSupabaseUrl("https://user:SECRETPW@proj.supabase.co/path?apikey=SECRETKEY");
      throw new Error("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("proj.supabase.co");
      expect(message).not.toContain("SECRETPW");
      expect(message).not.toContain("SECRETKEY");
    }
  });
});

describe("explicit opt-in for the separate clean demo stack (LOCAL_SUPABASE_API_PORTS)", () => {
  const original = process.env.LOCAL_SUPABASE_API_PORTS;
  afterEach(() => {
    if (original === undefined) delete process.env.LOCAL_SUPABASE_API_PORTS;
    else process.env.LOCAL_SUPABASE_API_PORTS = original;
  });

  it("refuses 55321 by default and accepts it only when opted in", () => {
    delete process.env.LOCAL_SUPABASE_API_PORTS;
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:55321")).toBe(false);
    process.env.LOCAL_SUPABASE_API_PORTS = "55321";
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:55321")).toBe(true);
    expect(isKnownLocalSupabaseUrl("http://localhost:55321")).toBe(true);
  });
  it("an opted-in port never legitimises a non-loopback host", () => {
    process.env.LOCAL_SUPABASE_API_PORTS = "55321,443";
    for (const url of ["https://abc.supabase.co:443", "http://abc.supabase.co:55321", "http://10.0.0.5:55321", "http://127.0.0.1.nip.io:55321"]) {
      expect(isKnownLocalSupabaseUrl(url), url).toBe(false);
    }
  });
  it("ignores malformed opt-in values", () => {
    process.env.LOCAL_SUPABASE_API_PORTS = "abc, 5 , ,12;3";
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:5")).toBe(false);
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:12")).toBe(false);
  });
});
