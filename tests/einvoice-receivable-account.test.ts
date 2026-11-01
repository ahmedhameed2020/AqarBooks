import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveReceivableAccountForSubmit } from "../app/[locale]/(app)/finance/einvoice/receivable-account";

const dir = join("app", "[locale]", "(app)", "finance", "einvoice");
const client = readFileSync(join(dir, "einvoice-client.tsx"), "utf8");

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

describe("resolveReceivableAccountForSubmit", () => {
  it("rejects an empty selection as required", () => {
    expect(resolveReceivableAccountForSubmit("", [ACCOUNT_A, ACCOUNT_B])).toEqual({ ok: false, reason: "required" });
  });

  it("rejects an empty selection even when the list is empty", () => {
    expect(resolveReceivableAccountForSubmit("", [])).toEqual({ ok: false, reason: "required" });
  });

  it("rejects a selection that is not in the list as invalid", () => {
    expect(resolveReceivableAccountForSubmit(ACCOUNT_B, [ACCOUNT_A])).toEqual({ ok: false, reason: "invalid" });
    expect(resolveReceivableAccountForSubmit(ACCOUNT_A, [])).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a valid selection", () => {
    expect(resolveReceivableAccountForSubmit(ACCOUNT_B, [ACCOUNT_A, ACCOUNT_B])).toEqual({ ok: true, id: ACCOUNT_B });
  });

  it("never falls back to the first listed account", () => {
    const result = resolveReceivableAccountForSubmit("", [ACCOUNT_A, ACCOUNT_B]);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("id");
  });
});

describe("einvoice-client receivable account selection (source)", () => {
  it("never reads receivableAccounts[0]", () => {
    expect(client).not.toContain("receivableAccounts[0]");
  });

  it("initialises the selected receivable account to an empty string", () => {
    expect(client).toContain("const [selectedReceivableAccountId, setSelectedReceivableAccountId] = useState(\"\");");
  });

  it("uses the pure resolver on submit and sends only the resolved id", () => {
    expect(client).toContain('from "./receivable-account"');
    expect(client).toContain('formData.append("receivableAccountId", receivableAccountResolution.id);');
    expect(client).not.toContain('selectedReceivableAccountId || (');
  });

  it("guards submit when no account is resolved", () => {
    expect(client).toMatch(/if \(!receivableAccountResolution\.ok\) \{[\s\S]*?return;\s*\}/);
  });

  it("renders a receivable account selector bound to the state setter", () => {
    expect(client).toContain("onValueChange={(val) => setSelectedReceivableAccountId(val ?? \"\")}");
    expect(client).toContain("value={selectedReceivableAccountId}");
    expect(client).toContain('data-testid="einvoice-receivable-account"');
  });

  it("shows an inline required message while no account is selected", () => {
    expect(client).toContain('data-testid="einvoice-receivable-required"');
    expect(client).toMatch(/!receivableAccountResolution\.ok && \(/);
  });

  it("disables the submit button while no account is resolved", () => {
    expect(client).toContain("disabled={isPending || !invoiceAmount || !receivableAccountResolution.ok}");
  });

  it("keeps the server action call unchanged", () => {
    expect(client).toContain("await issueDueAction({ ok: true }, formData);");
  });
});
