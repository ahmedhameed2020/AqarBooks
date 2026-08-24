/**
 * AqarBooks Tenant Backup — authoritative table classification, v1.
 *
 * Source of truth: Phase 0 architecture-discovery audit (2026-08-24) plus its
 * closure addendum and final mechanical gate, re-verified against the live
 * `public` schema of project ataslxkcflxuilpgyepm via
 * `information_schema.tables` / `information_schema.table_constraints` on
 * 2026-08-24. 104 base tables total; every one appears in exactly one bucket
 * below, and the counts are asserted by tests/backup-table-classification.test.ts.
 *
 * This is DATA, not a live query. It intentionally does not "discover" the
 * schema at runtime — a snapshot extractor must fail closed the moment the
 * live schema contains a table this file doesn't know about (see
 * `assertKnownTableSet`), rather than silently guess a classification for it.
 * Updating this file (adding/reclassifying a table) is itself the reviewable
 * change when the schema evolves — see docs/backup-recovery/tenant-backup-format-v1.md.
 */

export type TenantTableClassification =
  | "TENANT_ROOT"
  | "TENANT_OWNED_DIRECT"
  | "TENANT_OWNED_INDIRECT"
  | "GLOBAL_REFERENCE"
  | "PLATFORM_INTERNAL"
  | "AUTH_IDENTITY";

export type BackupDisposition =
  /** Included in the tenant package, ordered per the dependency graph. */
  | "INCLUDE"
  /** Never copied as tenant rows; the referenced id is resolved against the destination's live copy at restore time. */
  | "EXCLUDE_RESOLVE_BY_ID"
  /** Never part of a tenant package under any circumstance. */
  | "EXCLUDE_ENTIRELY"
  /** The tenant root itself — not a "row to include," see the identity-preserving recovery contract. */
  | "REFERENCE_ONLY";

export interface TableClassificationEntry {
  table: string;
  classification: TenantTableClassification;
  /** For TENANT_OWNED_INDIRECT only: the FK chain reaching a TENANT_OWNED_DIRECT/ROOT ancestor. */
  tenantPath?: string;
  disposition: BackupDisposition;
}

function direct(table: string): TableClassificationEntry {
  return { table, classification: "TENANT_OWNED_DIRECT", disposition: "INCLUDE" };
}

function indirect(table: string, tenantPath: string): TableClassificationEntry {
  return { table, classification: "TENANT_OWNED_INDIRECT", tenantPath, disposition: "INCLUDE" };
}

function globalRef(table: string): TableClassificationEntry {
  return { table, classification: "GLOBAL_REFERENCE", disposition: "EXCLUDE_RESOLVE_BY_ID" };
}

function platformInternal(table: string): TableClassificationEntry {
  return { table, classification: "PLATFORM_INTERNAL", disposition: "EXCLUDE_ENTIRELY" };
}

/** The 82 tables carrying a direct `organization_id` FK to `organizations.id` — confirmed via information_schema on 2026-08-24. */
const TENANT_OWNED_DIRECT_TABLES = [
  "alert_digest_runs", "alert_dismissals", "alert_settings", "bank_accounts",
  "bank_statement_lines", "bank_statements", "banks", "brokers", "budgets",
  "buildings", "cash_transactions", "cashboxes", "cashier_sessions",
  "catalogue_items", "chart_of_accounts", "cheques", "commissions",
  "cost_centers", "credit_notes", "document_number_counters",
  "document_numbers", "document_sequences", "due_generation_runs",
  "due_schedules", "due_type_revenue_natures", "due_types", "dues",
  "dunning_notices", "dunning_policies", "einvoice_documents",
  "einvoice_profiles", "einvoice_submission_attempts", "exchange_rates",
  "expense_account_input_tax", "expense_categories", "expenses",
  "financial_audit_logs", "fiscal_periods", "fiscal_years",
  "fixed_asset_depreciation", "fixed_assets", "input_tax_decisions",
  "installment_plans", "journal_entries", "lease_rent_generation_runs",
  "member_activity_log", "member_documents", "member_invitations",
  "member_phones", "member_saved_filters", "member_tag_assignments",
  "member_tags", "members", "online_payment_transactions",
  "organization_finance_settings", "organization_memberships",
  "payment_provider_settings", "payments", "platform_audit_logs",
  "projects", "properties", "property_import_logs", "purchase_orders",
  "purchase_requests", "resort_memberships", "roles",
  "service_charge_allocations", "service_charge_levies", "subscriptions",
  "supplier_invoices", "supplier_payments", "suppliers", "tax_decisions",
  "tenant_branding", "tenant_feature_flags", "unit_handover_snags",
  "unit_handovers", "unit_leases", "unit_ownerships", "units",
  "user_role_assignments", "zones",
] as const;

