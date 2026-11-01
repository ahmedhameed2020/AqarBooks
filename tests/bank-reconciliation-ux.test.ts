import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMatchCandidateLabel } from "../app/[locale]/(app)/finance/banks/reconciliation/[statementId]/candidate-label";

const dir = join("app", "[locale]", "(app)", "finance", "banks", "reconciliation", "[statementId]");
const page = readFileSync(join(dir, "page.tsx"), "utf8");
const actions = readFileSync(join(dir, "reconciliation-actions.tsx"), "utf8");
const dialog = readFileSync(join(dir, "confirm-action-dialog.tsx"), "utf8");

const fmt = (n: number) => n.toFixed(2);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

describe("bank reconciliation candidate label", () => {
  it("shows direction and absolute amount for money in", () => {
    const label = formatMatchCandidateLabel(
      {
        journal_entry_line_id: "a",
        entry_number: 12,
        entry_date: "2026-01-12",
        description: "Rent",
        signed_amount: 5000,
      },
      fmt,
      false,
    );
    expect(label).toBe("#12 · 2026-01-12 · Rent · In 5000.00");
  });

  it("shows outgoing direction with a positive absolute amount for money out", () => {
    const label = formatMatchCandidateLabel(
      {
        journal_entry_line_id: "b",
        entry_number: 7,
        entry_date: "2026-01-20",
        description: "Service fee",
        signed_amount: -25,
      },
      fmt,
      true,
    );
    // Arabic UI isolates the LTR reference and amount runs (U+2066 ... U+2069).
    expect(label).toBe(`${LRI}#7 · 2026-01-20${PDI} · Service fee · صادر ${LRI}25.00${PDI}`);
  });

  it("handles numeric strings and missing entry number or description", () => {
    const label = formatMatchCandidateLabel(
      {
        journal_entry_line_id: "c",
        entry_number: null,
        entry_date: "2026-02-01",
        description: null,
        signed_amount: "-12.5",
      },
      fmt,
      false,
    );
    expect(label).toBe("#— · 2026-02-01 · · Out 12.50");
  });

  it("is used by the page to build candidate labels", () => {
    expect(page).toContain('import { formatMatchCandidateLabel } from "./candidate-label"');
    expect(page).toContain("formatMatchCandidateLabel(c, fmt, isAr)");
    expect(page).not.toContain("`#${c.entry_number");
  });
});

describe("bank reconciliation error text", () => {
  it("no longer falls back to the raw error code", () => {
    expect(actions).not.toContain("message = state.error;");
    expect(actions).toContain("message = financeErrorMessage(state.error, isAr);");
    expect(actions).toContain('import { financeErrorMessage } from "@/lib/actions/error-messages";');
  });
});

describe("bank reconciliation confirmation steps", () => {
  it("unmatch opens the confirm dialog instead of submitting the action", () => {
    expect(actions).toMatch(
      /<Button\s+type="button"\s+variant="ghost"\s+size="sm"\s+disabled=\{pending\}\s+onClick=\{\(\) => setConfirmOpen\(true\)\}>/,
    );
    expect(actions).not.toMatch(/variant="ghost"[\s\S]{0,120}type="submit"/);
  });

  it("reopen opens the confirm dialog instead of submitting the action", () => {
    expect(actions).toContain('type={isReopen ? "button" : "submit"}');
    expect(actions).toContain("onClick={isReopen ? () => setConfirmOpen(true) : undefined}");
  });

  it("finalize stays a direct submit", () => {
    expect(actions).toContain('type={isReopen ? "button" : "submit"}');
    expect(actions).toMatch(/status === "DRAFT" \? finalizeReconciliation : reopenReconciliation/);
  });

  it("both confirm dialogs submit the original form by id and disable buttons while pending", () => {
    expect(actions.match(/<ConfirmActionDialog/g)?.length).toBe(2);
    expect(actions.match(/formId=\{formId\}/g)?.length).toBe(2);
    expect(actions.match(/pending=\{pending\}/g)?.length).toBe(2);
    expect(dialog).toContain('<Button type="submit" form={formId} disabled={pending}>');
    expect(dialog).toContain('<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>');
  });

  it("confirm dialog cannot be dismissed while pending", () => {
    expect(dialog).toContain("if (!pending) onOpenChange(next);");
  });

  it("server actions and their argument names are unchanged", () => {
    expect(actions).toContain('name="lineId" value={lineId}');
    expect(actions).toContain('name="journalLineId" value=""');
    expect(actions).toContain('<input type="hidden" name="statementId" value={statementId} />');
    expect(actions).toContain("status === \"DRAFT\" ? finalizeReconciliation : reopenReconciliation");
    expect(actions).toContain("useActionState<ActionResult, FormData>(setLineMatch");
  });
});
