import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dbErrorCode } from "../lib/actions/db-error-code";

describe("dbErrorCode", () => {
  const mapped: Array<[string, string]> = [
    ["RECEIVABLE_ACCOUNT_REQUIRED", "RECEIVABLE_ACCOUNT_REQUIRED"],
    ["DEPOSIT_ACCOUNT_INVALID", "DEPOSIT_ACCOUNT_INVALID"],
    ["ALREADY_REVERSED", "ALREADY_REVERSED"],
    ["REASON_REQUIRED", "reason_required"],
    ["FORBIDDEN_FINANCE_PERMISSION", "forbidden"],
    ["FORBIDDEN", "forbidden"],
    ["UNAUTHORIZED", "unauthorized"],
    ["PAYMENT_NOT_FOUND", "not_found"],
    ["ALLOCATION_NOT_FOUND", "not_found"],
    ["PROPERTY_NOT_FOUND", "not_found"],
  ];

  it.each(mapped)("maps %s to %s", (message, code) => {
    expect(dbErrorCode(message)).toBe(code);
  });

  it("returns query_failed for unknown SQL-like messages", () => {
    expect(dbErrorCode('duplicate key value violates unique constraint "cashboxes_pkey"')).toBe("query_failed");
    expect(dbErrorCode("ERROR: relation \"public.secret_table\" does not exist")).toBe("query_failed");
  });

  it("returns query_failed for null, undefined and empty messages", () => {
    expect(dbErrorCode(null)).toBe("query_failed");
    expect(dbErrorCode(undefined)).toBe("query_failed");
    expect(dbErrorCode("")).toBe("query_failed");
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(dbErrorCode("  ALREADY_REVERSED\n")).toBe("ALREADY_REVERSED");
    expect(dbErrorCode("\tPAYMENT_NOT_FOUND ")).toBe("not_found");
  });

  it("does not resolve prototype properties", () => {
    expect(dbErrorCode("constructor")).toBe("query_failed");
    expect(dbErrorCode("__proto__")).toBe("query_failed");
  });
});

describe("treasury.ts source guard", () => {
  it("does not return raw database error text", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../lib/actions/treasury.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/error: \w+\.message/);
    expect(source).toMatch(/error: dbErrorCode\(error\.message\)/);
  });
});
