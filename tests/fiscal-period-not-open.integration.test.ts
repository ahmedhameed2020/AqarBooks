import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  addBankAccount,
  adminClient,
  createJourneyFixture,
  signedInClient,
  type JourneyFixture,
} from "./e2e/helpers/accounting-fixture";

vi.setConfig({ hookTimeout: 300_000, testTimeout: 120_000 });

type Client = Awaited<ReturnType<typeof signedInClient>>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

const STABLE_CODE = /FISCAL_PERIOD_NOT_OPEN/;
let fx: JourneyFixture;
let owner: Client;
let accountant: Client;
let manualDraftId = "";
let postedOriginalId = "";
let dueId = "";
let closedPeriodId = "";
let reversalClosedPeriodId = "";
let expenseCategoryId = "";
const admin = adminClient();

async function periodOn(date: string) {
  const { data, error } = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("organization_id", fx.orgId)
    .lte("start_date", date)
    .gte("end_date", date)
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function closePeriod(periodId: string) {
  const result = await owner.rpc("set_fiscal_period_status", {
    p_fiscal_period_id: periodId,
    p_status: "CLOSED",
    p_reason: "Batch 2 stable error-code integration test",
  });
  expect(result.error, result.error?.message).toBeNull();
}

async function snapshot() {
  const count = async (table: string) => {
    const result = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", fx.orgId);
    expect(result.error, result.error?.message).toBeNull();
    return result.count ?? 0;
  };
  return {
    entries: await count("journal_entries"),
    dues: await count("dues"),
    payments: await count("payments"),
    expenses: await count("expenses"),
  };
}

async function expectStableRefusal(result: RpcResult) {
  expect(result.error, "the posting must be refused").not.toBeNull();
  expect(result.error!.message).toMatch(STABLE_CODE);
  expect(result.error!.message).not.toMatch(/NO_OPEN_FISCAL_PERIOD/);
}

beforeAll(async () => {
  fx = await createJourneyFixture("period-code");
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  await addBankAccount(fx);

  const expenseAccount = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: fx.orgId,
      code: "5499",
      name_ar: "مصروف بنكي لاختبار الفترة",
      name_en: "Bank expense period test",
      category: "EXPENSE",
      normal_balance: "DEBIT",
      is_group: false,
      is_active: true,
    })
    .select("id")
    .single();
  expect(expenseAccount.error, expenseAccount.error?.message).toBeNull();

  const expenseCategory = await admin
    .from("expense_categories")
    .insert({
      organization_id: fx.orgId,
      name_ar: "مصروف بنكي لاختبار الفترة",
      name_en: "Bank expense period test",
      default_expense_account_id: expenseAccount.data!.id,
    })
    .select("id")
    .single();
  expect(expenseCategory.error, expenseCategory.error?.message).toBeNull();
  expenseCategoryId = expenseCategory.data!.id as string;

  const january = await periodOn("2026-01-15");
  const march = await periodOn("2026-03-10");
  closedPeriodId = await periodOn("2026-05-15");
  reversalClosedPeriodId = await periodOn("2026-04-10");

  const draft = await accountant.rpc("create_journal_entry", {
    p_organization_id: fx.orgId,
    p_resort_id: fx.propertyId,
    p_fiscal_period_id: january,
    p_entry_date: "2026-01-15",
    p_description: "Batch 2 manual posting refusal",
    p_source_type: "JOURNAL_VOUCHER",
    p_lines: [
      { account_id: fx.accounts["1110"], debit: 100, credit: 0 },
      { account_id: fx.accounts["4100"], debit: 0, credit: 100 },
    ],
    p_idempotency_key: randomUUID(),
  });
  expect(draft.error, draft.error?.message).toBeNull();
  manualDraftId = draft.data as string;

  const original = await accountant.rpc("create_journal_entry", {
    p_organization_id: fx.orgId,
    p_resort_id: fx.propertyId,
    p_fiscal_period_id: march,
    p_entry_date: "2026-03-10",
    p_description: "Batch 2 reversal source",
    p_source_type: "JOURNAL_VOUCHER",
    p_lines: [
      { account_id: fx.accounts["1110"], debit: 75, credit: 0 },
      { account_id: fx.accounts["4100"], debit: 0, credit: 75 },
    ],
    p_idempotency_key: randomUUID(),
  });
  expect(original.error, original.error?.message).toBeNull();
  postedOriginalId = original.data as string;
  const posted = await owner.rpc("post_journal_entry", { p_journal_entry_id: postedOriginalId });
  expect(posted.error, posted.error?.message).toBeNull();

  const dueType = await admin
    .from("due_types")
    .select("id")
    .eq("organization_id", fx.orgId)
    .single();
  expect(dueType.error, dueType.error?.message).toBeNull();
  const due = await accountant.rpc("issue_dues", {
    p_organization_id: fx.orgId,
    p_resort_id: fx.propertyId,
    p_unit_ids: [fx.unit.id],
    p_due_type_id: dueType.data!.id,
    p_receivable_account_id: fx.accounts["1130"],
    p_amount: 100,
    p_issue_date: "2026-02-01",
    p_due_date: "2026-02-15",
    p_description: "Batch 2 payment allocation source",
  });
  expect(due.error, due.error?.message).toBeNull();
  const dueRow = await admin
    .from("dues")
    .select("id")
    .eq("organization_id", fx.orgId)
    .eq("description", "Batch 2 payment allocation source")
    .single();
  expect(dueRow.error, dueRow.error?.message).toBeNull();
  dueId = dueRow.data!.id as string;

  await closePeriod(january);
  await closePeriod(reversalClosedPeriodId);
  await closePeriod(closedPeriodId);
});

