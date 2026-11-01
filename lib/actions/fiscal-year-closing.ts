"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { proveTenantPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import {
  calculateYearEndClosing,
  formatMoney,
  parseMoney,
  type AccountBalance,
} from "@/lib/accounting/fiscal-year-closing";
import {
  closingConfirmationMatches,
  type CloseFiscalYearActionResult,
  type ClosingActionFailure,
  type ClosingPreviewActionResult,
  type ClosingPreviewLine,
} from "@/lib/finance/fiscal-year-closing-journey";

const PERIODS_PATH = "/[locale]/admin/finance/periods";
const LEDGER_PAGE_SIZE = 1000;

const previewSchema = z.object({
  organizationId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  locale: z.enum(["ar", "en"]),
});

const closeSchema = previewSchema.extend({
  retainedEarningsAccountId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  confirmation: z.string().min(1).max(30),
  operationKey: z.string().trim().min(1).max(200),
});

const CALCULATION_ERRORS = {
  RETAINED_EARNINGS_ACCOUNT_REQUIRED: "RE_ACCOUNT_REQUIRED",
  RETAINED_EARNINGS_ACCOUNT_INVALID: "RE_ACCOUNT_INVALID",
  INCOMPLETE_BALANCE_DATA: "INCOMPLETE_BALANCE_DATA",
  INPUT_NOT_BALANCED: "ENTRIES_UNBALANCED",
  COST_CENTER_REQUIRED: "COST_CENTER_REQUIRED",
  COST_CENTRE_INVALID: "COST_CENTRE_INVALID",
} as const;

const KNOWN_DATABASE_ERRORS = [
  "FORBIDDEN_CLOSE_PERMISSION",
  "AUTHENTICATION_REQUIRED",
  "INVALID_INPUT",
  "ORG_NOT_ACTIVE",
  "FISCAL_YEAR_NOT_FOUND",
  "OPERATION_KEY_REUSED",
  "ALREADY_CLOSED",
  "PERIOD_NOT_CLOSED",
  "UNREVIEWED_ENTRIES_EXIST",
  "RE_ACCOUNT_REQUIRED",
  "RE_ACCOUNT_INVALID",
  "COST_CENTER_REQUIRED",
  "COST_CENTRE_INVALID",
  "ENTRIES_UNBALANCED",
  "NOTHING_TO_CLOSE",
] as const;

function failure(error: string): ClosingActionFailure {
  return { ok: false, error };
}

function databaseErrorCode(message: string | undefined): string {
  return KNOWN_DATABASE_ERRORS.find((code) => message?.includes(code)) ?? "query_failed";
}

/** PostgREST numeric values can arrive as numbers. The SQL close remains authoritative. */
function databaseMoney(value: number | string): string | null {
  if (typeof value === "string") {
    const parsed = parseMoney(value);
    return parsed === null ? null : formatMoney(parsed);
  }
  return Number.isFinite(value) ? value.toFixed(4) : null;
}

