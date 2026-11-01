import { describe, it, expect } from "vitest";
import {
  calculateYearEndClosing,
  type AccountBalance,
  type AccountCategory,
  type ClosingResult,
} from "@/lib/accounting/fiscal-year-closing";

const MONEY = /^-?\d+\.\d{4}$/;

function bal(
  accountId: string,
  category: AccountCategory,
  debit: string,
  credit: string,
): AccountBalance {
  return { accountId, category, debit, credit };
}

function okOf(r: ClosingResult) {
  if (!r.ok) throw new Error(`expected ok result, got error ${r.error}`);
  return r;
}

function errOf(r: ClosingResult): string {
  if (r.ok) throw new Error("expected error result, got ok");
  return r.error;
}

function moneyFields(r: ReturnType<typeof okOf>): string[] {
  return [
    r.netIncome,
    r.totalDebit,
    r.totalCredit,
    ...r.lines.flatMap((l) => [l.debit, l.credit]),
  ];
}

describe("calculateYearEndClosing - profit year", () => {
  const balances = [
    bal("4100", "REVENUE", "0", "1000"),
    bal("5100", "EXPENSE", "200", "0"),
    bal("1110", "ASSET", "800", "0"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it("emits one closing line per temporary account", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const temporaryLines = r.lines.filter((l) => l.reason === "CLOSE_TEMPORARY");
    expect(temporaryLines.map((l) => l.accountId).sort()).toEqual(["4100", "5100"]);
    expect(r.lines).toHaveLength(3);
  });

  it("zeroes revenue with a debit and expense with a credit", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const rev = r.lines.find((l) => l.accountId === "4100");
    const exp = r.lines.find((l) => l.accountId === "5100");
    expect(rev).toMatchObject({ debit: "1000.0000", credit: "0.0000", reason: "CLOSE_TEMPORARY" });
    expect(exp).toMatchObject({ debit: "0.0000", credit: "200.0000", reason: "CLOSE_TEMPORARY" });
  });

  it("credits retained earnings with the net profit", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const re = r.lines.find((l) => l.reason === "RETAINED_EARNINGS");
    expect(re).toEqual({
      accountId: "3100",
      debit: "0.0000",
      credit: "800.0000",
      reason: "RETAINED_EARNINGS",
    });
    expect(r.netIncome).toBe("800.0000");
  });

  it("produces totals that are equal", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    expect(r.totalDebit).toBe(r.totalCredit);
    expect(r.totalDebit).toBe("1000.0000");
    expect(r.nothingToClose).toBe(false);
  });
});

describe("calculateYearEndClosing - loss year", () => {
  const balances = [
    bal("4100", "REVENUE", "0", "100"),
    bal("5100", "EXPENSE", "300", "0"),
    bal("2100", "LIABILITY", "0", "200"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it("debits retained earnings by the net loss", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const re = r.lines.find((l) => l.reason === "RETAINED_EARNINGS");
    expect(re).toEqual({
      accountId: "3100",
      debit: "200.0000",
      credit: "0.0000",
      reason: "RETAINED_EARNINGS",
    });
  });

  it("reports a negative netIncome and balanced totals", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    expect(r.netIncome).toBe("-200.0000");
    expect(r.totalDebit).toBe("300.0000");
    expect(r.totalCredit).toBe("300.0000");
  });
});

describe("calculateYearEndClosing - tie", () => {
  // Choice: a tie posts no retained-earnings amount. The temporary accounts still
  // need closing lines, so the RE line is asserted only as absent-or-zero.
  const balances = [
    bal("4100", "REVENUE", "0", "500"),
    bal("5100", "EXPENSE", "500", "0"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it("gives a netIncome of zero", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    expect(r.netIncome).toBe("0.0000");
  });

  it("posts no retained-earnings amount", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const re = r.lines.find((l) => l.reason === "RETAINED_EARNINGS");
    if (re) {
      expect(re.debit).toBe("0.0000");
      expect(re.credit).toBe("0.0000");
    }
  });

  it("still closes the temporary accounts and keeps totals balanced", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    expect(r.lines.filter((l) => l.reason === "CLOSE_TEMPORARY")).toHaveLength(2);
    expect(r.totalDebit).toBe("500.0000");
    expect(r.totalCredit).toBe("500.0000");
    expect(r.nothingToClose).toBe(false);
  });
});

