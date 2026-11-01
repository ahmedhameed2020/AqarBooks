import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { assertKnownLocalSupabaseUrl } from "./helpers/local-target";
import { assertIsolatedStack } from "./helpers/isolated-target";
import { createOpenFiscalYear } from "./helpers/fiscal-calendar";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Target = the ISOLATED stack only. This file used to require the development stack's fixed address (http://127.0.0.1:54321); it now uses the
// repository's isolation guards instead: the URL must be a known local Supabase API AND assertIsolatedStack() must prove it is the isolated stack
// (never development, API and SQL on the same database). Run it through scripts/demo-local/run-vitest-local.mjs.
let localConfigured = false;
let isolationProblem = "";
try {
  assertKnownLocalSupabaseUrl(url);
  assertIsolatedStack();
  localConfigured = Boolean(serviceKey && publishableKey);
} catch (error) {
  isolationProblem = error instanceof Error ? error.message : String(error);
}

describe("Final Hardening Sprint — local applied contracts", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    if (!localConfigured) {
      throw new Error(
        "This suite runs on the ISOLATED local stack only (scripts/demo-local/run-vitest-local.mjs): it needs a known local " +
          "NEXT_PUBLIC_SUPABASE_URL that assertIsolatedStack() accepts, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
          `Refused: ${isolationProblem || "keys missing"}`,
      );
    }
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  });

  it("exercises trial balance, payment reversal, ownership, and role atomicity", async () => {
    const stamp = Date.now();
    const year = new Date().getUTCFullYear();
    const today = new Date().toISOString().slice(0, 10);
    const previousYear = `${year - 1}-12-31`;
    const password = "FinalHardening_Local_P@ssw0rd_2026!";
    const ownerEmail = `final-hardening-owner-${stamp}@aqarbooks-test.local`;
    const outsiderEmail = `final-hardening-outsider-${stamp}@aqarbooks-test.local`;

    let orgId: string | undefined;
    let ownerId: string | undefined;
    let outsiderId: string | undefined;
    let ownerClient: SupabaseClient | undefined;
    let outsiderClient: SupabaseClient | undefined;

    try {
      const { data: org, error: orgError } = await admin.from("organizations").insert({
        name: `Final Hardening Local ${stamp}`,
        slug: `final-hardening-local-${stamp}`,
        default_currency: "EGP",
        status: "ACTIVE",
      }).select("id").single();
      expect(orgError, orgError?.message).toBeNull();
      orgId = org!.id;

      const insertAccount = async (code: string, category: string, normalBalance: string) => {
        const { data, error } = await admin.from("chart_of_accounts").insert({
          organization_id: orgId,
          code,
          name_ar: code,
          name_en: code,
          category,
          normal_balance: normalBalance,
          is_group: false,
          is_active: true,
        }).select("id").single();
        expect(error, error?.message).toBeNull();
        return data!.id;
      };
      const cashAccount = await insertAccount(`LH-${stamp}-1`, "ASSET", "DEBIT");
      const revenueAccount = await insertAccount(`LH-${stamp}-4`, "REVENUE", "CREDIT");

      const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
      expect(cloneError, cloneError?.message).toBeNull();
      const { data: ownerRole, error: ownerRoleError } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
      expect(ownerRoleError, ownerRoleError?.message).toBeNull();
      const { data: ownerUser, error: ownerCreateError } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
      expect(ownerCreateError, ownerCreateError?.message).toBeNull();
      ownerId = ownerUser!.user!.id;
      expect((await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: ownerId, status: "active" })).error).toBeNull();
      expect((await admin.from("user_role_assignments").insert({ user_id: ownerId, role_id: ownerRole!.id, organization_id: orgId })).error).toBeNull();
      ownerClient = createClient(url!, publishableKey!, { auth: { persistSession: false } });
      expect((await ownerClient.auth.signInWithPassword({ email: ownerEmail, password })).error).toBeNull();

      // Fiscal calendar through the product RPCs as the signed-in owner (the guard refuses direct writes).
      // The entries are dated today and the previous year's last day, so the periods under test are the
      // monthly periods that contain those dates.
      await createOpenFiscalYear(admin, ownerClient, { orgId: orgId!, name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` });
      await createOpenFiscalYear(admin, ownerClient, { orgId: orgId!, name: String(year - 1), startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` });
      const periodContaining = async (date: string) => {
        const { data, error } = await admin.from("fiscal_periods").select("id")
          .eq("organization_id", orgId!).lte("start_date", date).gte("end_date", date).single();
        expect(error, error?.message).toBeNull();
        return data!.id as string;
      };
      const periodId = await periodContaining(today);
      const oldPeriodId = await periodContaining(previousYear);

      const createEntry = (entryDate: string, periodId: string, description: string, amount: number) =>
        admin.rpc("create_journal_entry_internal", {
          p_organization_id: orgId,
          p_resort_id: null,
          p_fiscal_period_id: periodId,
          p_entry_date: entryDate,
          p_description: description,
          p_source_type: "JOURNAL_VOUCHER",
          p_lines: [
            { account_id: cashAccount, debit: amount, credit: 0 },
            { account_id: revenueAccount, debit: 0, credit: amount },
          ],
          p_idempotency_key: `final-hardening-${stamp}-${description}`,
        });

      const { data: draftId, error: draftError } = await createEntry(today, periodId, "draft-50", 50);
      expect(draftError, draftError?.message).toBeNull();
      expect(draftId).toBeTruthy();
      const { data: outOfPeriodId, error: outOfPeriodError } = await createEntry(previousYear, oldPeriodId, "out-of-period-70", 70);
      expect(outOfPeriodError, outOfPeriodError?.message).toBeNull();
      const { data: validId, error: validError } = await createEntry(today, periodId, "valid-posted-100", 100);
      expect(validError, validError?.message).toBeNull();
      const { error: postOutError } = await admin.rpc("post_journal_entry_internal", { p_journal_entry_id: outOfPeriodId });
      expect(postOutError, postOutError?.message).toBeNull();
      const { error: postValidError } = await admin.rpc("post_journal_entry_internal", { p_journal_entry_id: validId });
      expect(postValidError, postValidError?.message).toBeNull();
      const { data: trialBalance, error: trialBalanceError } = await admin.rpc("get_trial_balance", {
        p_organization_id: orgId,
        p_start_date: `${year}-01-01`,
        p_end_date: `${year}-12-31`,
      });
      expect(trialBalanceError, trialBalanceError?.message).toBeNull();
      const cashRow = trialBalance.find((row: { account_id: string }) => row.account_id === cashAccount);
      expect(Number(cashRow.total_debit)).toBe(100);
      expect(Number(cashRow.total_credit)).toBe(0);

      const { data: resort, error: resortError } = await admin.from("resorts").insert({ organization_id: orgId, name: "Hardening Property", code: `LH-${stamp}` }).select("id").single();
      expect(resortError, resortError?.message).toBeNull();
      const { data: unit, error: unitError } = await admin.from("units").insert({ organization_id: orgId, property_id: resort!.id, code: `LH-U-${stamp}` }).select("id").single();
      expect(unitError, unitError?.message).toBeNull();
      const { data: member, error: memberError } = await admin.from("members").insert({ organization_id: orgId, full_name: "Hardening Owner" }).select("id").single();
      expect(memberError, memberError?.message).toBeNull();
      const ownershipOne = await admin.from("unit_ownerships").insert({ organization_id: orgId, unit_id: unit!.id, member_id: member!.id, share_percentage: 60, start_date: "2020-01-01" });
      expect(ownershipOne.error, ownershipOne.error?.message).toBeNull();
      const ownershipOverflow = await admin.from("unit_ownerships").insert({ organization_id: orgId, unit_id: unit!.id, member_id: member!.id, share_percentage: 41, start_date: "2020-01-01" });
      expect(ownershipOverflow.error?.code).toBe("23514");

      const { data: originalEntry, error: originalEntryError } = await admin.rpc("create_journal_entry_internal", {
        p_organization_id: orgId,
        p_resort_id: resort!.id,
        p_fiscal_period_id: periodId,
        p_entry_date: today,
        p_description: "Payment original",
        p_source_type: "PAYMENT_VOUCHER",
        p_lines: [
          { account_id: cashAccount, debit: 100, credit: 0 },
          { account_id: revenueAccount, debit: 0, credit: 100 },
        ],
        p_idempotency_key: `final-hardening-payment-${stamp}`,
      });
      expect(originalEntryError, originalEntryError?.message).toBeNull();
      expect((await admin.rpc("post_journal_entry_internal", { p_journal_entry_id: originalEntry })).error).toBeNull();
      const { data: payment, error: paymentError } = await admin.from("payments").insert({
        organization_id: orgId,
        property_id: resort!.id,
        unit_id: unit!.id,
        member_id: member!.id,
        amount: 100,
        method: "CASH",
        payment_date: today,
        receipt_number: stamp,
        receipt_no: `LH-${stamp}`,
        deposit_account_id: cashAccount,
        journal_entry_id: originalEntry,
        status: "POSTED",
        unallocated_amount: 100,
      }).select("id").single();
      expect(paymentError, paymentError?.message).toBeNull();

      const unchanged = await ownerClient.rpc("void_payment", { p_organization_id: orgId, p_payment_id: payment!.id, p_reason: "" });
      expect(unchanged.error?.message).toMatch(/REASON_REQUIRED/i);
      expect((await admin.from("payments").select("status").eq("id", payment!.id).single()).data?.status).toBe("POSTED");

      const { data: outsiderUser, error: outsiderCreateError } = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
      expect(outsiderCreateError, outsiderCreateError?.message).toBeNull();
      outsiderId = outsiderUser!.user!.id;
      outsiderClient = createClient(url!, publishableKey!, { auth: { persistSession: false } });
      expect((await outsiderClient.auth.signInWithPassword({ email: outsiderEmail, password })).error).toBeNull();
      const permissionFailure = await outsiderClient.rpc("void_payment", { p_organization_id: orgId, p_payment_id: payment!.id, p_reason: "unauthorized attempt" });
      expect(permissionFailure.error?.message).toMatch(/FORBIDDEN|permission/i);
      expect((await admin.from("payments").select("status").eq("id", payment!.id).single()).data?.status).toBe("POSTED");

      const { data: reversal, error: reversalError } = await ownerClient.rpc("void_payment", { p_organization_id: orgId, p_payment_id: payment!.id, p_reason: "Local hardening reversal" });
      expect(reversalError, reversalError?.message).toBeNull();
      expect(reversal?.success).toBe(true);
      const paymentAfter = (await admin.from("payments").select("status, reversal_journal_entry_id").eq("id", payment!.id).single()).data;
      expect(paymentAfter?.status).toBe("REVERSED");
      expect(paymentAfter?.reversal_journal_entry_id).toBe(reversal.reversal_journal_entry_id);
      const originalAfter = (await admin.from("journal_entries").select("status").eq("id", originalEntry).single()).data;
      const reversalEntry = (await admin.from("journal_entries").select("status, reversed_entry_id").eq("id", reversal.reversal_journal_entry_id).single()).data;
      expect(originalAfter?.status).toBe("REVERSED");
      expect(reversalEntry?.status).toBe("POSTED");
      expect(reversalEntry?.reversed_entry_id).toBe(originalEntry);
      expect((await admin.from("financial_audit_logs").select("id").eq("organization_id", orgId).eq("action", "PAYMENT_REVERSED").eq("entity_id", payment!.id)).data?.length).toBe(1);
      const secondReversal = await ownerClient.rpc("void_payment", { p_organization_id: orgId, p_payment_id: payment!.id, p_reason: "second attempt" });
      expect(secondReversal.error?.message).toMatch(/ALREADY_REVERSED/i);

      const { data: customRole, error: customRoleError } = await admin.from("roles").insert({ organization_id: orgId, key: `LOCAL_HARDENING_${stamp}`, name_ar: "دور اختبار", name_en: "Test Role", is_system: false }).select("id").single();
      expect(customRoleError, customRoleError?.message).toBeNull();
      const { data: validPermission, error: permissionError } = await admin.from("permissions").select("id").eq("key", "finance.reports.read").single();
      expect(permissionError, permissionError?.message).toBeNull();
      expect((await admin.from("role_permissions").insert({ role_id: customRole!.id, permission_id: validPermission!.id })).error).toBeNull();
      const atomicFailure = await admin.rpc("replace_role_permissions_atomic", { p_organization_id: orgId, p_role_id: customRole!.id, p_permission_ids: ["00000000-0000-0000-0000-000000000000"], p_actor_user_id: ownerId! });
      expect(atomicFailure.error).toBeTruthy();
      expect((await admin.from("role_permissions").select("permission_id").eq("role_id", customRole!.id)).data?.map((row) => row.permission_id)).toContain(validPermission!.id);
    } finally {
      if (ownerId) {
        await admin.from("financial_audit_logs").delete().eq("actor_user_id", ownerId);
        await admin.from("platform_audit_logs").delete().eq("actor_id", ownerId);
        await admin.from("user_role_assignments").delete().eq("user_id", ownerId);
        await admin.from("organization_memberships").delete().eq("user_id", ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
      if (outsiderId) {
        await admin.from("financial_audit_logs").delete().eq("actor_user_id", outsiderId);
        await admin.from("platform_audit_logs").delete().eq("actor_id", outsiderId);
        await admin.from("user_role_assignments").delete().eq("user_id", outsiderId);
        await admin.from("organization_memberships").delete().eq("user_id", outsiderId);
        await admin.auth.admin.deleteUser(outsiderId);
      }
      if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    }
  });
});
