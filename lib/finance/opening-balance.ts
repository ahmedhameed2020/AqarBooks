import type { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

// A client's opening balance is the debt they already carried when the
// organization moved onto AqarBooks. It is recorded as an OPENING_BALANCE due
// on one of the client's units (Dr receivable / Cr opening-balance equity) so
// that balances, statements, payment allocation and dunning all see it -- see
// supabase/migrations/20260903172101_member_opening_balance.sql for why a
// column on members would not have worked.
//
// This module is deliberately NOT a "use server" file: it is shared plumbing
// for two server actions, and exporting it from an action module would turn
// it into a client-callable endpoint.

export type OpeningBalanceInput = {
  organizationId: string;
  memberId: string;
  unitId: string;
  amount: number;
  asOfDate: string;
  receivableAccountId?: string;
  description?: string;
};

/**
 * The database raises `CODE: رسالة عربية`. The message half is written for
 * the operator; the code half is for logs and tests. Operators get the message.
 */
export function humanizeDbError(message: string): string {
  const match = /^[A-Z0-9_]+:\s*([\s\S]+)$/.exec(message.trim());
  return match ? match[1].trim() : message;
}

/**
 * Two RPCs on purpose: the due type (and its equity account) is created in its
 * own transaction so that a refusal on the second call -- e.g. the tax mapping
 * still pending review -- leaves the type in place for the reviewer to approve.
 */
export async function recordOpeningBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: OpeningBalanceInput,
): Promise<ActionResult> {
  const { error: typeError } = await supabase.rpc("ensure_opening_balance_due_type", {
    p_organization_id: input.organizationId,
  });
  if (typeError) return { ok: false, error: humanizeDbError(typeError.message) };

  const { data: dueId, error } = await supabase.rpc("record_member_opening_balance", {
    p_organization_id: input.organizationId,
    p_member_id: input.memberId,
    p_unit_id: input.unitId,
    p_amount: input.amount,
    p_as_of_date: input.asOfDate,
    p_receivable_account_id: input.receivableAccountId ?? null,
    p_description: input.description ?? null,
  });
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  return { ok: true, id: dueId ?? undefined };
}
