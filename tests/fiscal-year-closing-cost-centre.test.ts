import { describe, it, expect } from "vitest";
import {
  calculateYearEndClosing,
  type AccountBalance,
  type AccountCategory,
  type ClosingLine,
  type ClosingResult,
} from "@/lib/accounting/fiscal-year-closing";

const MONEY = /^-?\d+\.\d{4}$/;
const RE = "3100";
const CC_A = "11111111-1111-4111-8111-111111111111";
const CC_B = "22222222-2222-4222-8222-222222222222";

function bal(
  accountId: string,
  category: AccountCategory,
  debit: string,
  credit: string,
  costCentreId?: string | null,
  requiresCostCenter?: boolean,
): AccountBalance {
  const row: AccountBalance = { accountId, category, debit, credit };
  if (costCentreId !== undefined) row.costCentreId = costCentreId;
  if (requiresCostCenter !== undefined) row.requiresCostCenter = requiresCostCenter;
  return row;
}

/** Runs the calculator with the retained earnings EQUITY row appended (zero balance, no centre). */
function run(balances: AccountBalance[], retainedEarningsRequiresCostCenter?: boolean): ClosingResult {
  return calculateYearEndClosing({
    balances: [...balances, bal(RE, "EQUITY", "0", "0")],
    retainedEarningsAccountId: RE,
    retainedEarningsRequiresCostCenter,
  });
}

function okOf(r: ClosingResult) {
  if (!r.ok) throw new Error(`expected ok result, got error ${r.error}`);
  return r;
}

function errOf(r: ClosingResult): string {
  if (r.ok) throw new Error("expected error result, got ok");
  return r.error;
}

function toScaled(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [intPart, fracPart] = unsigned.split(".");
  const scaled = BigInt(intPart) * BigInt(10000) + BigInt(fracPart);
  return negative ? -scaled : scaled;
}

/** Sum of (debit - credit) over the lines matching a predicate, as exact integer ten-thousandths. */
function netOf(lines: ClosingLine[], predicate: (l: ClosingLine) => boolean): bigint {
  let total = BigInt(0);
  for (const l of lines.filter(predicate)) {
    total += toScaled(l.debit) - toScaled(l.credit);
  }
  return total;
}

describe("calculateYearEndClosing - profit with two cost centres", () => {
  // Centre A: revenue 1000, expense 200 -> profit 800. Centre B: revenue 500, expense 100 -> profit 400.
  const balances = [
    bal("4100", "REVENUE", "0", "1000", CC_A),
    bal("4100", "REVENUE", "0", "500", CC_B),
    bal("5100", "EXPENSE", "200", "0", CC_A),
    bal("5100", "EXPENSE", "100", "0", CC_B),
    bal("1110", "ASSET", "1200", "0"),
  ];

  it("produces one closing line per (account, cost centre) pair", () => {
    const r = okOf(run(balances));
    const temporary = r.lines.filter((l) => l.reason === "CLOSE_TEMPORARY");
    expect(temporary.map((l) => `${l.accountId}:${l.costCentreId}`).sort()).toEqual(
      [`4100:${CC_A}`, `4100:${CC_B}`, `5100:${CC_A}`, `5100:${CC_B}`].sort(),
    );
  });

  it("gives each cost centre its own retained earnings line with its own profit", () => {
    const r = okOf(run(balances));
    const re = r.lines.filter((l) => l.reason === "RETAINED_EARNINGS");
    expect(re).toHaveLength(2);
    expect(re.find((l) => l.costCentreId === CC_A)).toEqual({
      accountId: RE,
      debit: "0.0000",
      credit: "800.0000",
      reason: "RETAINED_EARNINGS",
      costCentreId: CC_A,
    });
    expect(re.find((l) => l.costCentreId === CC_B)).toEqual({
      accountId: RE,
      debit: "0.0000",
      credit: "400.0000",
      reason: "RETAINED_EARNINGS",
      costCentreId: CC_B,
    });
  });

  it("nets every cost centre to zero, so each centre balances on its own", () => {
    const r = okOf(run(balances));
    expect(netOf(r.lines, (l) => l.costCentreId === CC_A)).toBe(BigInt(0));
    expect(netOf(r.lines, (l) => l.costCentreId === CC_B)).toBe(BigInt(0));
  });

  it("reports the whole-year net income and balanced totals", () => {
    const r = okOf(run(balances));
    expect(r.netIncome).toBe("1200.0000");
    expect(r.totalDebit).toBe(r.totalCredit);
    expect(r.totalDebit).toBe("1500.0000");
  });
});

