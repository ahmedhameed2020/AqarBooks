/**
 * Closes May 2026.
 *
 * Dry run:
 *     npx vitest run tests/demo-may-close.manual.test.ts
 * Apply:
 *     DEMO_MAY_CLOSE=1 npx vitest run tests/demo-may-close.manual.test.ts
 *
 * WHY THIS IS ITS OWN FILE
 * F3 declined to close May, and correctly: six CASH receipts were dated inside
 * it with no cashier session, so the till side of May was unwritten. That has
 * been resolved by a DECISION rather than by more rows -- the cashier module
 * will be demonstrated from a cashbox forward in a later period instead of
 * back-dating sessions onto receipts they could never be linked to.
 *
 * Reversing a refusal deserves its own artifact. Putting the close inside F3
 * would have meant editing the stage that said no until it said yes, and the
 * record would show only the yes.
 *
 * The completeness check is not bypassed. It is told the cashier narrative is
 * deferred, and it moves that item from "blocking" to "deferred, on the
 * record". Every other blocker still blocks.
 *
 * Report: test-results/demo-may-close.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { verifyF3, mayCompleteness, MAY_PERIOD } from "../scripts/demo/apply-f3-may-collections";
import { setPeriodStatus } from "../scripts/demo/apply-f2-q2-rent";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_MAY_CLOSE === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

if (APPLY && MISSING.length > 0) {
  throw new Error(`DEMO_MAY_CLOSE=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

const MAY_CLOSE_REASON =
  "Demo financial narrative — May 2026 rent collections completed; cashier-session demonstration deferred to a later operational period";

const EXPECTED = { payments: 26, collected: 656_560, openingAr: 1_080_350 };

describe.skipIf(MISSING.length > 0)("May 2026 close", () => {
  it(APPLY ? "closes May" : "rehearses the May close", async () => {
    const lines: string[] = [
      `MAY 2026 CLOSE ${APPLY ? "— APPLY" : "— DRY RUN"}`,
      "=".repeat(72),
      "",
    ];
    const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

    // ---- the ledger before the close, so the after can be compared to it ----
    const before = await verifyF3(admin, organizationId, EXPECTED);
    const beforeCounts = await counts(admin, organizationId);
    lines.push("BEFORE THE CLOSE");
    lines.push("-".repeat(72));
    lines.push(before.text);
    lines.push("");
    expect(before.pass, "the ledger did not verify before the close").toBe(true);

    // ---- completeness, with the deferral on the record ---------------------
    const completeness = await mayCompleteness(admin, organizationId, { cashierDeferred: true });
    lines.push(completeness.text);
    lines.push("");
    expect(completeness.blockers, "May still has blocking work dated inside it").toEqual([]);
    expect(
      completeness.deferred.length,
      "nothing was recorded as deferred; the decision would go unrecorded",
    ).toBeGreaterThan(0);

    if (!APPLY) {
      lines.push("No write was attempted.");
      write(lines);
      return;
    }

    // ---- authorized actor ---------------------------------------------------
    const owner: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
    });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
    });
    expect(linkErr, `generateLink failed: ${linkErr?.message}`).toBeNull();
    const { error: otpErr } = await owner.auth.verifyOtp({
      token_hash: link!.properties!.hashed_token,
      type: "magiclink",
    });
    expect(otpErr, `owner session failed: ${otpErr?.message}`).toBeNull();

    // ---- close --------------------------------------------------------------
    const closed = await setPeriodStatus(
      admin,
      owner,
      organizationId,
      MAY_PERIOD,
      "CLOSED",
      MAY_CLOSE_REASON,
    );
    lines.push("CLOSE");
    lines.push("-".repeat(72));
    lines.push(`  ${closed.from} -> CLOSED`);
    lines.push(`  reason: "${MAY_CLOSE_REASON}"`);
    lines.push("");

    // ---- after: the close must have moved a status and nothing else ---------
    const after = await verifyF3(admin, organizationId, EXPECTED);
    const afterCounts = await counts(admin, organizationId);

    lines.push("AFTER THE CLOSE");
    lines.push("-".repeat(72));
    lines.push(after.text);
    lines.push("");
    lines.push("WHAT THE CLOSE ITSELF WROTE");
    lines.push("-".repeat(72));
    lines.push(`  new payments                  ${afterCounts.payments - beforeCounts.payments}`);
    lines.push(`  new allocations               ${afterCounts.allocations - beforeCounts.allocations}`);
    lines.push(`  new journal entries           ${afterCounts.entries - beforeCounts.entries}`);
    lines.push(`  new dues                      ${afterCounts.dues - beforeCounts.dues}`);
    lines.push("");

    const { data: periods } = await admin
      .from("fiscal_periods")
      .select("start_date, status")
      .eq("organization_id", organizationId)
      .order("start_date");
    lines.push("FISCAL STATE");
    lines.push("-".repeat(72));
    for (const p of periods ?? []) lines.push(`  ${p.start_date.slice(0, 7)}   ${p.status}`);

    write(lines);
    await owner.auth.signOut();

    const may = (periods ?? []).find((p) => p.start_date.slice(0, 7) === MAY_PERIOD);
    expect(may?.status, "May did not close").toBe("CLOSED");
    expect(after.pass, "the ledger stopped verifying after the close").toBe(true);
    expect(after.closingAr, "closing AR moved").toBe(before.closingAr);
    expect(afterCounts, "the close wrote rows").toEqual(beforeCounts);
  }, 600_000);
});

async function counts(admin: SupabaseClient<Database>, organizationId: string) {
  const scoped = async (t: "payments" | "journal_entries" | "dues") => {
    const { count } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count ?? -1;
  };
  const { data: paymentRows } = await admin
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const ids = (paymentRows ?? []).map((p) => p.id);
  const { count: allocations } = await admin
    .from("payment_allocations")
    .select("payment_id", { count: "exact", head: true })
    .in("payment_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  return {
    payments: await scoped("payments"),
    entries: await scoped("journal_entries"),
    dues: await scoped("dues"),
    allocations: allocations ?? -1,
  };
}

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-may-close.txt", lines.join("\n") + "\n", "utf8");
}
