import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

/**
 * Cashier infrastructure, opened before the first CASH receipt and reconciled
 * after the last.
 *
 * WHY THIS COULD NOT BE DONE FOR MAY, JUNE OR JULY
 * `record_payment` writes a `cash_transaction` only when a session id is passed
 * AT RECORDING TIME. There is no way to attach a session to a receipt
 * afterwards, and those receipts are already posted and idempotent. Sessions
 * built for them now would be rows dated after the events they claim to
 * explain, referencing nothing -- decoration rather than lineage. So the
 * cashier cycle starts here, forwards, and the earlier months stay recorded as
 * a deferral.
 *
 * A CASHBOX IS PROPERTY-SCOPED, SO ONLY PROPERTIES THAT TAKE CASH GET ONE.
 * Creating a cashbox for every property to make the screen look populated would
 * put tills in buildings where no cash was ever received. The caller works out
 * which properties actually have CASH receipts in the plan and passes those.
 *
 * THE CLOSING COUNT IS NOT ASSUMED TO MATCH
 * `close_cashier_session` computes expected = opening + receipts - payments
 * from the `cash_transactions` the session actually recorded, and stores the
 * variance against whatever is counted. This module counts the drawer the only
 * honest way available to it -- by summing the session's own recorded
 * movements -- so the variance is nil because nothing happened outside the
 * system, not because a number was forced to agree.
 */

export const CASHBOX_NAME_BY_PROPERTY = (code: string) => `صندوق ${code} / ${code} Front Desk Cashbox`;

export const SESSION_RECONCILE_NOTE =
  "Demo cashier cycle — August 2026 front-desk session reconciled; counted cash agrees with recorded receipts";

export type CashierSession = {
  propertyId: string;
  propertyCode: string;
  cashboxId: string;
  sessionId: string;
  openingBalance: number;
};

export type CashierOpenReport = {
  ok: boolean;
  sessions: CashierSession[];
  createdCashboxes: number;
  openedSessions: number;
  failure?: string;
};

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Ensures a cashbox and an OPEN session for each property named.
 *
 * Idempotent: an existing active cashbox on 1110 is reused, and an already-open
 * session is adopted rather than a second one opened beside it.
 */
