// @ts-nocheck
/**
 * Phase 1 security regression guard — function EXECUTE grant posture.
 *
 * WHY THIS EXISTS
 * During Phase 1, migration 4 (20261001000004_phase1_revoke_anon_function_execute)
 * revoked EXECUTE from PUBLIC and anon but issued an unconditional
 * `GRANT EXECUTE ... TO authenticated` in the same loop. That granted
 * `authenticated` direct access to nine internal functions it had never had,
 * including post_payment_internal and post_journal_entry_internal -- the
 * unguarded internals that record_payment and post_journal_entry exist to
 * wrap. Any signed-in user could have bypassed the RBAC guard that migration 3
 * had just hardened. It was caught only by hand-diffing two security-advisor
 * runs (169 -> 178) and repaired by migration 5.
 *
 * A COUNT CHECK IS NOT SUFFICIENT. The total can remain 169 while a harmless
 * function is swapped for a dangerous one. These tests therefore assert SET
 * EQUALITY against a named baseline, plus an explicit denylist for the
 * internals that must never be client-callable under any circumstances.
 *
 * This suite is READ-ONLY. It creates no organizations, payments or journal
 * entries and is safe to run against any environment, including production.
 *
 * If a test here fails, do not edit the baseline to make it pass. Establish
 * first whether the grant change was intended; only then move the name
 * between the allowlist and the denylist, in the same commit as the migration
 * that caused it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Internal functions that must NEVER be executable by `anon` or
 * `authenticated`. Each is either an unguarded internal wrapped by a
 * permission-checked public function, a credential accessor, or an
 * audit-trail writer. Reached only from inside other SECURITY DEFINER
 * functions (which run as owner) or via the service-role client.
 */
const INTERNAL_FUNCTIONS_NEVER_CLIENT_CALLABLE = [
  "post_payment_internal", // wrapped by record_payment
  "post_journal_entry_internal", // wrapped by post_journal_entry
  "create_journal_entry_internal",
  "get_payment_provider_credentials", // payment provider secrets
  "append_financial_audit_event", // forging audit entries
  "record_online_payment", // service-role webhook path
  "run_lease_rent_generation", // service-role sweep
  "expire_stale_member_invitations", // service-role sweep
  "expire_stale_online_payment_transactions", // service-role sweep
] as const;

/**
 * Approved baseline: the exact set of SECURITY DEFINER application functions
 * that `authenticated` may execute, as of Phase 1 close (2026-08-20,
 * migrations 20261001000001-6). 169 entries.
 */
const AUTHENTICATED_SECDEF_ALLOWLIST = new Set<string>([
  "accept_member_invitation", "accrue_commission", "activate_unit_lease", "add_organization_member",
  "allocate_document_number", "approve_due_type_revenue_nature", "approve_expense_account_input_tax",
  "approve_purchase_order", "approve_tax_rule", "archive_unit", "assign_subscription",
  "auto_match_bank_statement", "cancel_installment_plan", "cancel_supplier_invoice", "cancel_unit_lease",
  "capitalise_project_cost", "check_asset_disposal_readiness", "check_einvoice_emission_readiness",
  "check_fx_readiness", "check_input_tax_readiness", "check_installment_plan_completion",
  "check_tax_enforcement_readiness", "claim_einvoice_document", "clear_incoming_cheque",
  "clone_chart_of_accounts_template", "clone_tenant_role_templates", "close_cashier_session",
  "complete_unit_handover", "compute_input_tax_split", "compute_service_charge_allocations",
  "convert_to_base", "create_cashbox", "create_fiscal_year", "create_installment_plan",
  "create_journal_entry", "create_member_invitation", "create_organization",
  "create_organization_onboarding", "create_purchase_order", "create_purchase_request",
  "create_resort", "create_tax_rule_draft", "create_unit_lease", "creditable_remaining",
  "current_member_id", "decide_purchase_request", "delete_resort", "depreciable_remaining",
  "depreciation_for_period", "disable_payment_provider", "dispose_fixed_asset",
  "due_ids_have_pending_online_checkout", "due_outstanding", "enable_payment_provider",
  "end_unit_lease", "finalize_bank_reconciliation", "generate_lease_rent_dues",
  "generate_recurring_dues", "get_account_ledger", "get_bank_match_candidates",
  "get_bank_reconciliation_summary", "get_cash_flow_statement", "get_cash_position",
  "get_einvoice_source_for_credit_note", "get_einvoice_source_for_due", "get_entitlement",
  "get_exchange_rate", "get_journal_entry_for_view", "get_lease_deposit_summary",
  "get_own_organization_display", "get_payment_provider_settings_credentials",
  "get_service_charge_allocations", "get_tax_decision_coverage", "get_trial_balance",
  "get_unrecognized_dues_summary", "handle_new_user", "has_financial_permission", "has_permission",
  "is_org_member", "is_platform_admin", "is_resort_member", "issue_credit_note", "issue_dues",
  "issue_service_charge_levy", "link_unit_ownership", "list_catalogue_items", "list_credit_notes",
  "list_creditable_dues", "list_due_type_catalogue_links", "list_due_type_tax_mappings",
  "list_dunning_candidates", "list_dunning_notices", "list_exchange_rates", "list_fixed_assets",
  "list_projects", "list_tax_enforcement_lapses", "log_coa_change", "next_sequence_value",
  "open_cashier_session", "organization_is_active", "pay_commission", "post_depreciation_for_period",
  "post_due_to_ledger", "post_fx_difference", "post_journal_entry", "post_supplier_invoice",
  "post_supplier_invoice_in_currency", "preview_generate_recurring_dues", "project_wip_summary",
  "raise_dunning_notices", "recognize_pending_dues", "reconcile_cashier_session",
  "record_dunning_delivery", "record_einvoice_attempt", "record_expense", "record_incoming_cheque",
  "record_input_tax_decision", "record_lease_deposit_event", "record_payment",
  "record_payment_provider_verification", "record_supplier_payment", "record_tax_decision_for_due",
  "record_tax_decision_for_due_internal", "release_project_wip", "reopen_bank_reconciliation",
  "resolve_due_buyer", "resolve_input_tax_account", "resolve_output_tax_account", "resolve_tax_rule",
  "restore_unit", "reverse_journal_entry", "reverse_tax_decision",
  "revoke_due_type_revenue_nature_approval", "run_due_schedules", "schedule_unit_handover",
  "set_asset_disposal_accounts", "set_cheque_status", "set_due_type_catalogue_item",
  "set_due_type_revenue_nature", "set_einvoice_profile_enabled", "set_einvoice_profile_verification",
  "set_expense_account_input_tax", "set_fiscal_period_status", "set_fx_difference_accounts",
  "set_input_tax_account", "set_member_tax_identity", "set_organization_status",
  "set_output_tax_account", "set_purchase_order_status", "set_tax_enforcement",
  "set_unit_lease_billing_recipient", "settle_supplier_invoice_fx_difference",
  "submit_journal_entry_for_review", "supersede_tax_rule", "sync_member_primary_phone",
  "trg_credit_note_immutable", "trg_dues_post_to_ledger", "trg_dues_tax_decision",
  "trg_input_tax_decision_immutable", "trg_members_tax_identity_changed",
  "trg_organizations_tax_identity_changed", "update_resort", "update_unit", "upsert_catalogue_item",
  "upsert_einvoice_profile", "upsert_payment_provider_settings", "verify_financial_audit_chain",
  "void_payment", "void_supplier_payment",
]);

