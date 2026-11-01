/**
 * Fiscal year-end closing calculation.
 *
 * Pure functions only: no I/O, no Supabase, no React.
 *
 * Money is held as a BigInt scaled by 10^4 to match the database's numeric(19,4).
 * Never convert money to Number or use floating-point arithmetic on it.
 *
 * Note: the target is ES2017, so BigInt literals (`0n`) are not used; BigInt(0) is.
 */

/** Exact money value: the real amount multiplied by 10^4. */
export type Money = bigint;

const SCALE_DIGITS = 4;
const SCALE = BigInt(10000);
const ZERO = BigInt(0);

/** Optional minus, one or more digits, optional fraction of 1 to 4 digits. */
const MONEY_PATTERN = /^-?\d+(?:\.\d{1,4})?$/;

/**
 * Strictly parses a decimal string such as "1234.5", "-0.10" or "0".
 * Returns null for anything else (exponents, commas, spaces, NaN, Infinity,
 * more than 4 decimals, a missing digit before or after the dot, or a non-string).
 */
export function parseMoney(input: string): Money | null {
  if (typeof input !== "string" || !MONEY_PATTERN.test(input)) {
    return null;
  }
  const negative = input.startsWith("-");
  const unsigned = negative ? input.slice(1) : input;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const scaled =
    BigInt(intPart) * SCALE + BigInt(fracPart.padEnd(SCALE_DIGITS, "0"));
  return negative ? -scaled : scaled;
}

/** Formats as a plain decimal string with exactly 4 decimals, e.g. "800.0000". */
export function formatMoney(value: Money): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const intPart = (abs / SCALE).toString();
  const fracPart = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0");
  const body = `${intPart}.${fracPart}`;
  // A BigInt has no negative zero, so "-0.0000" cannot be produced here.
  return negative ? `-${body}` : body;
}

export function addMoney(a: Money, b: Money): Money {
  return a + b;
}

export function subMoney(a: Money, b: Money): Money {
  return a - b;
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export type AccountCategory = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type AccountBalance = {
  accountId: string;
  category: AccountCategory;
  debit: string;
  credit: string;
  /**
   * Cost centre of this balance row. Omitted or null means the row carries no cost centre.
   * A present value must be a non-blank string; existence and activity are checked in the database.
   */
  costCentreId?: string | null;
  /** Mirrors chart_of_accounts.requires_cost_center. Omitted means false. */
  requiresCostCenter?: boolean;
};
/**
 * costCentreId is present only on lines that carry a cost centre, so balances without
 * cost centres produce exactly the same line objects as before.
 */
export type ClosingLine = {
  accountId: string;
  debit: string;
  credit: string;
  reason: "CLOSE_TEMPORARY" | "RETAINED_EARNINGS";
  costCentreId?: string;
};
export type ClosingError =
  | "RETAINED_EARNINGS_ACCOUNT_REQUIRED"
  | "RETAINED_EARNINGS_ACCOUNT_INVALID" // not EQUITY, or is also present as a temporary account
  | "INCOMPLETE_BALANCE_DATA" // missing accountId, unknown category, or a non-money string
  | "INPUT_NOT_BALANCED" // sum of debits != sum of credits across all input balances
  | "COST_CENTER_REQUIRED" // a NULL-centre temporary line on a requires-centre account, or a NULL-centre line when the RE account requires one
  | "COST_CENTRE_INVALID"; // a cost centre id that is blank or not a string
export type ClosingResult =
  | { ok: true; lines: ClosingLine[]; netIncome: string; totalDebit: string; totalCredit: string; nothingToClose: boolean }
  | { ok: false; error: ClosingError };

const CATEGORIES: ReadonlySet<string> = new Set<string>(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]);

function isCategory(value: unknown): value is AccountCategory {
  return typeof value === "string" && CATEGORIES.has(value);
}

function maxZero(value: Money): Money {
  return value > ZERO ? value : ZERO;
}

type ValidBalance = {
  accountId: string;
  category: AccountCategory;
  debit: Money;
  credit: Money;
  costCentreId: string | null;
  requiresCostCenter: boolean;
};

type PendingLine = {
  accountId: string;
  costCentreId: string | null;
  debit: Money;
  credit: Money;
  reason: ClosingLine["reason"];
};