describe("calculateYearEndClosing - nothing to close", () => {
  const balances = [
    bal("4100", "REVENUE", "0", "0"),
    bal("5100", "EXPENSE", "0", "0"),
    bal("1110", "ASSET", "250", "0"),
    bal("3100", "EQUITY", "0", "0"),
  ];
  // Balanced because the ASSET debit is offset here by an equal EQUITY credit.
  const balancedBalances = [
    bal("4100", "REVENUE", "0", "0"),
    bal("5100", "EXPENSE", "0", "0"),
    bal("1110", "ASSET", "250", "0"),
    bal("3000", "EQUITY", "0", "250"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it("returns ok with no lines and nothingToClose true", () => {
    const r = okOf(calculateYearEndClosing({ balances: balancedBalances, retainedEarningsAccountId: "3100" }));
    expect(r.lines).toEqual([]);
    expect(r.nothingToClose).toBe(true);
    expect(r.netIncome).toBe("0.0000");
  });

  it("reports zero totals when all temporary accounts are zero", () => {
    const r = okOf(calculateYearEndClosing({ balances: balancedBalances, retainedEarningsAccountId: "3100" }));
    expect(r.totalDebit).toBe("0.0000");
    expect(r.totalCredit).toBe("0.0000");
  });

  it("is unbalanced when the offsetting equity is omitted (guard for the fixture above)", () => {
    expect(errOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }))).toBe(
      "INPUT_NOT_BALANCED",
    );
  });
});

describe("calculateYearEndClosing - permanent accounts are never closed", () => {
  const balances = [
    bal("1110", "ASSET", "500", "0"),
    bal("2100", "LIABILITY", "0", "300"),
    bal("3000", "EQUITY", "0", "0"),
    bal("3100", "EQUITY", "0", "0"),
    bal("4100", "REVENUE", "0", "200"),
  ];

  it("produces lines only for the revenue account and retained earnings", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    expect(r.lines.map((l) => l.accountId).sort()).toEqual(["3100", "4100"]);
  });

  it("never references the cash, liability or non-RE equity account in any line", () => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    const ids = r.lines.map((l) => l.accountId);
    expect(ids).not.toContain("1110");
    expect(ids).not.toContain("2100");
    expect(ids).not.toContain("3000");
  });
});

describe("calculateYearEndClosing - exact decimal math", () => {
  it("sums 0.10 and 0.20 to exactly 0.3000", () => {
    const r = okOf(
      calculateYearEndClosing({
        balances: [
          bal("4100", "REVENUE", "0", "0.10"),
          bal("4200", "REVENUE", "0", "0.20"),
          bal("1110", "ASSET", "0.30", "0"),
          bal("3100", "EQUITY", "0", "0"),
        ],
        retainedEarningsAccountId: "3100",
      }),
    );
    expect(r.netIncome).toBe("0.3000");
    expect(r.totalDebit).toBe("0.3000");
    expect(r.totalCredit).toBe("0.3000");
  });

  it("sums 333.33 three times to exactly 999.9900", () => {
    const r = okOf(
      calculateYearEndClosing({
        balances: [
          bal("4100", "REVENUE", "0", "333.33"),
          bal("4200", "REVENUE", "0", "333.33"),
          bal("4300", "REVENUE", "0", "333.33"),
          bal("1110", "ASSET", "999.99", "0"),
          bal("3100", "EQUITY", "0", "0"),
        ],
        retainedEarningsAccountId: "3100",
      }),
    );
    expect(r.netIncome).toBe("999.9900");
  });

  it("preserves a 4-decimal input of 0.0001", () => {
    const r = okOf(
      calculateYearEndClosing({
        balances: [
          bal("4100", "REVENUE", "0", "0.0001"),
          bal("1110", "ASSET", "0.0001", "0"),
          bal("3100", "EQUITY", "0", "0"),
        ],
        retainedEarningsAccountId: "3100",
      }),
    );
    expect(r.netIncome).toBe("0.0001");
    const rev = r.lines.find((l) => l.accountId === "4100");
    expect(rev?.debit).toBe("0.0001");
  });

  it("rejects a 5-decimal input of 0.00001 as INCOMPLETE_BALANCE_DATA", () => {
    const r = calculateYearEndClosing({
      balances: [
        bal("4100", "REVENUE", "0", "0.00001"),
        bal("1110", "ASSET", "0.00001", "0"),
        bal("3100", "EQUITY", "0", "0"),
      ],
      retainedEarningsAccountId: "3100",
    });
    expect(errOf(r)).toBe("INCOMPLETE_BALANCE_DATA");
  });
});

