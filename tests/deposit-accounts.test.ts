import { describe, expect, it } from "vitest";
import { sortDepositAccounts } from "@/lib/finance/deposit-accounts";

describe("deposit account order (the first one is the dialog's default)", () => {
  const a = (code: string, id: string) => ({ code, id });

  it("is ascending by code regardless of the order the database returned", () => {
    const heapOrders = [
      [a("1130", "c"), a("1110", "a"), a("1120", "b")],
      [a("1120", "b"), a("1130", "c"), a("1110", "a")],
      [a("1110", "a"), a("1130", "c"), a("1120", "b")],
    ];
    for (const rows of heapOrders) expect(sortDepositAccounts(rows).map((x) => x.code)).toEqual(["1110", "1120", "1130"]);
    expect(sortDepositAccounts(heapOrders[0])[0].code).toBe("1110");
  });

  it("compares codes numerically-aware, so a longer code does not sort before a shorter one", () => {
    expect(sortDepositAccounts([a("11100", "x"), a("1110", "y"), a("1120", "z")]).map((x) => x.code)).toEqual(["1110", "1120", "11100"]);
  });

  it("breaks ties by id, so the order is total and stable", () => {
    expect(sortDepositAccounts([a("1110", "b"), a("1110", "a")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input and keeps every element", () => {
    const rows = [a("1130", "c"), a("1110", "a")];
    const out = sortDepositAccounts(rows);
    expect(rows.map((x) => x.code)).toEqual(["1130", "1110"]);
    expect(out).toHaveLength(2);
  });
});