describe("calculateYearEndClosing - loss with a cost centre", () => {
  const balances = [
    bal("4100", "REVENUE", "0", "100", CC_A),
    bal("5100", "EXPENSE", "300", "0", CC_A),
    bal("2100", "LIABILITY", "0", "200", CC_A),
  ];

  it("debits that centre's retained earnings by its net loss", () => {
    const r = okOf(run(balances));
    expect(r.lines.find((l) => l.reason === "RETAINED_EARNINGS")).toEqual({
      accountId: RE,
      debit: "200.0000",
      credit: "0.0000",
      reason: "RETAINED_EARNINGS",
      costCentreId: CC_A,
    });
    expect(r.netIncome).toBe("-200.0000");
    expect(r.totalDebit).toBe("300.0000");
    expect(r.totalCredit).toBe("300.0000");
  });
});

describe("calculateYearEndClosing - tie for one centre and profit for another", () => {
  // Centre A nets to zero: no retained earnings line for A. Centre B profits 300.
  const balances = [
    bal("4100", "REVENUE", "0", "500", CC_A),
    bal("5100", "EXPENSE", "500", "0", CC_A),
    bal("4100", "REVENUE", "0", "300", CC_B),
    bal("1110", "ASSET", "300", "0"),
  ];

  it("posts no retained earnings line for the tied centre", () => {
    const r = okOf(run(balances));
    const re = r.lines.filter((l) => l.reason === "RETAINED_EARNINGS");
    expect(re.map((l) => l.costCentreId)).toEqual([CC_B]);
    expect(re[0]).toMatchObject({ credit: "300.0000", debit: "0.0000" });
  });

  it("still closes the tied centre's temporary accounts", () => {
    const r = okOf(run(balances));
    expect(r.lines.filter((l) => l.costCentreId === CC_A && l.reason === "CLOSE_TEMPORARY")).toHaveLength(2);
    expect(netOf(r.lines, (l) => l.costCentreId === CC_A)).toBe(BigInt(0));
    expect(netOf(r.lines, (l) => l.costCentreId === CC_B)).toBe(BigInt(0));
  });

  it("keeps totals balanced and reports the profit of the profitable centre only", () => {
    const r = okOf(run(balances));
    expect(r.netIncome).toBe("300.0000");
    expect(r.totalDebit).toBe(r.totalCredit);
  });
});

describe("calculateYearEndClosing - COST_CENTER_REQUIRED", () => {
  it("refuses a NULL-centre temporary line on a requires-centre account", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("5100", "EXPENSE", "100", "0", null, true),
    ];
    expect(errOf(run(balances))).toBe("COST_CENTER_REQUIRED");
  });

  it("refuses an absent centre on a requires-centre account (same as null)", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A, true),
      bal("5100", "EXPENSE", "100", "0", undefined, true),
    ];
    expect(errOf(run(balances))).toBe("COST_CENTER_REQUIRED");
  });

  it("refuses a NULL-centre line whose net is zero (lines are checked, not only nets)", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("5100", "EXPENSE", "100", "0", CC_A),
      bal("5100", "EXPENSE", "50", "50", null, true),
    ];
    expect(errOf(run(balances))).toBe("COST_CENTER_REQUIRED");
  });

  it("refuses a NULL-centre temporary line when the retained earnings account requires a centre", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("5100", "EXPENSE", "100", "0", null),
    ];
    expect(errOf(run(balances, true))).toBe("COST_CENTER_REQUIRED");
  });

  it("does not refuse a NULL-centre line on a non-requires account when the RE account does not require a centre", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("5100", "EXPENSE", "100", "0", null, false),
    ];
    const r = okOf(run(balances));
    // The NULL-centre expense line and the NULL-centre retained earnings line are the only lines without a centre.
    expect(r.lines.filter((l) => l.costCentreId === undefined)).toHaveLength(2);
  });
});

describe("calculateYearEndClosing - invalid cost centre input", () => {
  it.each([
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
    ["a non-string value", 42],
  ])("refuses %s as COST_CENTRE_INVALID", (_label, value) => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", value as unknown as string),
      bal("1110", "ASSET", "100", "0"),
    ];
    expect(errOf(run(balances))).toBe("COST_CENTRE_INVALID");
  });

  it("accepts an id that is not in cost_centers: existence is a database check (close_fiscal_year), not a calculator check", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", "99999999-9999-4999-8999-999999999999"),
      bal("1110", "ASSET", "100", "0"),
    ];
    expect(run(balances).ok).toBe(true);
  });
});

