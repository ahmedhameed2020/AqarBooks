/**
 * Organization-deletion refusal messages. Reads the mapping module as text for the
 * static checks and calls the pure helper for the behavioural ones. No database access.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_DELETE_GENERIC_MESSAGE,
  ORGANIZATION_DELETE_MESSAGES,
  organizationDeleteMessage,
} from "../lib/actions/organization-delete-messages";

const MAPPING_FILE = join("lib", "actions", "organization-delete-messages.ts");
const source = existsSync(MAPPING_FILE) ? readFileSync(MAPPING_FILE, "utf8") : "";

describe("organization-delete-messages: static", () => {
  it("the mapping file exists", () => {
    expect(existsSync(MAPPING_FILE)).toBe(true);
  });

  it("contains both known refusal codes and the generic fallback", () => {
    expect(source).toContain("COA_USED_DELETE_FORBIDDEN");
    expect(source).toContain("FISCAL_CLOSED_RECORD_DELETE_BLOCKED");
    expect(source).toContain("ORGANIZATION_DELETE_GENERIC_MESSAGE");
  });

  it("does not hard-code SQL text or raw database error wording", () => {
    expect(source).not.toMatch(/\braise exception\b/i);
    expect(source).not.toMatch(/\bselect\s+.+\bfrom\b/i);
    expect(source).not.toMatch(/SQLSTATE|errcode/i);
  });
});

describe("organization-delete-messages: behaviour", () => {
  it("maps COA_USED_DELETE_FORBIDDEN to a clear Arabic and English message", () => {
    const ar = organizationDeleteMessage("COA_USED_DELETE_FORBIDDEN", true);
    const en = organizationDeleteMessage("COA_USED_DELETE_FORBIDDEN", false);
    expect(ar).toBe(ORGANIZATION_DELETE_MESSAGES.COA_USED_DELETE_FORBIDDEN.ar);
    expect(en).toBe(ORGANIZATION_DELETE_MESSAGES.COA_USED_DELETE_FORBIDDEN.en);
    expect(en).toMatch(/posted accounting records/i);
    expect(en).toMatch(/close or archive/i);
  });

  it("maps FISCAL_CLOSED_RECORD_DELETE_BLOCKED to a clear Arabic and English message", () => {
    const ar = organizationDeleteMessage("FISCAL_CLOSED_RECORD_DELETE_BLOCKED", true);
    const en = organizationDeleteMessage("FISCAL_CLOSED_RECORD_DELETE_BLOCKED", false);
    expect(ar).toBe(ORGANIZATION_DELETE_MESSAGES.FISCAL_CLOSED_RECORD_DELETE_BLOCKED.ar);
    expect(en).toBe(ORGANIZATION_DELETE_MESSAGES.FISCAL_CLOSED_RECORD_DELETE_BLOCKED.en);
    expect(en).toMatch(/closed fiscal calendar/i);
    expect(ar).not.toBe(en);
  });

  it("falls back to the generic message for unknown codes, null, and raw SQL text", () => {
    const generic = ORGANIZATION_DELETE_GENERIC_MESSAGE;
    for (const input of [
      "SOMETHING_ELSE",
      "",
      null,
      undefined,
      'update "organizations" set x = 1 where id = $1',
      "constructor",
      "__proto__",
    ]) {
      expect(organizationDeleteMessage(input, false)).toBe(generic.en);
      expect(organizationDeleteMessage(input, true)).toBe(generic.ar);
    }
  });
});