type InventoryRow = {
  function_name: string;
  is_security_definer: boolean;
  anon_can_execute: boolean;
  authenticated_can_execute: boolean;
};

describe("Security invariant — function EXECUTE grants", () => {
  let admin: SupabaseClient;
  let inventory: InventoryRow[];

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await admin.rpc("security_function_grant_inventory");
    expect(error, `inventory RPC failed: ${error?.message}`).toBeNull();
    inventory = (data ?? []) as InventoryRow[];
    expect(inventory.length).toBeGreaterThan(0);
  });

  it("no application function is executable by anon", () => {
    const anonExecutable = inventory
      .filter((r) => r.anon_can_execute)
      .map((r) => r.function_name)
      .sort();

    expect(
      anonExecutable,
      `anon must not execute any application function. Offenders: ${anonExecutable.join(", ")}`,
    ).toEqual([]);
  });

  it("internal functions are never executable by anon or authenticated", () => {
    const offenders = inventory
      .filter(
        (r) =>
          (INTERNAL_FUNCTIONS_NEVER_CLIENT_CALLABLE as readonly string[]).includes(r.function_name) &&
          (r.anon_can_execute || r.authenticated_can_execute),
      )
      .map((r) => r.function_name)
      .sort();

    expect(
      offenders,
      `These are unguarded internals / credential accessors and must never be client-callable. ` +
        `Reaching post_payment_internal or post_journal_entry_internal directly bypasses the RBAC ` +
        `guard on record_payment / post_journal_entry entirely. Offenders: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("every internal function on the denylist still exists (denylist has not gone stale)", () => {
    const present = new Set(inventory.map((r) => r.function_name));
    const missing = (INTERNAL_FUNCTIONS_NEVER_CLIENT_CALLABLE as readonly string[])
      .filter((fn) => !present.has(fn))
      .sort();

    expect(
      missing,
      `Denylisted functions no longer exist, so the guard above is silently vacuous for them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("authenticated-executable SECURITY DEFINER set matches the approved baseline exactly", () => {
    const actual = new Set(
      inventory
        .filter((r) => r.is_security_definer && r.authenticated_can_execute)
        .map((r) => r.function_name),
    );

    const added = [...actual].filter((fn) => !AUTHENTICATED_SECDEF_ALLOWLIST.has(fn)).sort();
    const removed = [...AUTHENTICATED_SECDEF_ALLOWLIST].filter((fn) => !actual.has(fn)).sort();

    // Reported separately: a widened surface is a security regression, while a
    // narrowed one is usually an intentional tightening that still needs the
    // baseline updated in the same commit.
    expect(
      added,
      `NEW functions became authenticated-executable and are not in the approved baseline. ` +
        `This is how the migration-4 regression happened. Confirm each is intended, then add it ` +
        `to the allowlist in the same commit as its migration: ${added.join(", ")}`,
    ).toEqual([]);

    expect(
      removed,
      `Functions in the baseline are no longer authenticated-executable. If that was intended, ` +
        `remove them from the allowlist in the same commit: ${removed.join(", ")}`,
    ).toEqual([]);

    expect(actual.size).toBe(AUTHENTICATED_SECDEF_ALLOWLIST.size);
  });
});
