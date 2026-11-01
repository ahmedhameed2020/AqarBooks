import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ltrIsolate } from "../app/[locale]/(app)/finance/banks/reconciliation/[statementId]/candidate-label";

const root = join("app", "[locale]", "(app)", "finance", "banks", "reconciliation");

const page = readFileSync(join(root, "[statementId]", "page.tsx"), "utf8");
const listPage = readFileSync(join(root, "page.tsx"), "utf8");
const listClient = readFileSync(join(root, "reconciliation-client.tsx"), "utf8");

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("ltrIsolate", () => {
  it("wraps text in LTR isolate marks for Arabic UI", () => {
    expect(ltrIsolate("#7 · 2026-01-20", true)).toBe(`${LRI}#7 · 2026-01-20${PDI}`);
  });

  it("returns text unchanged for English UI", () => {
    expect(ltrIsolate("#7 · 2026-01-20", false)).toBe("#7 · 2026-01-20");
  });
});

describe("reconciliation detail page RTL", () => {
  it("has no literal 'Ref:' outside a translation ternary", () => {
    const withoutTranslations = page.replace(/isAr \? "[^"\n]*" : "Ref:"/g, "");
    expect(withoutTranslations).not.toContain("Ref:");
    expect(page).toContain('{isAr ? "المرجع:" : "Ref:"}');
  });

  it("puts the reference value in a dir=ltr span", () => {
    expect(page).toMatch(/\{isAr \? "المرجع:" : "Ref:"\}\s*<span dir="ltr">\{l\.reference\}<\/span>/);
  });

  it("puts the period dates and account number in a dir=ltr span", () => {
    expect(page).toMatch(
      /<span dir="ltr">\s*\{statement\.period_start\} – \{statement\.period_end\}\s*\{account \? ` · \$\{account\.account_number\}` : ""\}\s*<\/span>/,
    );
  });

  it("still formats every amount with the organization currency helper", () => {
    expect(page).toContain("const fmt = (n: number) => formatBankAmount(n, locale, currency);");
    expect(page).toContain("formatBankAmount(n, locale, currency)");
    expect(page).toContain("formatMatchCandidateLabel(c, fmt, isAr)");
    expect(page).toContain("{fmt(l.amount)}");
  });

  it("documents that the currency is the organization display currency", () => {
    expect(page).toContain("DISPLAY currency");
  });
});

describe("reconciliation folder RTL", () => {
  it("contains no hard-coded arrow glyphs in JSX or strings", () => {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("→");
      expect(text, file).not.toContain("←");
    }
  });

  it("keeps the list page date range and account numbers in LTR runs", () => {
    expect(listClient).toMatch(/<span dir="ltr" className="inline-flex[^"]*">\s*<span>\{stmt\.period_start\}<\/span>/);
    expect(listClient).toMatch(/<span dir="ltr">\{stmt\.bank_account_number \|\| ""\}<\/span>/);
    expect(listPage).toContain("ltrIsolate(a.account_number, isAr)");
  });
});