export async function getFiscalYearClosingPreviewAction(input: {
  organizationId: string;
  fiscalYearId: string;
  locale: "ar" | "en";
}): Promise<ClosingPreviewActionResult> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_INPUT");

  const authProof = await proveTenantPermission(parsed.data.organizationId, "finance.years.close");
  if (!authProof.ok) {
    return failure(authProof.error === "unauthorized" ? "unauthorized" : "FORBIDDEN_CLOSE_PERMISSION");
  }

  const supabase = await createClient();
  const [{ data: year, error: yearError }, { data: periods, error: periodsError }] = await Promise.all([
    supabase
      .from("fiscal_years")
      .select("id, name, start_date, end_date, status")
      .eq("id", parsed.data.fiscalYearId)
      .eq("organization_id", parsed.data.organizationId)
      .maybeSingle(),
    supabase
      .from("fiscal_periods")
      .select("id, status")
      .eq("fiscal_year_id", parsed.data.fiscalYearId)
      .eq("organization_id", parsed.data.organizationId),
  ]);

  if (yearError || periodsError) return failure("query_failed");
  if (!year) return failure("FISCAL_YEAR_NOT_FOUND");
  if (year.status === "CLOSED") return failure("ALREADY_CLOSED");
  if (!periods?.length || periods.some((period) => period.status !== "CLOSED" && period.status !== "LOCKED")) {
    return failure("PERIOD_NOT_CLOSED");
  }

  const unreviewed = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", parsed.data.organizationId)
    .gte("entry_date", year.start_date)
    .lte("entry_date", year.end_date)
    .in("status", ["DRAFT", "UNDER_REVIEW"]);
  if (unreviewed.error || unreviewed.count === null) return failure("query_failed");
  if (unreviewed.count > 0) return failure("UNREVIEWED_ENTRIES_EXIST");

  const { data: retained, error: retainedError } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name_ar, name_en, requires_cost_center")
    .eq("organization_id", parsed.data.organizationId)
    .eq("is_retained_earnings", true)
    .maybeSingle();
  if (retainedError) return failure("query_failed");
  if (!retained) return failure("RE_ACCOUNT_REQUIRED");

  const ledgerLines: {
    account_id: string;
    debit: number;
    credit: number;
    cost_center_id: string | null;
  }[] = [];
  let expectedLineCount: number | null = null;

  // Paginate until the exact count is reached. A partial preview is never shown.
  for (let from = 0; expectedLineCount === null || from < expectedLineCount; from += LEDGER_PAGE_SIZE) {
    const page = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit, credit, cost_center_id, journal_entries!inner(id)", { count: "exact" })
      .eq("journal_entries.organization_id", parsed.data.organizationId)
      .gte("journal_entries.entry_date", year.start_date)
      .lte("journal_entries.entry_date", year.end_date)
      .in("journal_entries.status", ["POSTED", "REVERSED"])
      .order("journal_entry_id")
      .order("line_number")
      .range(from, from + LEDGER_PAGE_SIZE - 1);
    if (page.error || page.count === null) return failure("query_failed");
    if (expectedLineCount !== null && page.count !== expectedLineCount) return failure("STALE_VERIFICATION");
    expectedLineCount = page.count;
    for (const line of page.data ?? []) {
      ledgerLines.push({
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
        cost_center_id: line.cost_center_id,
      });
    }
    if ((page.data?.length ?? 0) === 0 && ledgerLines.length < expectedLineCount) {
      return failure("INCOMPLETE_BALANCE_DATA");
    }
  }
  if (ledgerLines.length !== expectedLineCount) return failure("INCOMPLETE_BALANCE_DATA");

  const accountIds = [...new Set([...ledgerLines.map((line) => line.account_id), retained.id])];
  const accounts = new Map<string, {
    id: string;
    code: string;
    name_ar: string;
    name_en: string;
    category: AccountBalance["category"];
    requires_cost_center: boolean;
  }>();
  for (let from = 0; from < accountIds.length; from += 200) {
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category, requires_cost_center")
      .eq("organization_id", parsed.data.organizationId)
      .in("id", accountIds.slice(from, from + 200));
    if (error) return failure("query_failed");
    for (const account of data ?? []) accounts.set(account.id, account);
  }
  if (accounts.size !== accountIds.length) return failure("INCOMPLETE_BALANCE_DATA");

  const balances: AccountBalance[] = [];
  for (const line of ledgerLines) {
    const account = accounts.get(line.account_id);
    const debit = databaseMoney(line.debit);
    const credit = databaseMoney(line.credit);
    if (!account || debit === null || credit === null) return failure("INCOMPLETE_BALANCE_DATA");
    balances.push({
      accountId: line.account_id,
      category: account.category,
      debit,
      credit,
      costCentreId: line.cost_center_id,
      requiresCostCenter: account.requires_cost_center,
    });
  }
  // The pure calculator requires the retained-earnings account in its input;
  // a neutral zero row represents a designated account with no ledger lines.
  if (!balances.some((balance) => balance.accountId === retained.id)) {
    const account = accounts.get(retained.id)!;
    balances.push({
      accountId: retained.id,
      category: account.category,
      debit: "0.0000",
      credit: "0.0000",
      requiresCostCenter: retained.requires_cost_center,
    });
  }

  const calculation = calculateYearEndClosing({
    balances,
    retainedEarningsAccountId: retained.id,
    retainedEarningsRequiresCostCenter: retained.requires_cost_center,
  });
  if (!calculation.ok) return failure(CALCULATION_ERRORS[calculation.error]);
  if (calculation.nothingToClose) return failure("NOTHING_TO_CLOSE");

  const centreIds = [...new Set(calculation.lines.flatMap((line) => line.costCentreId ? [line.costCentreId] : []))];
  for (let from = 0; from < centreIds.length; from += 200) {
    const ids = centreIds.slice(from, from + 200);
    const { data, error } = await supabase
      .from("cost_centers")
      .select("id")
      .eq("organization_id", parsed.data.organizationId)
      .eq("is_active", true)
      .in("id", ids);
    if (error) return failure("query_failed");
    if ((data?.length ?? 0) !== ids.length) return failure("COST_CENTRE_INVALID");
  }

  const lines: ClosingPreviewLine[] = calculation.lines.map((line) => {
    const account = accounts.get(line.accountId)!;
    return {
      accountId: line.accountId,
      accountCode: account.code,
      accountName: parsed.data.locale === "ar" ? account.name_ar || account.name_en : account.name_en || account.name_ar,
      debit: line.debit,
      credit: line.credit,
      reason: line.reason,
      ...(line.costCentreId ? { costCentreId: line.costCentreId } : {}),
    };
  });

  return {
    ok: true,
    preview: {
      fiscalYearId: year.id,
      fiscalYearName: year.name,
      retainedEarningsAccountId: retained.id,
      retainedEarningsAccountLabel: `${retained.code} — ${parsed.data.locale === "ar" ? retained.name_ar || retained.name_en : retained.name_en || retained.name_ar}`,
      periodCount: periods.length,
      postedLineCount: ledgerLines.length,
      lines,
      netIncome: calculation.netIncome,
      totalDebit: calculation.totalDebit,
      totalCredit: calculation.totalCredit,
    },
  };
}

