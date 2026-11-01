import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Sprint 2 / Batch 3: the closing journey must run real checks, show the exact
// proposed entry, require typed confirmation, and render the database result.
const read = (path: string) => {
  const absolute = join(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
};

const periods = read("app/[locale]/(app)/admin/finance/periods/periods-client.tsx");
const dialog = read("app/[locale]/(app)/admin/finance/periods/year-end-closing-dialog.tsx");
const actions = read("lib/actions/fiscal-year-closing.ts");
const errors = read("lib/actions/error-messages.ts");

describe("Batch 3 year-end closing journey", () => {
  it("replaces the display-only wizard with the connected closing dialog", () => {
    expect(periods).toContain("YearEndClosingDialog");
    expect(periods).not.toContain("إقفال السنة المالية غير متاح بعد");
    expect(periods).not.toContain("Fiscal year closing is not available yet");
    expect(periods).not.toContain("لم يُجرَ أي فحص بعد");
    expect(periods).not.toContain("No checks have been run yet");
  });

  it("has precheck, preview, typed confirmation, and result stages", () => {
    expect(dialog).toContain('"precheck"');
    expect(dialog).toContain('"preview"');
    expect(dialog).toContain('"confirm"');
    expect(dialog).toContain('"result"');
    expect(dialog).toContain("getFiscalYearClosingPreviewAction");
    expect(dialog).toContain("closeFiscalYearAction");
    expect(dialog).toContain("closingConfirmationMatches");
  });

  it("requires a reason and the exact locale-specific confirmation before submit", () => {
    expect(dialog).toContain("reason.trim()");
    expect(dialog).toContain("closingConfirmationMatches(confirmation, locale)");
    expect(dialog).toMatch(/disabled=\{[^}]*confirmationValid[^}]*\}/s);
    expect(dialog).toContain("إقفال السنة");
    expect(dialog).toContain("CLOSE YEAR");
  });

  it("uses one idempotency key for retries and blocks double submission", () => {
    expect(dialog).toContain("useOperationSubmit");
    expect(dialog).toContain("operationKey");
    expect(actions).toContain("p_operation_key: parsed.data.operationKey");
  });

  it("runs the existing database closing function under strict tenant permission", () => {
    expect(actions).toContain('rpc("close_fiscal_year"');
    expect(actions).toContain('proveTenantPermission(parsed.data.organizationId, "finance.years.close")');
    expect(actions).not.toContain("createAdminClient");
    expect(actions).toContain("revalidatePath");
  });

  it("builds the preview from actual ledger data without calling the write function", () => {
    expect(actions).toContain("getFiscalYearClosingPreviewAction");
    expect(actions).toContain("calculateYearEndClosing");
    expect(actions).toContain("journal_entry_lines");
    expect(actions).toContain("UNREVIEWED_ENTRIES_EXIST");
    expect(actions).toContain("PERIOD_NOT_CLOSED");
    const preview = actions.slice(actions.indexOf("getFiscalYearClosingPreviewAction"), actions.indexOf("closeFiscalYearAction"));
    expect(preview).not.toContain('rpc("close_fiscal_year"');
  });

  it("shows the persisted result and does not claim opening-balance rollover", () => {
    expect(dialog).toContain("closingEntryId");
    expect(dialog).toContain("lineCount");
    expect(dialog).toContain("netIncome");
    expect(dialog).toContain("alreadyClosed");
    expect(dialog).not.toContain("جاهز لترحيل الأرصدة الافتتاحية");
    expect(dialog).not.toContain("Ready for Opening Balance Rollover");
  });

  it("maps closing failures to safe actionable Arabic and English messages", () => {
    for (const code of [
      "PERIOD_NOT_CLOSED",
      "UNREVIEWED_ENTRIES_EXIST",
      "RE_ACCOUNT_REQUIRED",
      "RE_ACCOUNT_INVALID",
      "ENTRIES_UNBALANCED",
      "NOTHING_TO_CLOSE",
      "ALREADY_CLOSED",
      "FORBIDDEN_CLOSE_PERMISSION",
    ]) {
      expect(errors, code).toContain(`${code}: {`);
    }
  });

  it("leaves individual period status changes intact", () => {
    expect(periods).toMatch(/handleStatusChange\(period, "CLOSED"\)/);
    expect(periods).toContain("setFiscalPeriodStatusAction");
  });
});