/** Map key for a cost centre; NULL gets its own key and is never confused with an id. */
function centreKey(costCentreId: string | null): string {
  return costCentreId === null ? "\u0000NULL" : `id:${costCentreId}`;
}

/**
 * Computes the closing entries that zero out REVENUE and EXPENSE accounts into
 * the retained earnings account.
 *
 * Sign convention: net = debit - credit. Revenue normally has a credit balance
 * (net < 0) and expenses a debit balance (net > 0). T is the sum of all temporary
 * nets, so netIncome = -T is positive for a profit and negative for a loss.
 * Retained earnings is credited by a profit (T < 0) and debited by a loss (T > 0).
 *
 * Cost centres: temporary balances are aggregated per (account, costCentreId). Each
 * account and centre pair closes on its own line. The retained earnings line is then
 * produced per cost centre, with that centre's own total T(k), so every centre closes
 * to its own retained earnings balance. A centre whose T(k) is zero gets no line.
 * A NULL centre is a separate group and is never assigned a default centre.
 */
export function calculateYearEndClosing(input: {
  balances: AccountBalance[];
  retainedEarningsAccountId: string | null | undefined;
  /** Mirrors chart_of_accounts.requires_cost_center for the retained earnings account. Omitted means false. */
  retainedEarningsRequiresCostCenter?: boolean;
}): ClosingResult {
  const retainedEarningsAccountId = input.retainedEarningsAccountId;
  if (typeof retainedEarningsAccountId !== "string" || retainedEarningsAccountId.trim() === "") {
    return { ok: false, error: "RETAINED_EARNINGS_ACCOUNT_REQUIRED" };
  }

  // 1. Validate every balance and parse its money values.
  const valid: ValidBalance[] = [];
  for (const balance of input.balances) {
    if (
      typeof balance.accountId !== "string" ||
      balance.accountId.trim() === "" ||
      !isCategory(balance.category)
    ) {
      return { ok: false, error: "INCOMPLETE_BALANCE_DATA" };
    }
    const debit = parseMoney(balance.debit);
    const credit = parseMoney(balance.credit);
    if (debit === null || credit === null) {
      return { ok: false, error: "INCOMPLETE_BALANCE_DATA" };
    }
    // Debit and credit columns are non-negative by definition; a negative entry is incomplete data.
    if (compareMoney(debit, ZERO) < 0 || compareMoney(credit, ZERO) < 0) {
      return { ok: false, error: "INCOMPLETE_BALANCE_DATA" };
    }
    // Absent or null means no cost centre. A present value must be a non-blank string.
    let costCentreId: string | null = null;
    if (balance.costCentreId !== undefined && balance.costCentreId !== null) {
      if (typeof balance.costCentreId !== "string" || balance.costCentreId.trim() === "") {
        return { ok: false, error: "COST_CENTRE_INVALID" };
      }
      costCentreId = balance.costCentreId;
    }
    valid.push({
      accountId: balance.accountId,
      category: balance.category,
      debit,
      credit,
      costCentreId,
      requiresCostCenter: balance.requiresCostCenter === true,
    });
  }

  // Input must balance across permanent and temporary accounts.
  let inputDebit = ZERO;
  let inputCredit = ZERO;
  for (const balance of valid) {
    inputDebit = addMoney(inputDebit, balance.debit);
    inputCredit = addMoney(inputCredit, balance.credit);
  }
  if (compareMoney(inputDebit, inputCredit) !== 0) {
    return { ok: false, error: "INPUT_NOT_BALANCED" };
  }

  // 2. The retained earnings account must exist and be EQUITY only. Any entry
  // with the same id in another category (REVENUE/EXPENSE included) is invalid.
  let retainedEarningsFound = false;
  for (const balance of valid) {
    if (balance.accountId !== retainedEarningsAccountId) continue;
    if (balance.category !== "EQUITY") {
      return { ok: false, error: "RETAINED_EARNINGS_ACCOUNT_INVALID" };
    }
    retainedEarningsFound = true;
  }
  if (!retainedEarningsFound) {
    return { ok: false, error: "RETAINED_EARNINGS_ACCOUNT_INVALID" };
  }

  // 3. Cost centre requirements. Checked before anything is produced; no default centre is ever chosen.
  //    Every temporary row with a NULL centre is checked, whatever its net, because it is a posted line.
  let hasNullCentreTemporary = false;
  for (const balance of valid) {
    if (balance.category !== "REVENUE" && balance.category !== "EXPENSE") continue;
    if (balance.costCentreId !== null) continue;
    if (balance.requiresCostCenter) {
      return { ok: false, error: "COST_CENTER_REQUIRED" };
    }
    hasNullCentreTemporary = true;
  }
  // The retained earnings line would carry NULL too, so a requires-centre RE account refuses it.
  if (input.retainedEarningsRequiresCostCenter === true && hasNullCentreTemporary) {
    return { ok: false, error: "COST_CENTER_REQUIRED" };
  }

  // 4. Aggregate temporary balances per (account, cost centre), keeping first-seen order.
  //    Each group's net is debit - credit; T(k) per centre is the sum of its groups' nets.
  const groups = new Map<string, { accountId: string; costCentreId: string | null; net: Money }>();
  const centreTotals = new Map<string, { costCentreId: string | null; total: Money }>();
  let temporaryNetTotal = ZERO; // T = sum of (debit - credit) over temporary accounts
  for (const balance of valid) {
    if (balance.category !== "REVENUE" && balance.category !== "EXPENSE") continue;
    const net = subMoney(balance.debit, balance.credit);
    const key = `${balance.accountId}\u0001${balance.category}\u0001${centreKey(balance.costCentreId)}`;
    const group = groups.get(key);
    if (group) {
      group.net = addMoney(group.net, net);
    } else {
      groups.set(key, { accountId: balance.accountId, costCentreId: balance.costCentreId, net });
    }
    const centre = centreTotals.get(centreKey(balance.costCentreId));
    if (centre) {
      centre.total = addMoney(centre.total, net);
    } else {
      centreTotals.set(centreKey(balance.costCentreId), { costCentreId: balance.costCentreId, total: net });
    }
    temporaryNetTotal = addMoney(temporaryNetTotal, net);
  }

  // 5. Close each non-zero temporary group.
  const pending: PendingLine[] = [];
  for (const group of groups.values()) {
    if (group.net === ZERO) continue;
    pending.push({
      accountId: group.accountId,
      costCentreId: group.costCentreId,
      debit: maxZero(-group.net),
      credit: maxZero(group.net),
      reason: "CLOSE_TEMPORARY",
    });
  }

  // 6. Nothing to close.
  if (pending.length === 0) {
    return {
      ok: true,
      lines: [],
      netIncome: formatMoney(ZERO),
      totalDebit: formatMoney(ZERO),
      totalCredit: formatMoney(ZERO),
      nothingToClose: true,
    };
  }

  // 7. Retained earnings: one line per cost centre with a non-zero total. A tie (T(k) = 0) produces no line.
  for (const centre of centreTotals.values()) {
    if (centre.total === ZERO) continue;
    pending.push({
      accountId: retainedEarningsAccountId,
      costCentreId: centre.costCentreId,
      debit: maxZero(centre.total),
      credit: maxZero(-centre.total),
      reason: "RETAINED_EARNINGS",
    });
  }

  // 8. Totals must match. Unreachable when the input is balanced; kept as a guard.
  let totalDebit = ZERO;
  let totalCredit = ZERO;
  for (const line of pending) {
    totalDebit = addMoney(totalDebit, line.debit);
    totalCredit = addMoney(totalCredit, line.credit);
  }
  if (compareMoney(totalDebit, totalCredit) !== 0) {
    return { ok: false, error: "INPUT_NOT_BALANCED" };
  }

  return {
    ok: true,
    lines: pending.map((line) => {
      const out: ClosingLine = {
        accountId: line.accountId,
        debit: formatMoney(line.debit),
        credit: formatMoney(line.credit),
        reason: line.reason,
      };
      if (line.costCentreId !== null) {
        out.costCentreId = line.costCentreId;
      }
      return out;
    }),
    netIncome: formatMoney(-temporaryNetTotal),
    totalDebit: formatMoney(totalDebit),
    totalCredit: formatMoney(totalCredit),
    nothingToClose: false,
  };
}