export async function closeFiscalYearAction(input: {
  organizationId: string;
  fiscalYearId: string;
  retainedEarningsAccountId: string;
  reason: string;
  confirmation: string;
  locale: "ar" | "en";
  operationKey: string;
}): Promise<CloseFiscalYearActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_INPUT");
  if (!closingConfirmationMatches(parsed.data.confirmation, parsed.data.locale)) {
    return failure("CONFIRMATION_MISMATCH");
  }

  const authProof = await proveTenantPermission(parsed.data.organizationId, "finance.years.close");
  if (!authProof.ok) {
    return failure(authProof.error === "unauthorized" ? "unauthorized" : "FORBIDDEN_CLOSE_PERMISSION");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_fiscal_year", {
    p_organization_id: parsed.data.organizationId,
    p_fiscal_year_id: parsed.data.fiscalYearId,
    p_retained_earnings_account_id: parsed.data.retainedEarningsAccountId,
    p_reason: parsed.data.reason,
    p_operation_key: parsed.data.operationKey,
  });
  if (error) return failure(databaseErrorCode(error.message));
  if (!data || data.ok !== true) return failure(databaseErrorCode(data?.error_code));
  if (
    typeof data.closing_entry_id !== "string" ||
    typeof data.line_count !== "number" ||
    data.already_closed !== true && data.already_closed !== false
  ) {
    return failure("INVALID_CLOSE_RESULT");
  }
  const netIncome = databaseMoney(data.net_income ?? "");
  if (netIncome === null) return failure("INVALID_CLOSE_RESULT");

  revalidatePath(PERIODS_PATH, "page");
  revalidatePath("/[locale]/finance/journals", "page");
  return {
    ok: true,
    result: {
      alreadyClosed: data.already_closed,
      closingEntryId: data.closing_entry_id,
      lineCount: data.line_count,
      netIncome,
    },
  };
}
