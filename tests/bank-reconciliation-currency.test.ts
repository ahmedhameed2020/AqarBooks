import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatBankAmount,
  formatMatchCandidateLabel,
} from "../app/[locale]/(app)/finance/banks/reconciliation/[statementId]/candidate-label";

const dir = join("app", "[locale]", "(app)", "finance", "banks", "reconciliation", "[statementId]");
const page = readFileSync(join(dir, "page.tsx"), "utf8");

describe("formatBankAmount", () => {
  it("includes the currency code for a valid ISO-4217 code", () => {
    const out = formatBankAmount(1234.5, "en", "SAR");
    expect(out).toContain("SAR");
    expect(out).toContain("1,234.50");
  });

  it("falls back to plain number formatting with no symbol when the code is missing", () => {
    expect(formatBankAmount(1234.5, "en", null)).toBe("1,234.50");
    expect(formatBankAmount(1234.5, "en", undefined)).toBe("1,234.50");
    expect(formatBankAmount(1234.5, "en", "")).toBe("1,234.50");
  });

  it("falls back to plain number formatting for malformed codes without throwing", () => {
    for (const bad of ["sar", "SARR", "S1R", "$", " SA", "E"]) {
      expect(() => formatBankAmount(1234.5, "en", bad)).not.toThrow();
      expect(formatBankAmount(1234.5, "en", bad)).toBe("1,234.50");
    }
  });

  it("keeps the sign for negative amounts", () => {
    const out = formatBankAmount(-75, "en", "SAR");
    expect(out).toContain("-");
    expect(out).toContain("75.00");
    expect(formatBankAmount(-75, "en", null)).toBe("-75.00");
  });

  it("formats zero with two decimals", () => {
    expect(formatBankAmount(0, "en", null)).toBe("0.00");
    expect(formatBankAmount(0, "en", "SAR")).toContain("0.00");
  });

  it("is stable for the same input", () => {
    const first = formatBankAmount(9876.54, "en", "EGP");
    const second = formatBankAmount(9876.54, "en", "EGP");
    expect(second).toBe(first);
  });
});

describe("candidate label with currency", () => {
  it("uses the currency-aware formatter for the amount part", () => {
    const fmt = (n: number) => formatBankAmount(n, "en", "SAR");
    const label = formatMatchCandidateLabel(
      {
        journal_entry_line_id: "a",
        entry_number: 3,
        entry_date: "2026-03-01",
        description: "Deposit",
        signed_amount: -40,
      },
      fmt,
      false,
    );
    expect(label.startsWith("#3 · 2026-03-01 · Deposit · Out SAR")).toBe(true);
    expect(label).toContain("40.00");
  });
});

describe("page passes the organization currency to the formatter", () => {
  it("reads the currency from the organization row, not from a hard-coded value", () => {
    expect(page).toContain('import { formatBankAmount } from "./candidate-label"');
    expect(page).toContain("const currency = organization.default_currency;");
    expect(page).toContain("formatBankAmount(n, locale, currency)");
    expect(page).not.toContain('"SAR"');
    expect(page).not.toContain('"EGP"');
  });

  it("candidate labels and statement line amounts use the same currency-aware formatter", () => {
    expect(page).toContain("formatMatchCandidateLabel(c, fmt, isAr)");
    expect(page).toContain("{fmt(l.amount)}");
  });

  it("does not select a currency column from bank accounts or statements (none exists in schema)", () => {
    const selects = [...page.matchAll(/\.select\("([^"]*)"\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.some((s) => s.includes("currency"))).toBe(false);
  });
});
