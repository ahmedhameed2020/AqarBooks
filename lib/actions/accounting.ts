"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";

const ACCOUNT_CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const CASH_FLOW_SECTIONS = ["OPERATING", "INVESTING", "FINANCING"] as const;

const createAccountSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(1).max(20),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable(),
  category: z.enum(ACCOUNT_CATEGORIES),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  isGroup: z.boolean(),
  // The cash flow statement reads these two columns off the chart of accounts.
  // Accounts seeded from a template arrive classified; anything added by hand
  // used to land unclassified with no way to fix it, which silently dropped the
  // account from the statement.
  isCashEquivalent: z.boolean(),
  cashFlowSection: z.enum(CASH_FLOW_SECTIONS).nullable(),
});

export async function createAccount(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createAccountSchema.safeParse({
    organizationId: formData.get("organizationId"),
    code: formData.get("code"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    parentId: (formData.get("parentId") as string) || null,
    category: formData.get("category"),
    normalBalance: formData.get("normalBalance"),
    isGroup: formData.get("isGroup") === "on",
    isCashEquivalent: formData.get("isCashEquivalent") === "on",
    cashFlowSection: (formData.get("cashFlowSection") as string) || null,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("chart_of_accounts").insert({
    organization_id: parsed.data.organizationId,
    code: parsed.data.code,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
    parent_id: parsed.data.parentId,
    category: parsed.data.category,
    normal_balance: parsed.data.normalBalance,
    is_group: parsed.data.isGroup,
    is_cash_equivalent: parsed.data.isCashEquivalent,
    cash_flow_section: parsed.data.cashFlowSection,
  });

  if (error) return { ok: false, error: mapAccountError(error) };
  revalidatePath("/[locale]/finance/accounts", "page");
  return { ok: true };
}

/**
 * Postgres messages name constraints and columns, so they are translated to
 * codes the form knows how to render rather than echoed to the browser. RLS
 * denials surface as an empty result rather than an error, which is why the
 * no-rows case below is reported as a permission problem.
 */
function mapAccountError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "duplicate_code";
  if (error.code === "23503") return "invalid_parent";
  if (error.code === "42501") return "forbidden";
  console.error("chart_of_accounts write failed:", error);
  return "write_failed";
}

const updateAccountSchema = z.object({
  accountId: z.string().uuid(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  requiresCostCenter: z.boolean(),
  isCashEquivalent: z.boolean(),
  cashFlowSection: z.enum(CASH_FLOW_SECTIONS).nullable(),
});

export async function updateAccount(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateAccountSchema.safeParse({
    accountId: formData.get("accountId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    parentId: (formData.get("parentId") as string) || null,
    isActive: formData.get("isActive") === "on",
    requiresCostCenter: formData.get("requiresCostCenter") === "on",
    isCashEquivalent: formData.get("isCashEquivalent") === "on",
    cashFlowSection: (formData.get("cashFlowSection") as string) || null,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const { accountId, parentId } = parsed.data;
  if (parentId === accountId) return { ok: false, error: "parent_cycle" };

  const supabase = await createClient();

  // Reparenting can close a loop (A under B, then B under A), which no
  // constraint catches and which makes the tree walk recurse forever. Walk up
  // from the proposed parent and refuse if this account is already an ancestor.
  if (parentId) {
    const { data: rows, error: readError } = await supabase
      .from("chart_of_accounts")
      .select("id, parent_id");
    if (readError) return { ok: false, error: mapAccountError(readError) };

    const parentOf = new Map((rows ?? []).map((r) => [r.id, r.parent_id]));
    let cursor: string | null | undefined = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === accountId) return { ok: false, error: "parent_cycle" };
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .update({
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      parent_id: parentId,
      is_active: parsed.data.isActive,
      requires_cost_center: parsed.data.requiresCostCenter,
      is_cash_equivalent: parsed.data.isCashEquivalent,
      cash_flow_section: parsed.data.cashFlowSection,
    })
    .eq("id", accountId)
    .select("id");

  if (error) return { ok: false, error: mapAccountError(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };

  revalidatePath("/[locale]/finance/accounts", "page");
  return { ok: true };
}

export async function cloneCoaTemplateAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const organizationId = formData.get("organizationId");
  const templateKey = formData.get("templateKey");
  if (typeof organizationId !== "string" || typeof templateKey !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("clone_chart_of_accounts_template", {
    p_organization_id: organizationId,
    p_template_key: templateKey,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/accounts", "page");
  return { ok: true };
}

const createFiscalYearSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function createFiscalYearAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createFiscalYearSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_fiscal_year", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/admin/finance/periods", "page");
  return { ok: true };
}

const periodStatusSchema = z.object({
  fiscalPeriodId: z.string().uuid(),
  status: z.enum(["PLANNED", "OPEN", "CLOSED", "LOCKED"]),
  reason: z.string().max(500).optional(),
});

export async function setFiscalPeriodStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = periodStatusSchema.safeParse({
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_fiscal_period_status", {
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/admin/finance/periods", "page");
  return { ok: true };
}

const journalLineSchema = z.object({
  account_id: z.string().uuid(),
  description: z.string().optional(),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  cost_center_id: z.string().uuid().optional(),
});

const createJournalEntrySchema = z.object({
  organizationId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  entryDate: z.string().min(1),
  description: z.string().min(1).max(500),
  lines: z.array(journalLineSchema).min(1),
});

export async function createJournalEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "invalid_input" };
  }

  const parsed = createJournalEntrySchema.safeParse({
    organizationId: formData.get("organizationId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
    entryDate: formData.get("entryDate"),
    description: formData.get("description"),
    lines: linesRaw,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data: entryId, error } = await supabase.rpc("create_journal_entry", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: null,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
    p_entry_date: parsed.data.entryDate,
    p_description: parsed.data.description,
    p_source_type: "JOURNAL_VOUCHER",
    p_lines: parsed.data.lines,
    p_idempotency_key: randomUUID(),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/journals", "page");
  if (entryId) return { ok: true };
  return { ok: false, error: "unknown_error" };
}

export async function submitForReviewAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("journalEntryId");
  if (typeof id !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_journal_entry_for_review", {
    p_journal_entry_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/journals/[id]", "page");
  return { ok: true };
}

export async function postJournalEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("journalEntryId");
  if (typeof id !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_journal_entry", {
    p_journal_entry_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/journals/[id]", "page");
  return { ok: true };
}

const reverseSchema = z.object({
  journalEntryId: z.string().uuid(),
  reversalFiscalPeriodId: z.string().uuid(),
  reversalDate: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function reverseJournalEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reverseSchema.safeParse({
    journalEntryId: formData.get("journalEntryId"),
    reversalFiscalPeriodId: formData.get("reversalFiscalPeriodId"),
    reversalDate: formData.get("reversalDate"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_journal_entry", {
    p_journal_entry_id: parsed.data.journalEntryId,
    p_reversal_fiscal_period_id: parsed.data.reversalFiscalPeriodId,
    p_reversal_date: parsed.data.reversalDate,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/journals/[id]", "page");
  return { ok: true };
}

// Budget entry. One row per (organization, fiscal period, account); the
// unique constraint on that triple is what makes the upsert idempotent, so
// re-submitting the form overwrites rather than duplicating.
//
// A blank input means "no budget set for this account" and DELETES any
// existing row -- distinct from an explicit 0, which is a real budget of
// zero and is stored. Writes go through the caller's own session so the
// budgets_manage RLS policy (finance.budgets.manage + active org) is the
// authorization boundary; there is no service-role bypass here.
const saveBudgetsSchema = z.object({
  organizationId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
});

export async function saveBudgets(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = saveBudgetsSchema.safeParse({
    organizationId: formData.get("organizationId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { organizationId, fiscalPeriodId } = parsed.data;

  const upserts: { organization_id: string; fiscal_period_id: string; account_id: string; amount: number }[] = [];
  const deletes: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("amount_")) continue;
    const accountId = key.slice("amount_".length);
    if (!z.string().uuid().safeParse(accountId).success) continue;

    const raw = String(value).trim();
    if (raw === "") {
      deletes.push(accountId);
      continue;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "invalid_amount" };
    upserts.push({
      organization_id: organizationId,
      fiscal_period_id: fiscalPeriodId,
      account_id: accountId,
      amount,
    });
  }

  const supabase = await createClient();

  if (deletes.length > 0) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("organization_id", organizationId)
      .eq("fiscal_period_id", fiscalPeriodId)
      .in("account_id", deletes);
    if (error) return { ok: false, error: error.message };
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("budgets")
      .upsert(upserts, { onConflict: "organization_id,fiscal_period_id,account_id" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/finance/budgets", "page");
  revalidatePath("/[locale]/finance/reports/budget-vs-actual", "page");
  return { ok: true };
}

// Sweep dues whose fiscal period has since opened into the general ledger.
//
// Dues dated beyond any open period -- future installments, chiefly -- are
// issued but deliberately left unrecognised, since recognising two years of
// installments on the day a plan is created would overstate revenue. Opening
// the period they belong to is what makes them this period's revenue, so this
// is the action that completes that. It is idempotent: already-recognised and
// still-deferred dues are both no-ops.
export async function recognizePendingDuesAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const organizationId = formData.get("organizationId");
  const fiscalPeriodId = formData.get("fiscalPeriodId");
  if (typeof organizationId !== "string" || typeof fiscalPeriodId !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("recognize_pending_dues", {
    p_organization_id: organizationId,
    p_fiscal_period_id: fiscalPeriodId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/admin/finance/periods", "page");
  return { ok: true };
}