export const TENANT_BACKUP_TABLE_CLASSIFICATION_V1: readonly TableClassificationEntry[] = [
  { table: "organizations", classification: "TENANT_ROOT", disposition: "REFERENCE_ONLY" },

  ...TENANT_OWNED_DIRECT_TABLES.map(direct),

  // TENANT_OWNED_INDIRECT (9) — one FK hop to a TENANT_OWNED_DIRECT parent. Phase 0 §4/§19.
  indirect("cheque_status_history", "cheque_id -> cheques.organization_id"),
  indirect("journal_entry_lines", "journal_entry_id -> journal_entries.organization_id"),
  indirect("member_invitation_short_links", "invitation_id -> member_invitations.organization_id"),
  indirect("online_payment_transaction_allocations", "due_id -> dues.organization_id"),
  indirect("payment_allocations", "payment_id -> payments.organization_id"),
  indirect("plan_installments", "due_id -> dues.organization_id"),
  indirect("role_permissions", "role_id -> roles.organization_id"),
  indirect("supplier_payment_allocations", "payment_id -> supplier_payments.organization_id"),
  indirect("unit_lease_deposit_events", "lease_id -> unit_leases.organization_id"),

  // GLOBAL_REFERENCE (9) — zero FK path to organizations; shared platform catalog/lookup data. Never duplicated into a tenant package.
  globalRef("coa_template_accounts"),
  globalRef("coa_templates"),
  globalRef("permissions"),
  globalRef("plan_entitlements"),
  globalRef("plans"),
  globalRef("revenue_natures"),
  globalRef("role_template_permissions"),
  globalRef("role_templates"),
  globalRef("tax_rule_versions"),

  // PLATFORM_INTERNAL (2) — pre-tenant, no tenant relationship of any kind.
  platformInternal("contact_requests"),
  platformInternal("demo_leads"),

  // AUTH_IDENTITY (1) — FKs to auth.users.id, not to organizations. Excluded raw; only an id->email map travels in a package (§7/§22 of the Phase 0 report).
  { table: "profiles", classification: "AUTH_IDENTITY", disposition: "EXCLUDE_ENTIRELY" },
];

const BY_TABLE = new Map(TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => [e.table, e]));

export class UnknownTableError extends Error {
  constructor(public readonly table: string) {
    super(
      `UNKNOWN ownership: "${table}" is not in the Phase-0-derived classification. ` +
        `A tenant backup package cannot include a table this file doesn't know about — ` +
        `update lib/backup/table-classification.ts deliberately (with review) before it can be extracted.`
    );
    this.name = "UnknownTableError";
  }
}

/** Looks up a table's classification. Throws UnknownTableError rather than guessing — fail closed. */
export function classifyTable(table: string): TableClassificationEntry {
  const entry = BY_TABLE.get(table);
  if (!entry) throw new UnknownTableError(table);
  return entry;
}

/**
 * Asserts that every table in `liveTableNames` (e.g. from a fresh
 * information_schema query against the source project) is known to this
 * classification, AND that this classification doesn't reference a table
 * that no longer exists live. Either direction of drift fails closed.
 */
export function assertKnownTableSet(liveTableNames: readonly string[]): void {
  const live = new Set(liveTableNames);
  const known = new Set(TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => e.table));

  const unrecognized = [...live].filter((t) => !known.has(t));
  if (unrecognized.length > 0) {
    throw new UnknownTableError(unrecognized[0]!);
  }

  const stale = [...known].filter((t) => !live.has(t));
  if (stale.length > 0) {
    throw new Error(
      `Table classification references tables no longer present in the live schema: ${stale.join(", ")}. ` +
        `Update lib/backup/table-classification.ts before extracting — do not extract against a stale map.`
    );
  }
}

/** Tables that belong in an INCLUDE-ordered tenant package, in Phase-0 §5 dependency-graph layer order. Full FK-topological-sort ordering within a layer is a documented refinement, not required for correctness — the post-load FK sweep is what actually proves correctness, not insertion order (see docs/backup-recovery/tenant-backup-format-v1.md §Ordering). */
export const EXTRACTION_LAYER_ORDER: readonly string[] = [
  // Layer 0 — org-level configuration (no forward reference to child tables)
  "organization_finance_settings", "organization_memberships", "user_role_assignments",
  "roles", "role_permissions", "subscriptions", "tenant_branding", "tenant_feature_flags",
  "document_number_counters", "document_numbers", "document_sequences",
  "alert_settings", "alert_dismissals", "alert_digest_runs",
  // Layer 1 — property hierarchy
  "properties", "buildings", "zones", "units",
  "unit_ownerships", "unit_leases", "unit_lease_deposit_events",
  "unit_handovers", "unit_handover_snags",
  "installment_plans",
  "cost_centers", "projects", "fixed_assets", "fixed_asset_depreciation",
  "cashboxes", "cashier_sessions", "cash_transactions",
  "banks", "bank_accounts", "bank_statements", "bank_statement_lines",
  "cheques", "cheque_status_history",
  "due_types", "due_type_revenue_natures", "due_schedules", "due_generation_runs",
  "commissions", "brokers", "resort_memberships",
  // Layer 2 — members / portal
  "members", "member_phones", "member_documents", "member_activity_log",
  "member_invitations", "member_invitation_short_links",
  "member_tags", "member_tag_assignments", "member_saved_filters",
  // Layer 3 — chart of accounts + fiscal calendar (COA seeded from GLOBAL coa_templates, resolved not copied)
  "chart_of_accounts", "fiscal_years", "fiscal_periods", "budgets",
  "exchange_rates", "catalogue_items",
  // Layer 4 — journal + everything that posts to it
  "journal_entries", "journal_entry_lines",
  "dues", "plan_installments", "dunning_policies", "dunning_notices",
  "payments", "payment_provider_settings", "payment_allocations",
  "online_payment_transactions", "online_payment_transaction_allocations",
  "lease_rent_generation_runs",
  "service_charge_levies", "service_charge_allocations",
  "purchase_requests", "purchase_orders",
  "suppliers", "supplier_invoices", "supplier_payments", "supplier_payment_allocations",
  "expense_categories", "expenses", "expense_account_input_tax",
  "credit_notes", "tax_decisions", "input_tax_decisions",
  "einvoice_profiles", "einvoice_documents", "einvoice_submission_attempts",
  "property_import_logs",
  // Layer 5 — audit (financial_audit_logs MUST be last: its own rows chain to each other, not
  // forward to anything else, so ordering it last only avoids incidental FK-lookup churn)
  "platform_audit_logs", "financial_audit_logs",
];
