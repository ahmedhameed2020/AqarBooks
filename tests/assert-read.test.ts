import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLoadError, assertRead } from "@/lib/supabase/assert-read";

describe("assertRead: a failed read is an error, never an empty result", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when the read succeeded (error null/undefined)", () => {
    expect(() => assertRead(null, "x")).not.toThrow();
    expect(() => assertRead(undefined, "x")).not.toThrow();
  });

  it("throws a DataLoadError carrying the call site and the stable code (statement timeout 57014)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let caught: unknown;
    try {
      assertRead({ code: "57014", message: "canceling statement due to statement timeout" }, "members/[id]: units_with_financials");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DataLoadError);
    const err = caught as DataLoadError;
    expect(err.source).toBe("members/[id]: units_with_financials");
    expect(err.code).toBe("57014");
    expect(err.message).toContain("57014");
  });

  it("never copies the database message into the thrown error or the log (it can carry identifiers)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "relation tenant_9f3a does not exist";
    let msg = "";
    try {
      assertRead({ code: "42P01", message: secret }, "p");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain("tenant_9f3a");
    expect(JSON.stringify(log.mock.calls)).not.toContain("tenant_9f3a");
  });

  it("works without a code", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => assertRead({ message: "fetch failed" }, "p")).toThrow(DataLoadError);
  });
});
