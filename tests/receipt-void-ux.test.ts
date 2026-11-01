import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isVoidReasonValid, normalizeVoidReason } from "@/app/[locale]/(app)/finance/payments/void-reason";

const PAYMENTS_DIR = path.resolve(process.cwd(), "app", "[locale]", "(app)", "finance", "payments");
const CLIENT_FILE = path.join(PAYMENTS_DIR, "payments-client.tsx");
const DIALOG_FILE = path.join(PAYMENTS_DIR, "void-receipt-dialog.tsx");

describe("receipt void UX: source contract", () => {
  const clientSource = readFileSync(CLIENT_FILE, "utf8");

  it("payments-client no longer uses window.prompt or window.location.reload", () => {
    expect(clientSource).not.toContain("window.prompt");
    expect(clientSource).not.toContain("window.location.reload");
  });

  it("payments-client mounts the void dialog and refreshes through the router", () => {
    expect(clientSource).toContain("VoidReceiptDialog");
    expect(clientSource).toContain("setVoidTarget(payment)");
    expect(clientSource).toContain("canVoidPayment && isPosted");
  });

  it("the void dialog file exists and requires a non-empty trimmed reason", () => {
    const dialogSource = readFileSync(DIALOG_FILE, "utf8");
    expect(dialogSource).toContain('financeErrorMessage("reason_required", isAr)');
    expect(dialogSource).toContain("disabled={pending || !reasonValid}");
    expect(dialogSource).toContain("normalizeVoidReason(reason)");
    expect(dialogSource).toContain("router.refresh()");
    expect(dialogSource).toContain("financeErrorMessage(result.error, isAr)");
    expect(dialogSource).toContain("inFlight.current");
  });
});

describe("isVoidReasonValid", () => {
  it("rejects an empty reason", () => {
    expect(isVoidReasonValid("")).toBe(false);
  });

  it("rejects spaces only", () => {
    expect(isVoidReasonValid("     ")).toBe(false);
  });

  it("rejects tabs and newlines only", () => {
    expect(isVoidReasonValid("\t\n\t\n")).toBe(false);
    expect(isVoidReasonValid(" \t \n ")).toBe(false);
  });

  it("accepts a real reason", () => {
    expect(isVoidReasonValid("Duplicate receipt entry")).toBe(true);
  });

  it("accepts a reason with surrounding spaces and the value is trimmed", () => {
    expect(isVoidReasonValid("  wrong amount  ")).toBe(true);
    expect(normalizeVoidReason("  wrong amount  ")).toBe("wrong amount");
  });
});