describe("calculateYearEndClosing - exact decimals per centre", () => {
  it("keeps 0.10 + 0.20 exact across two centres", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "0.10", CC_A),
      bal("4100", "REVENUE", "0", "0.20", CC_B),
      bal("1110", "ASSET", "0.30", "0"),
    ];
    const r = okOf(run(balances));
    expect(r.netIncome).toBe("0.3000");
    expect(r.lines.find((l) => l.costCentreId === CC_A && l.reason === "RETAINED_EARNINGS")?.credit).toBe("0.1000");
    expect(r.lines.find((l) => l.costCentreId === CC_B && l.reason === "RETAINED_EARNINGS")?.credit).toBe("0.2000");
    for (const line of r.lines) {
      expect(line.debit).toMatch(MONEY);
      expect(line.credit).toMatch(MONEY);
    }
  });

  it("keeps 333.33 x 3 exact on one centre and 0.0001 exact on another", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "333.33", CC_A),
      bal("4100", "REVENUE", "0", "333.33", CC_A),
      bal("4100", "REVENUE", "0", "333.33", CC_A),
      bal("4100", "REVENUE", "0", "0.0001", CC_B),
      bal("1110", "ASSET", "999.9901", "0"),
    ];
    const r = okOf(run(balances));
    expect(r.netIncome).toBe("999.9901");
    expect(r.lines.find((l) => l.costCentreId === CC_A && l.reason === "RETAINED_EARNINGS")?.credit).toBe("999.9900");
    expect(r.lines.find((l) => l.costCentreId === CC_B && l.reason === "RETAINED_EARNINGS")?.credit).toBe("0.0001");
  });
});

describe("calculateYearEndClosing - no default centre is ever selected", () => {
  it("leaves costCentreId off every line when no balance has a centre", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "1000"),
      bal("5100", "EXPENSE", "200", "0"),
      bal("1110", "ASSET", "800", "0"),
    ];
    const r = okOf(run(balances));
    for (const line of r.lines) {
      expect(line).not.toHaveProperty("costCentreId");
    }
  });

  it("keeps a NULL-centre group separate and never gives it a centre from a sibling group", () => {
    const balances = [
      bal("5100", "EXPENSE", "100", "0", CC_A),
      bal("5100", "EXPENSE", "50", "0", null),
      bal("4100", "REVENUE", "0", "150"),
      bal("1110", "ASSET", "0", "0"),
    ];
    const r = okOf(run(balances));
    const nullExpenseLines = r.lines.filter((l) => l.accountId === "5100" && l.costCentreId === undefined);
    expect(nullExpenseLines).toHaveLength(1);
    expect(nullExpenseLines[0]).toMatchObject({ debit: "0.0000", credit: "50.0000" });
    expect(r.lines.some((l) => l.accountId === "5100" && l.costCentreId === CC_A)).toBe(true);
  });
});

describe("calculateYearEndClosing - retained earnings line rules", () => {
  it("gives every RE line a centre when the RE account requires one and all temporary lines carry a centre", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "1000", CC_A),
      bal("5100", "EXPENSE", "200", "0", CC_A),
      bal("4100", "REVENUE", "0", "100", CC_B),
      bal("1110", "ASSET", "900", "0"),
    ];
    const r = okOf(run(balances, true));
    const re = r.lines.filter((l) => l.reason === "RETAINED_EARNINGS");
    expect(re).toHaveLength(2);
    for (const line of re) {
      expect(line.costCentreId).toBeDefined();
    }
  });

  it("refuses a RE account id whose category is not EQUITY, even when centres are given", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("1110", "ASSET", "100", "0"),
      bal(RE, "ASSET", "0", "0", CC_A),
    ];
    expect(errOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: RE }))).toBe(
      "RETAINED_EARNINGS_ACCOUNT_INVALID",
    );
  });

  it("keeps the existing shape for a centre-less temporary group: one RE line without costCentreId", () => {
    const balances = [bal("4100", "REVENUE", "0", "100"), bal("1110", "ASSET", "100", "0")];
    const r = okOf(run(balances));
    expect(r.lines.find((l) => l.reason === "RETAINED_EARNINGS")).toEqual({
      accountId: RE,
      debit: "0.0000",
      credit: "100.0000",
      reason: "RETAINED_EARNINGS",
    });
  });

  it("reports INPUT_NOT_BALANCED before any cost centre check", () => {
    const balances = [
      bal("4100", "REVENUE", "0", "100", CC_A),
      bal("5100", "EXPENSE", "90", "0", null, true),
    ];
    expect(errOf(run(balances))).toBe("INPUT_NOT_BALANCED");
  });
});
