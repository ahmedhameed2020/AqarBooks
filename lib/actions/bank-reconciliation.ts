"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const REVALIDATE = "/[locale]/finance/banks/reconciliation";

const createStatementSchema = z.object({
  organizationId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  openingBalance: z.coerce.number(),
  closingBalance: z.coerce.number(),
  note: z.string().max(500).optional(),
});

export async function createBankStatement(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createStatementSchema.safeParse({
    organizationId: formData.get("organizationId"),
    bankAccountId: formData.get("bankAccountId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    openingBalance: formData.get("openingBalance"),
    closingBalance: formData.get("closingBalance"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { ok: false, error: "period_order" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_statements")
    .insert({
      organization_id: parsed.data.organizationId,
      bank_account_id: parsed.data.bankAccountId,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      opening_balance: parsed.data.openingBalance,
      closing_balance: parsed.data.closingBalance,
      note: parsed.data.note ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // The (bank_account_id, period_end) unique constraint is what stops a
    // re-import from silently double-counting an already-imported month.
    if (error.code === "23505") return { ok: false, error: "duplicate_period" };
    return { ok: false, error: error.message };
  }

  revalidatePath(REVALIDATE, "page");
  return { ok: true, id: data.id };
}

/**
 * Parse pasted statement rows.
 *
 * Format per line, tab- or comma-separated: date, description, amount[, reference]
 * The amount is signed from the ACCOUNT HOLDER's view -- positive money in,
 * negative money out -- the same convention the GL side uses, so matching is a
 * direct comparison. Thousands separators and a leading currency symbol are
 * tolerated because real exports carry them.
 */
function parseStatementRows(raw: string) {
  const rows: { line_date: string; description: string | null; amount: number; reference: string | null }[] = [];
  const errors: number[] = [];

  raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cells.length < 3) {
        errors.push(index + 1);
        return;
      }
      const [dateCell, descCell, amountCell, refCell] = cells;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCell)) {
        errors.push(index + 1);
        return;
      }
      const amount = Number(amountCell.replace(/[^\d.\-+]/g, ""));
      if (!Number.isFinite(amount) || amount === 0) {
        errors.push(index + 1);
        return;
      }
      rows.push({
        line_date: dateCell,
        description: descCell || null,
        amount,
        reference: refCell || null,
      });
    });

  return { rows, errors };
}

const importSchema = z.object({
  organizationId: z.string().uuid(),
  statementId: z.string().uuid(),
  raw: z.string().min(1).max(200_000),
});

export async function importBankStatementLines(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = importSchema.safeParse({
    organizationId: formData.get("organizationId"),
    statementId: formData.get("statementId"),
    raw: formData.get("raw"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const { rows, errors } = parseStatementRows(parsed.data.raw);
  // Reject the whole paste rather than importing it partially: a statement
  // that silently dropped three unparseable rows would still "reconcile"
  // against a different set of facts than the bank actually sent.
  if (errors.length > 0) return { ok: false, error: `parse_error:${errors.slice(0, 5).join(",")}` };
  if (rows.length === 0) return { ok: false, error: "no_rows" };

  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").insert(
    rows.map((r, i) => ({
      organization_id: parsed.data.organizationId,
      statement_id: parsed.data.statementId,
      line_date: r.line_date,
      description: r.description,
      reference: r.reference,
      amount: r.amount,
      sort_order: i,
    })),
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(REVALIDATE, "page");
  return { ok: true };
}

export async function autoMatchStatement(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const statementId = formData.get("statementId");
  const tolerance = Number(formData.get("toleranceDays") ?? 5);
  if (typeof statementId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("auto_match_bank_statement", {
    p_statement_id: statementId,
    p_date_tolerance_days: Number.isFinite(tolerance) ? tolerance : 5,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(REVALIDATE, "page");
  return { ok: true };
}

export async function setLineMatch(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const lineId = formData.get("lineId");
  const journalLineId = formData.get("journalLineId");
  if (typeof lineId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const clearing = !journalLineId || journalLineId === "";

  const { error } = await supabase
    .from("bank_statement_lines")
    .update(
      clearing
        ? { matched_journal_entry_line_id: null, match_type: null, matched_at: null, matched_by: null }
        : {
            matched_journal_entry_line_id: journalLineId as string,
            match_type: "MANUAL" as const,
            matched_at: new Date().toISOString(),
          },
    )
    .eq("id", lineId);

  if (error) {
    // The unique constraint on matched_journal_entry_line_id: this GL line is
    // already backing a different statement line.
    if (error.code === "23505") return { ok: false, error: "already_matched" };
    return { ok: false, error: error.message };
  }

  revalidatePath(REVALIDATE, "page");
  return { ok: true };
}

export async function finalizeReconciliation(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const statementId = formData.get("statementId");
  if (typeof statementId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_bank_reconciliation", {
    p_statement_id: statementId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(REVALIDATE, "page");
  return { ok: true };
}

export async function reopenReconciliation(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const statementId = formData.get("statementId");
  if (typeof statementId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_bank_reconciliation", {
    p_statement_id: statementId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(REVALIDATE, "page");
  return { ok: true };
}