describe("calculateYearEndClosing - retained earnings account validation", () => {
  const base = [
    bal("4100", "REVENUE", "0", "100"),
    bal("1110", "ASSET", "100", "0"),
    bal("3000", "EQUITY", "0", "0"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it.each([null, undefined, ""])("rejects a missing RE account id (%s) as REQUIRED", (id) => {
    const r = calculateYearEndClosing({
      balances: base,
      retainedEarningsAccountId: id as string | null | undefined,
    });
    expect(errOf(r)).toBe("RETAINED_EARNINGS_ACCOUNT_REQUIRED");
  });

  it("rejects an RE id that is not in balances as INVALID", () => {
    const r = calculateYearEndClosing({ balances: base, retainedEarningsAccountId: "9999" });
    expect(errOf(r)).toBe("RETAINED_EARNINGS_ACCOUNT_INVALID");
  });

  it("rejects an RE id whose category is REVENUE as INVALID", () => {
    const r = calculateYearEndClosing({ balances: base, retainedEarningsAccountId: "4100" });
    expect(errOf(r)).toBe("RETAINED_EARNINGS_ACCOUNT_INVALID");
  });

  it("rejects an RE id whose category is ASSET as INVALID", () => {
    const r = calculateYearEndClosing({ balances: base, retainedEarningsAccountId: "1110" });
    expect(errOf(r)).toBe("RETAINED_EARNINGS_ACCOUNT_INVALID");
  });

  it("does not fall back to code 3100 or the first EQUITY account when the id is missing", () => {
    // 3100 is listed first and is an EQUITY account; the function must still refuse.
    const withTrap = [
      bal("3100", "EQUITY", "0", "0"),
      bal("3000", "EQUITY", "0", "0"),
      bal("4100", "REVENUE", "0", "100"),
      bal("1110", "ASSET", "100", "0"),
    ];
    expect(
      errOf(calculateYearEndClosing({ balances: withTrap, retainedEarningsAccountId: null })),
    ).toBe("RETAINED_EARNINGS_ACCOUNT_REQUIRED");
  });

  it("uses the explicit RE id when there are two EQUITY accounts", () => {
    const twoEquity = [
      bal("3000", "EQUITY", "0", "0"),
      bal("3100", "EQUITY", "0", "0"),
      bal("3200", "EQUITY", "0", "0"),
      bal("4100", "REVENUE", "0", "100"),
      bal("1110", "ASSET", "100", "0"),
    ];
    const r = okOf(calculateYearEndClosing({ balances: twoEquity, retainedEarningsAccountId: "3200" }));
    const re = r.lines.find((l) => l.reason === "RETAINED_EARNINGS");
    expect(re?.accountId).toBe("3200");
    expect(r.lines.map((l) => l.accountId)).not.toContain("3100");
    expect(r.lines.map((l) => l.accountId)).not.toContain("3000");
  });
});

describe("calculateYearEndClosing - incomplete balance data", () => {
  // Decision: debit and credit must be non-negative decimal strings with at most
  // 4 decimals. A negative amount is rejected because the sign is carried by the
  // side (debit vs credit), so "-5" is treated as incomplete data.
  const valid = (overrides: Partial<AccountBalance>, index = 0): AccountBalance[] => {
    const list = [
      bal("4100", "REVENUE", "0", "100"),
      bal("1110", "ASSET", "100", "0"),
      bal("3100", "EQUITY", "0", "0"),
    ];
    list[index] = { ...list[index], ...overrides };
    return list;
  };

  it("rejects an empty accountId", () => {
    const r = calculateYearEndClosing({
      balances: valid({ accountId: "" }, 0),
      retainedEarningsAccountId: "3100",
    });
    expect(errOf(r)).toBe("INCOMPLETE_BALANCE_DATA");
  });

  it("rejects an unknown category", () => {
    const r = calculateYearEndClosing({
      balances: valid({ category: "FOO" as any }, 0),
      retainedEarningsAccountId: "3100",
    });
    expect(errOf(r)).toBe("INCOMPLETE_BALANCE_DATA");
  });

  it.each([
    ["non-numeric text", "abc"],
    ["empty string", ""],
    ["thousands separator", "1,000.00"],
    ["negative sign", "-5"],
  ])("rejects a debit that is %s", (_label, value) => {
    const r = calculateYearEndClosing({
      balances: valid({ debit: value }, 1),
      retainedEarningsAccountId: "3100",
    });
    expect(errOf(r)).toBe("INCOMPLETE_BALANCE_DATA");
  });
});

describe("calculateYearEndClosing - input balance", () => {
  it("returns INPUT_NOT_BALANCED when total debits differ from total credits", () => {
    const r = calculateYearEndClosing({
      balances: [
        bal("4100", "REVENUE", "0", "100"),
        bal("1110", "ASSET", "90", "0"),
        bal("3100", "EQUITY", "0", "0"),
      ],
      retainedEarningsAccountId: "3100",
    });
    expect(errOf(r)).toBe("INPUT_NOT_BALANCED");
  });
});

describe("calculateYearEndClosing - determinism and immutability", () => {
  const balances = [
    bal("4100", "REVENUE", "0", "1000"),
    bal("5100", "EXPENSE", "200", "0"),
    bal("1110", "ASSET", "800", "0"),
    bal("3100", "EQUITY", "0", "0"),
  ];

  it("returns deep-equal output for identical input", () => {
    const a = calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" });
    const b = calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" });
    expect(b).toEqual(a);
  });

  it("does not mutate the input balances", () => {
    const before = structuredClone(balances);
    calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" });
    expect(balances).toEqual(before);
  });
});

describe("calculateYearEndClosing - output format", () => {
  const samples: Array<{ name: string; balances: AccountBalance[] }> = [
    {
      name: "profit",
      balances: [
        bal("4100", "REVENUE", "0", "1000"),
        bal("5100", "EXPENSE", "200", "0"),
        bal("1110", "ASSET", "800", "0"),
        bal("3100", "EQUITY", "0", "0"),
      ],
    },
    {
      name: "loss",
      balances: [
        bal("4100", "REVENUE", "0", "100"),
        bal("5100", "EXPENSE", "300", "0"),
        bal("2100", "LIABILITY", "0", "200"),
        bal("3100", "EQUITY", "0", "0"),
      ],
    },
    {
      name: "tie",
      balances: [
        bal("4100", "REVENUE", "0", "500"),
        bal("5100", "EXPENSE", "500", "0"),
        bal("3100", "EQUITY", "0", "0"),
      ],
    },
  ];

  it.each(samples)("every money string has exactly 4 decimals and is not -0.0000 ($name)", ({ balances }) => {
    const r = okOf(calculateYearEndClosing({ balances, retainedEarningsAccountId: "3100" }));
    for (const value of moneyFields(r)) {
      expect(value).toMatch(MONEY);
      expect(value).not.toBe("-0.0000");
    }
  });
});