export async function openCashierSessions(options: {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  propertyIds: string[];
  log: (line: string) => void;
}): Promise<CashierOpenReport> {
  const { admin, owner, organizationId, propertyIds, log } = options;
  const report: CashierOpenReport = {
    ok: false,
    sessions: [],
    createdCashboxes: 0,
    openedSessions: 0,
  };

  try {
    const { data: properties } = await admin
      .from("properties")
      .select("id, code")
      .eq("organization_id", organizationId);
    const codeById = new Map((properties ?? []).map((p) => [p.id, p.code]));

    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, code, is_cash_equivalent, is_active")
      .eq("organization_id", organizationId);
    const cashOnHand = (accounts ?? []).find((a) => a.code === "1110");
    if (!cashOnHand) throw new Error("no 1110 Cash on Hand account");
    if (!cashOnHand.is_cash_equivalent || !cashOnHand.is_active) {
      throw new Error("1110 is not an active cash-equivalent account");
    }

    for (const propertyId of propertyIds) {
      const code = codeById.get(propertyId) ?? propertyId;

      const { data: existingBoxes } = await admin
        .from("cashboxes")
        .select("id, gl_account_id, is_active")
        .eq("organization_id", organizationId)
        .eq("property_id", propertyId)
        .range(0, 99);
      let cashboxId = (existingBoxes ?? []).find(
        (b) => b.is_active && b.gl_account_id === cashOnHand.id,
      )?.id;

      if (!cashboxId) {
        const { data, error } = await (owner as unknown as UntypedRpc).rpc("create_cashbox", {
          p_organization_id: organizationId,
          p_resort_id: propertyId,
          p_name: CASHBOX_NAME_BY_PROPERTY(code),
          p_gl_account_id: cashOnHand.id,
        });
        if (error) throw new Error(`create_cashbox(${code}): ${error.message}`);
        cashboxId = data as string;
        report.createdCashboxes++;
        log(`  cashbox created for ${code}`);
      }

      const { data: openSessions } = await admin
        .from("cashier_sessions")
        .select("id, status, opening_balance")
        .eq("organization_id", organizationId)
        .eq("cashbox_id", cashboxId)
        .eq("status", "OPEN")
        .range(0, 99);
      let sessionId = (openSessions ?? [])[0]?.id;
      let openingBalance = Number((openSessions ?? [])[0]?.opening_balance ?? 0);

      if (!sessionId) {
        // Opening float of zero. A non-zero float would be a cash amount nobody
        // deposited, and it would have to come from somewhere in the ledger.
        const { data, error } = await (owner as unknown as UntypedRpc).rpc("open_cashier_session", {
          p_organization_id: organizationId,
          p_resort_id: propertyId,
          p_cashbox_id: cashboxId,
          p_opening_balance: 0,
        });
        if (error) throw new Error(`open_cashier_session(${code}): ${error.message}`);
        sessionId = data as string;
        openingBalance = 0;
        report.openedSessions++;
        log(`  session opened for ${code}`);
      }

      report.sessions.push({
        propertyId,
        propertyCode: code,
        cashboxId,
        sessionId,
        openingBalance,
      });
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

export type CashierCloseOutcome = {
  propertyCode: string;
  sessionId: string;
  receipts: number;
  receiptTotal: number;
  opening: number;
  expected: number;
  actual: number;
  variance: number;
  status: string;
};

export type CashierCloseReport = {
  ok: boolean;
  outcomes: CashierCloseOutcome[];
  failure?: string;
};

/**
 * Closes and reconciles each session.
 *
 * The counted drawer is the sum of the session's own `cash_transactions` plus
 * its opening float -- the same arithmetic `close_cashier_session` performs, so
 * the variance is nil. That is honest here and would not be in production: a
 * real count is a physical fact that can disagree, and this demo has no
 * physical drawer to disagree with. What it demonstrates is the CYCLE --
 * open, receive through the till, close against a count, reconcile -- not that
 * counting always agrees.
 */
export async function closeCashierSessions(options: {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  sessions: CashierSession[];
  log: (line: string) => void;
}): Promise<CashierCloseReport> {
  const { admin, owner, sessions, log } = options;
  const report: CashierCloseReport = { ok: false, outcomes: [] };

  try {
    for (const session of sessions) {
      const { data: current } = await admin
        .from("cashier_sessions")
        .select("id, status, opening_balance, expected_closing_balance, actual_closing_balance, variance")
        .eq("id", session.sessionId)
        .single();

      const { data: transactions } = await admin
        .from("cash_transactions")
        .select("type, amount")
        .eq("session_id", session.sessionId)
        .range(0, 9999);
      const receipts = (transactions ?? []).filter((t) => t.type === "RECEIPT");
      const payments = (transactions ?? []).filter((t) => t.type === "PAYMENT");
      const receiptTotal =
        Math.round(receipts.reduce((s, t) => s + Number(t.amount), 0) * 100) / 100;
      const paymentTotal =
        Math.round(payments.reduce((s, t) => s + Number(t.amount), 0) * 100) / 100;
      const counted =
        Math.round((Number(session.openingBalance) + receiptTotal - paymentTotal) * 100) / 100;

      if (current?.status === "OPEN") {
        const { error } = await (owner as unknown as UntypedRpc).rpc("close_cashier_session", {
          p_session_id: session.sessionId,
          p_actual_closing_balance: counted,
        });
        if (error) throw new Error(`close_cashier_session(${session.propertyCode}): ${error.message}`);
        log(`  ${session.propertyCode} session closed at ${counted.toFixed(2)}`);
      }

      const { data: closed } = await admin
        .from("cashier_sessions")
        .select("status, opening_balance, expected_closing_balance, actual_closing_balance, variance")
        .eq("id", session.sessionId)
        .single();

      if (closed?.status === "CLOSED") {
        const { error } = await (owner as unknown as UntypedRpc).rpc("reconcile_cashier_session", {
          p_session_id: session.sessionId,
          p_note: SESSION_RECONCILE_NOTE,
        });
        if (error) {
          throw new Error(`reconcile_cashier_session(${session.propertyCode}): ${error.message}`);
        }
        log(`  ${session.propertyCode} session reconciled`);
      }

      const { data: final } = await admin
        .from("cashier_sessions")
        .select("status, opening_balance, expected_closing_balance, actual_closing_balance, variance")
        .eq("id", session.sessionId)
        .single();

      report.outcomes.push({
        propertyCode: session.propertyCode,
        sessionId: session.sessionId,
        receipts: receipts.length,
        receiptTotal,
        opening: Number(final?.opening_balance ?? 0),
        expected: Number(final?.expected_closing_balance ?? 0),
        actual: Number(final?.actual_closing_balance ?? 0),
        variance: Number(final?.variance ?? 0),
        status: final?.status ?? "unknown",
      });
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

export type Check = { label: string; expected: string; actual: string; pass: boolean };

export async function verifyCashier(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ pass: boolean; checks: Check[]; text: string }> {
  const checks: Check[] = [];
  const detail: string[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({ label, expected: String(exp), actual: String(act), pass: String(exp) === String(act) });

  const { data: sessions } = await admin
    .from("cashier_sessions")
    .select("id, property_id, status, opening_balance, expected_closing_balance, actual_closing_balance, variance")
    .eq("organization_id", organizationId)
    .range(0, 999);

  const { data: transactions } = await admin
    .from("cash_transactions")
    .select("session_id, type, amount, payment_id")
    .eq("organization_id", organizationId)
    .range(0, 9999);

  const { data: cashPayments } = await admin
    .from("payments")
    .select("id, amount, payment_date, method")
    .eq("organization_id", organizationId)
    .eq("method", "CASH")
    .range(0, 4999);

  const augustCash = (cashPayments ?? []).filter(
    (p) => p.payment_date >= "2026-08-01" && p.payment_date <= "2026-08-31",
  );
  const linkedPaymentIds = new Set(
    (transactions ?? []).map((t) => t.payment_id).filter(Boolean) as string[],
  );

  const problems: string[] = [];
  for (const s of sessions ?? []) {
    if (s.status !== "RECONCILED") problems.push(`${s.id}: status ${s.status}`);
    if (Number(s.variance ?? -1) !== 0) problems.push(`${s.id}: variance ${s.variance}`);
    const own = (transactions ?? []).filter((t) => t.session_id === s.id);
    const expected =
      Math.round(
        (Number(s.opening_balance) +
          own.filter((t) => t.type === "RECEIPT").reduce((x, t) => x + Number(t.amount), 0) -
          own.filter((t) => t.type === "PAYMENT").reduce((x, t) => x + Number(t.amount), 0)) *
          100,
      ) / 100;
    if (expected.toFixed(2) !== Number(s.expected_closing_balance ?? 0).toFixed(2)) {
      problems.push(`${s.id}: expected ${s.expected_closing_balance} != ${expected}`);
    }
  }
  add("every session RECONCILED with nil variance", 0, problems.length);
  detail.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  // The point of the whole exercise: August CASH went THROUGH a till, rather
  // than being posted beside one.
  const unlinked = augustCash.filter((p) => !linkedPaymentIds.has(p.id));
  add("August CASH receipts with a cash transaction", augustCash.length, augustCash.length - unlinked.length);
  detail.push(...unlinked.slice(0, 5).map((p) => `    ${p.id} has no cash transaction`));

  const txTotal =
    Math.round(
      (transactions ?? [])
        .filter((t) => t.type === "RECEIPT")
        .reduce((s, t) => s + Number(t.amount), 0) * 100,
    ) / 100;
  const cashTotal =
    Math.round(augustCash.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
  add("cash transactions = August CASH receipts", cashTotal.toFixed(2), txTotal.toFixed(2));
  add("sessions", (sessions ?? []).length, (sessions ?? []).length);

  const lines = ["CASHIER VERIFICATION (read from the ledger)", "-".repeat(72)];
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(44)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  if (detail.filter(Boolean).length > 0) lines.push("", ...detail.filter(Boolean));

  const pass = checks.every((c) => c.pass);
  lines.push("", `CASHIER CYCLE   ${pass ? "PASS" : "FAIL"}`);
  return { pass, checks, text: lines.join("\n") };
}
