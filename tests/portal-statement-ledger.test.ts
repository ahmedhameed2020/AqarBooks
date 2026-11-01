import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLedger, type LedgerMovement } from "@/lib/portal/statement-ledger";
import { generateAccountStatementPdf } from "@/lib/reports/account-statement-pdf";
import { receiptAllocatedTotal } from "@/lib/reports/payment-receipt-pdf";

// due 3000 (02-01), receipt 1000 (03-10), the receipt voided on 04-20 (the reversal entry's date), plus information lines that
// must not move any balance: credit applied 03-12 and reversed 03-14.
const movements: LedgerMovement[] = [
  { id: "due-1", date: "2026-02-01", kind: "CHARGE", amount: 3000 },
  { id: "pay-1", date: "2026-03-10", kind: "PAYMENT", amount: 1000 },
  { id: "app-1", date: "2026-03-12", kind: "APPLICATION", amount: 400 },
  { id: "rev-1", date: "2026-03-14", kind: "REVERSAL", amount: 400 },
  { id: "payrev-1", date: "2026-04-20", kind: "PAYMENT_REVERSAL", amount: 1000 },
];

describe("one ledger: running balance = closing balance = opening + debits - credits", () => {
  it("before the void the receipt reduces the balance (2000); after it the reversal brings it back (3000)", () => {
    expect(buildLedger(movements, "", "2026-04-19").closingBalance).toBe(2000);
    expect(buildLedger(movements, "", "2026-04-20").closingBalance).toBe(3000);
  });

  it("every row's balance follows from the previous one and the last row equals the closing balance", () => {
    for (const to of ["2026-03-11", "2026-03-31", "2026-04-20", ""]) {
      const l = buildLedger(movements, "", to);
      let running = l.openingBalance;
      for (const row of l.rows) {
        running += (row.debit ?? 0) - (row.credit ?? 0);
        expect(row.balanceAfter).toBeCloseTo(running, 4);
      }
      expect(l.rows.at(-1)?.balanceAfter ?? l.openingBalance).toBeCloseTo(l.closingBalance, 4);
      // column totals: debits = charges + reversals, credits = receipts
      const debits = l.rows.reduce((s, r) => s + (r.debit ?? 0), 0);
      const credits = l.rows.reduce((s, r) => s + (r.credit ?? 0), 0);
      expect(l.openingBalance + debits - credits).toBeCloseTo(l.closingBalance, 4);
      expect(l.totalDebits).toBeCloseTo(debits, 4);
      expect(l.totalReceipts).toBeCloseTo(credits, 4);
    }
  });

  it("information lines (application / reversal) carry no amount in either column and no effect", () => {
    const l = buildLedger(movements, "", "2026-03-31");
    for (const r of l.rows.filter((x) => x.kind === "APPLICATION" || x.kind === "REVERSAL")) {
      expect(r.debit).toBeNull();
      expect(r.credit).toBeNull();
    }
    expect(buildLedger(movements.filter((m) => m.kind !== "APPLICATION" && m.kind !== "REVERSAL"), "", "2026-03-31").closingBalance).toBe(l.closingBalance);
  });

  it("a window opened after the receipt carries the right opening balance, in both sides of the void", () => {
    expect(buildLedger(movements, "2026-04-01", "").openingBalance).toBe(2000);
    expect(buildLedger(movements, "2026-04-01", "").closingBalance).toBe(3000);
    expect(buildLedger(movements, "2026-04-21", "").openingBalance).toBe(3000);
  });
});

describe("a due settled by another payer (new owner)", () => {
  // charges D1 2,000 (08-01) and D2 800 (09-01); D1 was settled by a previous owner's receipt on 08-10 (a settlement line, no receipt)
  const n: LedgerMovement[] = [
    { id: "d1", date: "2026-08-01", kind: "CHARGE", amount: 2000 },
    { id: "s1", date: "2026-08-10", kind: "SETTLEMENT", amount: 2000 },
    { id: "d2", date: "2026-09-01", kind: "CHARGE", amount: 800 },
  ];
  it("the closing balance is the real remaining (800), running balance 2,000 -> 0 -> 800", () => {
    const l = buildLedger(n, "", "");
    expect(l.rows.map((r) => r.balanceAfter)).toEqual([2000, 0, 800]);
    expect(l.closingBalance).toBe(800);
    expect(l.rows[1]).toMatchObject({ debit: null, credit: 2000 });
  });
  it("an undone settlement comes back as a debit on its own date", () => {
    const l = buildLedger([...n, { id: "r1", date: "2026-09-10", kind: "SETTLEMENT_REVERSAL", amount: 2000 }], "", "");
    expect(l.closingBalance).toBe(2800);
    expect(l.rows.at(-1)).toMatchObject({ debit: 2000, credit: null });
    expect(l.totalReceipts).toBe(2000);
    expect(l.totalDebits).toBe(4800);
  });
});

describe("the PDF statement agrees with the screen's ledger (including a voided receipt)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function pdfHtml(lines: Array<{ date: string; kind: "CHARGE" | "PAYMENT" | "PAYMENT_REVERSAL"; amount: number }>, openingBalance: number) {
    const blobs: string[] = [];
    class FakeBlob {
      constructor(parts: string[]) {
        blobs.push(parts.join(""));
      }
    }
    vi.stubGlobal("Blob", FakeBlob);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x" });
    vi.stubGlobal("window", { open: () => ({}), location: { href: "" } });
    generateAccountStatementPdf(
      { organizationName: "Org", propertyName: "P", currency: "EGP", accountName: "Owner", periodStart: null, periodEnd: null, openingBalance, lines: lines.map((l) => ({ ...l, description: l.kind, unitCode: "A-1", reference: null })) },
      "en",
    );
    return blobs[0];
  }
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("closing balance, the last running balance and the column totals match", async () => {
    const l = buildLedger(movements, "", "");
    const html = await pdfHtml(
      l.rows.filter((r) => r.kind === "CHARGE" || r.kind === "PAYMENT" || r.kind === "PAYMENT_REVERSAL").map((r) => ({ date: r.date, kind: r.kind as "CHARGE" | "PAYMENT" | "PAYMENT_REVERSAL", amount: r.amount })),
      l.openingBalance,
    );
    const t = text(html);
    // closing 3,000.00 shown as the last balance and as the closing figure; debits 4,000.00 (charge + reversal), credits 1,000.00
    expect(t).toContain("3,000.00");
    expect(t).toContain("4,000.00");
    expect(t).toContain("1,000.00");
    // the row of the voided receipt is a DEBIT with the balance back at 3,000.00
    const reversalRow = html.split("<tr>").find((r) => r.includes("PAYMENT_REVERSAL"))!;
    const cells = [...reversalRow.matchAll(/<td class="num[^"]*">([^<]*)<\/td>/g)].map((m) => m[1].trim());
    expect(cells).toEqual(["1,000.00", "", "3,000.00"]);
  });

  it("the receipt document totals only allocations in force: a reversed application is listed but not summed", () => {
    expect(receiptAllocatedTotal([{ unitCode: "A", description: "d", dueDate: "", allocatedAmount: 600 }])).toBe(600);
    expect(
      receiptAllocatedTotal([
        { unitCode: "A", description: "d", dueDate: "", allocatedAmount: 600 },
        { unitCode: "A", description: "d", dueDate: "", allocatedAmount: 400, credit: true, reversedOn: "2026-09-10" },
      ]),
    ).toBe(600);
    expect(receiptAllocatedTotal([{ unitCode: "A", description: "d", dueDate: "", allocatedAmount: 400, reversedOn: "2026-09-10" }])).toBe(0);
  });
});