describe.sequential("FISCAL_PERIOD_NOT_OPEN stable posting contract on r6", () => {
  it("manual journal posting returns the stable code and keeps the entry DRAFT", async () => {
    const before = await snapshot();
    const result = await owner.rpc("post_journal_entry", { p_journal_entry_id: manualDraftId });
    await expectStableRefusal(result);
    expect(await snapshot()).toEqual(before);
    const entry = await admin.from("journal_entries").select("status").eq("id", manualDraftId).single();
    expect(entry.data!.status).toBe("DRAFT");
  });

  it("due issuance returns the stable code and creates no due or entry", async () => {
    const dueType = await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single();
    const before = await snapshot();
    const result = await accountant.rpc("issue_dues", {
      p_organization_id: fx.orgId,
      p_resort_id: fx.propertyId,
      p_unit_ids: [fx.unit.id],
      p_due_type_id: dueType.data!.id,
      p_receivable_account_id: fx.accounts["1130"],
      p_amount: 50,
      p_issue_date: "2026-05-15",
      p_due_date: "2026-05-20",
      p_description: "Batch 2 closed-period due refusal",
    });
    await expectStableRefusal(result);
    expect(await snapshot()).toEqual(before);
  });

  it("payment posting returns the stable code and creates no payment or entry", async () => {
    const before = await snapshot();
    const result = await accountant.rpc("record_payment", {
      p_organization_id: fx.orgId,
      p_resort_id: fx.propertyId,
      p_member_id: fx.member.id,
      p_unit_id: fx.unit.id,
      p_amount: 40,
      p_method: "CASH",
      p_payment_date: "2026-05-15",
      p_deposit_account_id: fx.accounts["1110"],
      p_fiscal_period_id: closedPeriodId,
      p_allocations: [{ due_id: dueId, amount: 40 }],
      p_idempotency_key: randomUUID(),
    });
    await expectStableRefusal(result);
    expect(await snapshot()).toEqual(before);
  });

  it("reversal into a closed target period returns the stable code and preserves the original", async () => {
    const before = await snapshot();
    const result = await owner.rpc("reverse_journal_entry", {
      p_journal_entry_id: postedOriginalId,
      p_reversal_fiscal_period_id: reversalClosedPeriodId,
      p_reversal_date: "2026-04-10",
      p_reason: "Batch 2 closed-period reversal refusal",
    });
    await expectStableRefusal(result);
    expect(await snapshot()).toEqual(before);
    const original = await admin.from("journal_entries").select("status").eq("id", postedOriginalId).single();
    expect(original.data!.status).toBe("POSTED");
  });

  it("bank-funded expense posting returns the stable code and creates no expense or entry", async () => {
    const before = await snapshot();
    const result = await accountant.rpc("record_expense", {
      p_organization_id: fx.orgId,
      p_resort_id: fx.propertyId,
      p_expense_category_id: expenseCategoryId,
      p_description: "Batch 2 closed-period bank expense refusal",
      p_amount: 25,
      p_expense_date: "2026-05-15",
      p_payment_account_id: fx.accounts["1120"],
      p_fiscal_period_id: closedPeriodId,
    });
    await expectStableRefusal(result);
    expect(await snapshot()).toEqual(before);
  });
});
