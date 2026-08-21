# Migration archive — manifest

Captured **2026-08-21** from `master` @ `095fe06`.

This directory holds the migration history as it stood before the baseline squash.
Nothing here is applied by any tool. The files were moved, not rewritten: every
filename and every byte is exactly what was in `supabase/migrations/`, including
the malformed filenames, which are themselves evidence of how they were produced.

## Why the files are here rather than deleted

Git would remember them either way. That is not the same as being findable. Someone
asking in two years whether `void_due` was ever built should not first have to learn
that a squash happened. The files stay in the tree, and this manifest answers the
question directly.

## Counts

| | |
|---|---:|
| Files archived | 228 |
| Parsed by the Supabase CLI | 221 |
| Invisible to the CLI | 7 |
| Unique CLI-visible versions | 212 |
| Applied — name present in the production ledger | 107 |
| No ledger row of that name | 120 |
| Not a migration at all | 1 |
| Production ledger rows on 2026-08-21 | 143 |
| Ledger rows with no repo file of that name | 35 |

## Two groupings that must not be conflated

An earlier draft reported a single number here and produced a contradiction. There
are two different groupings and they answer different questions.

**Raw-prefix groups — 13.** Group all 228 filenames by their
leading 14 digits. This is a text operation on filenames. It has no bearing on tool
behaviour, and it is kept because it records *authoring intent*: whoever wrote
`…004b` plainly believed they were versioning against `…004`.

**CLI-visible version collisions — 9.** Group only the files the CLI
can parse, by the version it extracts. This is the grouping that governs behaviour,
and the one that carries risk: `supabase_migrations.schema_migrations` is
`PRIMARY KEY (version)`, so two files sharing a version cannot both be recorded.
The CLI gives no local warning — `db push --dry-run` offers to push both.

Four of the raw-prefix groups are not collisions at all: their extra members are
suffix-variant files the CLI never parses.

```
CLI-visible files                          221
  - Sum(group_size - 1) over true collisions   9
  ------------------------------------------
  unique CLI-visible versions              212
```

| Prefix group | Files | CLI-visible | Verdict |
|---|---:|---:|---|
| `20260811000007` | 2 | 2 | **true collision** |
| `20260812000001` | 2 | 2 | **true collision** |
| `20260812000002` | 2 | 2 | **true collision** |
| `20260812000003` | 2 | 2 | **true collision** |
| `20260813000004` | 2 | 2 | **true collision** |
| `20260815000004` | 2 | 1 | not a collision |
| `20260815000006` | 2 | 1 | not a collision |
| `20260815000007` | 2 | 1 | not a collision |
| `20260816000001` | 3 | 2 | **true collision** |
| `20260816170000` | 3 | 1 | not a collision |
| `20260819000001` | 2 | 2 | **true collision** |
| `20260831000001` | 2 | 2 | **true collision** |
| `20260831000002` | 2 | 2 | **true collision** |

## The Supabase CLI's naming rule

Verified against CLI v2.78.1 — the pattern was read out of the binary and then
confirmed empirically against an isolated PostgreSQL 17 instance, not assumed.

```
^([0-9]+)_(.*)\.sql$
```

Digits must be followed immediately by `_`. Consequences, all observed directly:

- The six `…b_` / `…c_` files are skipped with a warning and never applied.
- `seed-platform-admin.sql` is likewise skipped. It is not a migration.
- Files in a **subdirectory are entirely invisible** — not listed, not pushed, not warned about.
- Duplicate versions are tolerated silently in the local directory.

## The production ledger, as read on 2026-08-21

`ledger-2026-08-21.tsv` carries `version` and `name` for all
143 rows of `supabase_migrations.schema_migrations`.

Two columns were reviewed and deliberately excluded from this export:

```
All 143 ledger rows had the same non-null created_by value.
The identifier is intentionally omitted from the repository evidence export.
All 143 idempotency_key values were NULL.
```

The reason is evidential, not secrecy: a column holding one value across every row
distinguishes no row from any other, and reproducing it 143 times would widen the
data surface of this repository for no forensic gain. The fact that a single
identity applied all of them is preserved — once, above.

> **The `statements` column is NOT exported here, and its preservation is a hard
> prerequisite for Step 7.** Those rows hold the SQL as actually applied. The
> repository does not have it: 35 ledger rows correspond to no repo file, and
> elsewhere the repo's file boundaries do not match the units that were applied.
> The baseline does not have it either — it describes the end state, not the
> sequence that produced it. Step 7 replaces these rows with a single baseline row;
> until all 143 rows including `statements` are preserved in a reviewed, protected,
> non-repository artifact and verified by count and cryptographic hash, Step 7 must
> not be authorized. This is the one place in the reconciliation where
> `git revert` is not a rollback.

### 35 ledger rows with no repo file of that name

Their DDL is present in the repository, consolidated into feature-grouped files
under different names — sometimes one repo file corresponding to several recorded
migrations. This is why a clean one-to-one reconciliation is impossible: the two
sides do not describe the same units of change.

| Version | Name |
|---|---|
| `20260815011240` | `member_invitation_rpcs_fix_search_path` |
| `20260815141646` | `online_payment_transactions_updated_at_trigger` |
| `20260815143256` | `expire_stale_online_payment_transactions_comment` |
| `20260815170711` | `post_payment_internal_extraction` |
| `20260815170819` | `post_payment_internal_revoke_anon` |
| `20260815172935` | `record_online_payment_fix_status_ambiguity` |
| `20260816073044` | `create_online_payment_checkout_transaction_double_booking_fix` |
| `20260817102126` | `drop_orphaned_record_payment_provider_verification_3arg` |
| `20260817191720` | `fix_lease_rent_due_date_ordering` |
| `20260817215328` | `bank_reconciliation_auto_match_uuid_agg_fix` |
| `20260818092241` | `deposit_settings_validation_and_nullable_clearing` |
| `20260818092329` | `finance_settings_clearing_account_optional` |
| `20260818094956` | `broker_commission_engine` |
| `20260818100329` | `service_charges_handed_over_filter` |
| `20260818143424` | `revenue_classification_foundation_rpcs` |
| `20260818143848` | `tax_rule_delete_guard_by_reference` |
| `20260818151823` | `tax_decision_derive_from_source_schema` |
| `20260818151904` | `tax_decision_derive_from_source_rpcs` |
| `20260818153921` | `per_org_tax_enforcement_schema` |
| `20260818154006` | `per_org_tax_enforcement_logic` |
| `20260818204018` | `output_vat_amount_on_tax_decision` |
| `20260818204104` | `readiness_requires_amount_basis_v2` |
| `20260818205949` | `output_tax_account_upsert_fix_and_readiness` |
| `20260818210048` | `tax_decision_before_ledger_and_three_line_entry` |
| `20260818212618` | `readiness_buyer_identity_gaps` |
| `20260818214002` | `input_tax_decisions_and_readiness` |
| `20260818214318` | `finance_settings_allow_organization_scope` |
| `20260818214446` | `tax_account_overrides_move_to_organizations` |
| `20260818220121` | `compute_input_tax_split` |
| `20260818220206` | `supplier_invoice_posting_respects_input_tax_eligibility` |
| `20260818223948` | `catalogue_items_and_egs_codes` |
| `20260818225612` | `credit_note_number_is_per_note_not_per_due` |
| `20260819171545` | `depreciation_final_instalment_absorbs_drift` |
| `20260819213311` | `dunning_delivery_recording` |
| `20260819215120` | `project_wip_costing` |

## Present in the repository, never applied

Not recorded in the ledger, and none of the objects they declare exist in
production. No later migration drops them. Re-verified by direct catalogue query
on 2026-08-21.

| File | Declares | In production 2026-08-21 |
|---|---|---|
| `20260812000007_void_due.sql` | function void_due | absent |
| `20260812000030_supplier_invoice_attachments.sql` | table supplier_invoice_attachments | absent |
| `20260812000031_bank_account_rpcs.sql` | functions create_bank, create_bank_account | absent |

These remain declared in the committed `lib/supabase/types.ts`, so TypeScript will
accept a call that fails at runtime with `PGRST202`. Nothing in the application
calls them today.

**Open question, deliberately not answered by this archive:** build them, or record
them as abandoned. That is a product decision. Archiving them does not settle it,
and this entry exists so the question stays visible.

## Known historical references

Comments naming a migration file by path. Nothing resolves these at build or run
time — no build step, test, or runtime path reads this directory — so they degrade
to stale references, never to broken builds. They are listed rather than edited;
two of them are inside `lib/supabase/types.ts`, which is out of scope.

- `app/i/[slug]/route.ts:5`
- `lib/actions/online-payment-checkout.ts:20`
- `lib/einvoice/types.ts:10`
- `lib/supabase/types.ts:2569`
- `lib/supabase/types.ts:2582`
- `tests/payments/payment-provider-verification-race.test.ts:3`
- `tests/pgtap.integration.test.ts:38`
- `tests/pgtap.integration.test.ts:119`
- `tests/pgtap.integration.test.ts:127`

Two documentation links pointed at `supabase/migrations/` by relative path and
would have 404'd after the move. Their targets were repointed at this archive as
part of the same change — link targets only, no prose:

- `docs/reviews/input-tax-historical-invoices.md`
- `docs/reviews/revenue-posting-paths.md`

## Every archived file

`CLI` — parsed by the Supabase CLI. `Ledger` — whether a row of that name exists in
production. `Added` — the commit that introduced the file; `(via rename)` marks the
six Phase 1 files renamed to match their applied versions.

| File | Bytes | SHA-256 | CLI | Ledger | Added |
|---|---:|---|:---:|---|---|
| `20260810000001_extensions.sql` | 344 | `dbb876350ec1f759…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000002_foundation_tables.sql` | 5577 | `9c8463d91b023512…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000003_foundation_functions.sql` | 2303 | `354f323b5dffd5bb…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000004_foundation_rls.sql` | 6299 | `c4c0b4b5848b73a8…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000005_foundation_seed.sql` | 3065 | `dfdace2c11c88d83…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000006_profile_on_signup.sql` | 510 | `c531488de1b9f1f9…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000007_plans_subscriptions.sql` | 2109 | `b96e626881c3f9d5…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000008_tenant_extras.sql` | 797 | `976a91bdb139df60…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000009_leads.sql` | 1085 | `317ae3c417502f92…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000010_role_templates.sql` | 1462 | `3018a460ff025e1d…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000011_phase2_rls.sql` | 4589 | `d278f11e98911153…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000012_phase2_seed.sql` | 6185 | `8169b24759542e81…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000013_org_lifecycle_functions.sql` | 4774 | `e9dcfc00a4a8594a…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000014_membership_functions.sql` | 1694 | `e147295c6f3ce780…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000015_accounting_core_tables.sql` | 6870 | `6c67ce14124c0c4a…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000016_journal_tables.sql` | 2670 | `f2b567faf8b87351…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000017_journal_engine.sql` | 11513 | `3fadc577a1539408…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000018_accounting_rls.sql` | 4062 | `7f884ab9abaa2407…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000019_coa_template.sql` | 5555 | `c5c300eae11df114…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000020_fiscal_year_functions.sql` | 3312 | `8960937a8c1e6999…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000021_fix_organization_is_active.sql` | 846 | `e8012feac9729456…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000022_fix_sequence_null_resort.sql` | 1531 | `8260d3e31eace440…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000023_property_tables.sql` | 3906 | `ded6cf1269b51e94…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000024_receivables_tables.sql` | 4094 | `443828466724267f…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000025_receivables_engine.sql` | 8050 | `a043010b0e72a153…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000026_property_receivables_rls.sql` | 4223 | `bf9d617a28f91c4a…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000027_payment_idempotency.sql` | 5579 | `789b7f22ab690528…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000028_cashier_tables.sql` | 2711 | `3bf31e9c00278182…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000029_cashier_engine.sql` | 4838 | `535157536de0ade1…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000030_record_payment_cashier_session.sql` | 6844 | `dc861133c949ed7b…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000031_banks_cheques_tables.sql` | 2694 | `69e69ff99ee48d86…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000032_cheque_engine.sql` | 5123 | `e0d82bfc15c7e39d…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000033_treasury_banking_rls.sql` | 2792 | `522a8e4738b32a1d…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000034_cleanup_stale_record_payment.sql` | 612 | `caeaae5759ead9a7…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000035_suppliers_purchasing_tables.sql` | 3309 | `8b6c8a10cc6d0d82…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000036_purchasing_workflow.sql` | 6665 | `ec6b4442eff2f758…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000037_supplier_invoices_expenses_tables.sql` | 4058 | `c44bbf2d58dcfba9…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000038_supplier_invoice_payment_engine.sql` | 12689 | `916e3122044047aa…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000039_purchasing_rls.sql` | 2762 | `a022b7cb146378f6…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000040_reporting_functions.sql` | 3257 | `1a94b6d443f22407…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000041_fix_is_org_member_invited_status.sql` | 1293 | `048d473673a4bb87…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000042_units_with_financials_view.sql` | 2872 | `5a44d7b7626ddc58…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000043_members_with_financials_view.sql` | 2230 | `737bc1f0d3b3ea21…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000044_units_custom_type_label.sql` | 2531 | `e3daa1453952f269…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000045_property_csv_import.sql` | 9672 | `32d30d448b8ec8d1…` | yes | no row | `e5bd7c4` 2026-08-11 |
| `20260810000046_property_import_created_by.sql` | 704 | `6e0a04f91f98e571…` | yes | no row | `8408445` 2026-08-16 |
| `20260810000047_import_dedupe_members.sql` | 9817 | `d901777a07d9248e…` | yes | no row | `8408445` 2026-08-16 |
| `20260810000048_import_units_upsert.sql` | 11943 | `982a0e62aa60bf66…` | yes | applied | `8408445` 2026-08-16 |
| `20260811000001_phase8_record_payment.sql` | 9776 | `39101b7d66592f95…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000002_phase9_dues_engine.sql` | 14936 | `8491d949facfde67…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000003_phase11_financial_audit.sql` | 8471 | `4302f2668a135927…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000004_phase11_audit_integrations.sql` | 20979 | `25a9a8d19397aca7…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000005_phase11_financial_rbac.sql` | 6962 | `19a99adab3c85cae…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000006_organizations_entity_type.sql` | 606 | `1d274816e243ffc4…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000007_organizations_entity_type_expand.sql` | 730 | `40b86071e84bd86b…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000007_phase12_onboarding_schema.sql` | 8806 | `8af3936de2f97006…` | yes | no row | `8408445` 2026-08-16 |
| `20260811000008_organizations_entity_type_custom_label.sql` | 540 | `562edc6c602e3001…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000001_fix_onboarding_rpc_grant.sql` | 491 | `5bde963e6167eb97…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000001_organizations_contact_details.sql` | 1228 | `03f28c103ee664b5…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000002_fix_onboarding_rpc_role_lookup.sql` | 7226 | `b46566c5af201260…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000002_resort_contact_details_and_crud.sql` | 5099 | `85ff4e4d889c47fc…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000003_member_phones_and_ownership.sql` | 7865 | `95448505d0d5acec…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000003_members_next_level.sql` | 7149 | `cf6857bd0e218084…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000004_fix_has_financial_permission_grant.sql` | 737 | `bf236ea654a6aced…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000005_fix_tenant_owner_finance_permissions.sql` | 2020 | `3bffc90b79dfbcbc…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000006_fix_coa_template_name_corruption.sql` | 610 | `ba33ddf4ccbcc27b…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000007_void_due.sql` | 1557 | `43498d16046e55f7…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000008_unit_edit_archive.sql` | 8534 | `3805ce105b5866cb…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000009_dues_finance_permission_rls.sql` | 3830 | `ae3d279654de1906…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000010_preview_generate_recurring_dues.sql` | 5022 | `4d53bdf295d26d49…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000011_backfill_finance_permissions_for_roles.sql` | 6021 | `742c9ed84ee796e1…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000012_payments_finance_permission_rls.sql` | 1344 | `43e830d124f92cde…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000013_payment_void_schema.sql` | 2946 | `b499a951ae8c6af8…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000014_finance_payments_void_permission.sql` | 1161 | `bc7239b8d2aca288…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000015_void_payment.sql` | 8549 | `f1056a9c09e3a569…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000016_record_payment_exclude_reversed.sql` | 11248 | `1bcc36ee6c210924…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000017_payments_deposit_account_nullable.sql` | 238 | `f007eb6fdb5a1e4f…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000018_record_expense_resort_validation.sql` | 4830 | `f695c513a303657e…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000019_finance_expenses_read_permission.sql` | 1900 | `4c95244f118423b6…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000020_resync_tenant_owner_permissions.sql` | 1731 | `a433ca3ddd24cbdf…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000021_record_supplier_payment_fixes.sql` | 9174 | `12cd6521bb9d9b2a…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000022_purchasing_resort_validation.sql` | 7197 | `c024d1fd7031fc23…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000023_finance_suppliers_read_permission.sql` | 4271 | `7e8cd5d1fc47fac2…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000024_suppliers_extra_details.sql` | 471 | `2eccbf419023117a…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000025_supplier_invoice_vat_wht.sql` | 18486 | `fea1dc8e7a99ce03…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000026_invoice_po_matching.sql` | 8159 | `d745cabcd9e2e003…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000027_supplier_void_schema.sql` | 4566 | `fa57cc9bc1cd12e6…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000028_finance_suppliers_void_permission.sql` | 1660 | `74c9ee27fa6b489b…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000029_void_supplier_invoice_and_payment.sql` | 20152 | `994ffce2ea48290d…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000030_supplier_invoice_attachments.sql` | 2950 | `bab687f891929a15…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000031_bank_account_rpcs.sql` | 4646 | `7993735ea4d0c5f1…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000032_banks_resort_validation.sql` | 10393 | `b14fd3b30eaba011…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000033_cashier_resort_validation.sql` | 5165 | `f16ea3a74122b3c7…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000034_cheque_error_messages.sql` | 3695 | `0970c41c01be7035…` | yes | no row | `8408445` 2026-08-16 |
| `20260812000035_cashier_p0_fixes.sql` | 15091 | `dab5627e94caf78f…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000001_coa_error_codes_and_audit.sql` | 5191 | `12f40d11e07fa99e…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000002_reports_permission_hardening.sql` | 3928 | `fcce5f2fbc7e8c59…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000003_journal_resort_and_review_permission.sql` | 6008 | `d53545aca3fcfffa…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000004_budgets.sql` | 3051 | `fdad1fcb8b55b319…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000004_fix_coa_clone_template_safe_delete.sql` | 1567 | `10c5ee54fc7c0a0c…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000005_payment_posting_permission_fix_and_overload_cleanup.sql` | 20737 | `4bb73e8c31d08a83…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000006_record_expense_posting_permission_fix.sql` | 5517 | `6f730a4627136455…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000007_journal_entry_view_resort_isolation.sql` | 3580 | `38b8950204279b19…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000008_supplier_posting_permission_fix_and_dead_function_cleanup.sql` | 18184 | `a8c493a4a8efd536…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000009_supplier_invoices_vat_wht_columns_backfill.sql` | 7174 | `d7d1b838ba7aaf92…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000010_supplier_void_explicit_dual_permission_hardening.sql` | 12332 | `fcadf4acc84a35e2…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000011_finance_suppliers_void_permission_backfill.sql` | 1963 | `643ec7e2cb878bb2…` | yes | no row | `8408445` 2026-08-16 |
| `20260813000012_record_payment_idempotency_race_safety.sql` | 10117 | `ac26bfa81897896c…` | yes | no row | `8408445` 2026-08-16 |
| `20260814000001_member_portal_identity_schema.sql` | 1612 | `bdd6f64e2c8b97f2…` | yes | applied | `81d2989` 2026-08-15 |
| `20260814000002_current_member_id_and_members_rls.sql` | 918 | `26599db3c87aead3…` | yes | applied | `fc32272` 2026-08-15 |
| `20260814000003_members_portal_invite_permission.sql` | 1246 | `fb929b33fedbead0…` | yes | applied | `e5a2c1a` 2026-08-15 |
| `20260814000004_member_invitation_rpcs.sql` | 7134 | `2292a4871952412a…` | yes | applied | `d540fd7` 2026-08-15 |
| `20260814000006_checkpoint2_security_hardening.sql` | 2456 | `c2423682221ce46c…` | yes | applied | `6322ca1` 2026-08-15 |
| `20260814000007_member_portal_data_rls.sql` | 3465 | `7ff5fd2530a731c2…` | yes | applied | `91a4b97` 2026-08-15 |
| `20260814000008_portal_organization_display_rpc.sql` | 1948 | `3a5653caea4606d8…` | yes | applied | `6d859a9` 2026-08-15 |
| `20260815000001_online_payment_transactions_schema.sql` | 5726 | `3121cb2c3d1d2dd2…` | yes | applied | `fccced2` 2026-08-15 |
| `20260815000002_online_payment_transactions_rls.sql` | 2191 | `2eaec0421a421557…` | yes | applied | `1f88d40` 2026-08-15 |
| `20260815000003_expire_stale_online_payment_transactions.sql` | 2013 | `f5e0a30f7cb41c2a…` | yes | applied | `4cf2066` 2026-08-15 |
| `20260815000004_organization_finance_settings.sql` | 3539 | `f020e10c7b9fd72a…` | yes | applied | `93a940b` 2026-08-15 |
| `20260815000004b_organization_finance_settings_resort_org_check.sql` <br><sub>digits followed by 'b' not '_' — invisible to the CLI</sub> | 2465 | `82781654a9208704…` | no | applied | `7807bb8` 2026-08-15 |
| `20260815000005_payments_online_method.sql` | 517 | `16d7f34a2246454f…` | yes | applied | `651336a` 2026-08-15 |
| `20260815000006_post_payment_internal.sql` | 11937 | `3928b4a2bf008e56…` | yes | no row | `ddf617c` 2026-08-15 |
| `20260815000006b_post_payment_internal_search_path_fix.sql` <br><sub>digits followed by 'b' not '_' — invisible to the CLI</sub> | 11852 | `e91bbc6e598ddd0f…` | no | applied | `9ff3156` 2026-08-15 |
| `20260815000007_record_online_payment.sql` | 9793 | `2cf29aeae0e142d6…` | yes | applied | `863f7c3` 2026-08-15 |
| `20260815000007b_record_online_payment_lock_ordering_fix.sql` <br><sub>digits followed by 'b' not '_' — invisible to the CLI</sub> | 11902 | `e8ef7b253a079381…` | no | applied | `8af35e9` 2026-08-15 |
| `20260816000001_add_property_type_to_resorts.sql` | 1220 | `c538c9309b4f345a…` | yes | applied | `a5c0711` 2026-08-16 |
| `20260816000001_create_online_payment_checkout_transaction.sql` | 4490 | `fd6f6bcf51a8a49c…` | yes | applied | `623d774` 2026-08-16 |
| `20260816000001b_checkout_transaction_double_booking_fix.sql` <br><sub>digits followed by 'b' not '_' — invisible to the CLI</sub> | 7298 | `e3b336e5b56b5aa1…` | no | no row | `aaaa6ab` 2026-08-16 |
| `20260816000002_drop_orphaned_post_supplier_invoice_10arg_overload.sql` | 1522 | `1b4af730b391bba7…` | yes | applied | `657dc2f` 2026-08-16 |
| `20260816000003_drop_orphaned_resort_crud_overloads.sql` | 1442 | `f44dc568d5f41da8…` | yes | applied | `657dc2f` 2026-08-16 |
| `20260816170000_payment_provider_settings_schema.sql` | 21102 | `a63553bcce52b6d9…` | yes | applied | `251cd06` 2026-08-16 |
| `20260816170000b_payment_provider_settings_fix_vault_secret_name_collision.sql` <br><sub>digits followed by 'b' not '_' — invisible to the CLI</sub> | 4456 | `d9cdaf4fb93f7d6f…` | no | applied | `251cd06` 2026-08-16 |
| `20260816170000c_payment_provider_settings_active_org_and_error_cap.sql` <br><sub>digits followed by 'c' not '_' — invisible to the CLI</sub> | 8211 | `3b5533e20a6e253a…` | no | applied | `8bee132` 2026-08-16 |
| `20260816180000_payment_provider_settings_no_tenant_setting_distinction.sql` | 3692 | `a41f08c70c807ef6…` | yes | applied | `be1609b` 2026-08-16 |
| `20260817000001_rename_resorts_to_properties.sql` | 1945 | `97dfab6d93d63a6e…` | yes | applied | `75118a1` 2026-08-16 |
| `20260817000002_resorts_view_security_invoker_fix.sql` | 1851 | `7589e725d527903d…` | yes | no row | `2533e49` 2026-08-16 |
| `20260818000001_rename_resort_id_property_cluster.sql` | 1357 | `49ea3309a4746e93…` | yes | applied | `d17015c` 2026-08-16 |
| `20260818000002_update_functions_for_property_id_cluster.sql` | 32641 | `3b96738bd72dbf3a…` | yes | applied | `d6ed1e8` 2026-08-16 |
| `20260819000001_organizations_branding_fields.sql` | 297 | `72ad10bc6e238b2d…` | yes | no row | `749823a` 2026-08-19 |
| `20260819000001_rename_resort_id_membership_misc_cluster.sql` | 696 | `73c94c55a820bfad…` | yes | applied | `99c3dad` 2026-08-16 |
| `20260819000002_update_functions_for_membership_misc_cluster.sql` | 1540 | `21b981cc8135ee81…` | yes | applied | `0c9e91d` 2026-08-16 |
| `20260820000001_rename_resort_id_platform_audit_logs.sql` | 429 | `5afb57f0d61d2b89…` | yes | applied | `6638e4f` 2026-08-16 |
| `20260820000002_update_functions_for_platform_audit_logs.sql` | 82071 | `09968e0ccc13522c…` | yes | applied | `d9bd8ae` 2026-08-16 |
| `20260820190233_phase1_pin_function_search_path.sql` | 2891 | `40b3f403a1d9170b…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260820190307_phase1_lease_rent_generation_runs_rls.sql` | 1803 | `0df76bfe3e3c3510…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260820190446_phase1_record_payment_collapse.sql` | 3889 | `f9684ab0511f5b5a…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260820190630_phase1_revoke_anon_function_execute.sql` | 2982 | `9db9f9d1ada02e9f…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260820191859_phase1_fix_internal_function_overgrant.sql` | 2936 | `7932cb5dc0dbb7f8…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260820192502_phase1_security_grant_inventory.sql` | 2248 | `88d5963109078b73…` | yes | applied | `0f75b7e` 2026-08-20 (via rename) |
| `20260821000001_rename_resort_id_treasury_cluster.sql` | 585 | `7af36a50eb7a88e1…` | yes | applied | `235fb82` 2026-08-16 |
| `20260821000002_update_functions_for_treasury_cluster.sql` | 13313 | `af4a7f083425ef31…` | yes | applied | `55ef6bd` 2026-08-16 |
| `20260822000001_rename_resort_id_purchasing_cluster.sql` | 691 | `343490b5bfedfbf2…` | yes | applied | `a6cab19` 2026-08-16 |
| `20260822000002_update_functions_for_purchasing_cluster.sql` | 34491 | `94fd6d261f5d778e…` | yes | applied | `a46598d` 2026-08-16 |
| `20260823000001_rename_resort_id_coa_roles_cluster.sql` | 673 | `a2af0547e2db9455…` | yes | applied | `7a888c4` 2026-08-16 |
| `20260823000002_update_functions_for_coa_roles_cluster.sql` | 22521 | `b0c0a01967a7fc99…` | yes | applied | `f56b33c` 2026-08-16 |
| `20260824000001_rename_resort_id_journal_entries_cluster.sql` | 609 | `39031ed2680d5f42…` | yes | applied | `8a0dc70` 2026-08-16 |
| `20260824000002_update_functions_for_journal_entries_cluster.sql` | 12398 | `efaf66e6f0399d5f…` | yes | applied | `186f6f4` 2026-08-16 |
| `20260825000001_rename_resort_id_payments_dues_core_cluster.sql` | 902 | `69891282ce66bb70…` | yes | applied | `50bc5b5` 2026-08-16 |
| `20260825000002_update_functions_for_payments_dues_core_cluster.sql` | 54531 | `523c8041ed62f777…` | yes | applied | `a970404` 2026-08-16 |
| `20260827000001_rename_resort_id_provider_settings_expenses_cluster.sql` | 508 | `68dc653f1dfe0337…` | yes | applied | `d3964e9` 2026-08-17 |
| `20260827000002_update_functions_for_provider_settings_expenses_cluster.sql` | 12022 | `a0287fdcc7a4d381…` | yes | applied | `1782dfd` 2026-08-17 |
| `20260828000001_rename_resort_id_due_schedules_cluster.sql` | 260 | `c77ac1f3995fd4c3…` | yes | applied | `3239b58` 2026-08-17 |
| `20260828000002_update_functions_for_due_schedules_cluster.sql` | 12281 | `d3adf6af3165d0e6…` | yes | applied | `300a629` 2026-08-17 |
| `20260829000001_rename_resort_id_financial_audit_logs_cluster.sql` | 329 | `33a6f0e75a5dbddc…` | yes | applied | `5fa1362` 2026-08-17 |
| `20260829000002_update_functions_for_financial_audit_logs_cluster.sql` | 6480 | `953b739252d5d8dd…` | yes | applied | `985ca7e` 2026-08-17 |
| `20260830000001_payment_provider_settings_verification_credentials.sql` | 2008 | `32c88ad625c1618c…` | yes | applied | `2183390` 2026-08-17 |
| `20260830000002_record_payment_provider_verification_stale_check.sql` | 5447 | `999361746215605c…` | yes | applied | `0ca5701` 2026-08-17 |
| `20260830000003_upsert_payment_provider_settings_reverify_on_merchant_change.sql` | 4410 | `5f272c40b8afe876…` | yes | applied | `14a85a1` 2026-08-17 |
| `20260831000001_cash_flow_account_classification.sql` | 5551 | `339c1d7cc36237cd…` | yes | applied | `ddcb925` 2026-08-18 |
| `20260831000001_enable_btree_gist.sql` | 614 | `89e19adcf2eec232…` | yes | applied | `22f4755` 2026-08-17 |
| `20260831000002_cash_flow_statement_functions.sql` | 4742 | `965b3121173f0fc5…` | yes | applied | `ddcb925` 2026-08-18 |
| `20260831000002_unit_leases_table.sql` | 3840 | `191d0844b8bec473…` | yes | applied | `22f4755` 2026-08-17 |
| `20260831000003_unit_lease_deposit_events.sql` | 1510 | `ff5976d87e51118b…` | yes | applied | `22f4755` 2026-08-17 |
| `20260831000004_unit_leases_permissions.sql` | 1971 | `39ef0609940dd2b5…` | yes | applied | `3913562` 2026-08-17 |
| `20260831000005_unit_leases_rls.sql` | 2120 | `867cf6af38ae4f3a…` | yes | applied | `3913562` 2026-08-17 |
| `20260831000006_unit_lease_rpcs.sql` | 9550 | `5c2ee4d679fc24a0…` | yes | applied | `580ecc0` 2026-08-17 |
| `20260831000007_unit_leases_due_type_account.sql` | 4023 | `be5ecb85b0b797b2…` | yes | applied | `6205c8b` 2026-08-17 |
| `20260831000008_dues_source_attribution.sql` | 807 | `d08e6a99b063d4e9…` | yes | applied | `6205c8b` 2026-08-17 |
| `20260831000009_extend_financial_audit_actions.sql` | 848 | `68d4adf92d1f7062…` | yes | applied | `6205c8b` 2026-08-17 |
| `20260831000010_lease_rent_generation.sql` | 9446 | `b7d4b1203a37c72b…` | yes | applied | `6205c8b` 2026-08-17 |
| `20260831000011_dues_select_own_via_lease.sql` | 681 | `075dde506dc18937…` | yes | applied | `6205c8b` 2026-08-17 |
| `20260831000012_installment_plans_schema.sql` | 4698 | `bbce4d36ae83c1dc…` | yes | applied | `1318c9f` 2026-08-17 |
| `20260831000013_installment_plans_permissions_rls.sql` | 3479 | `531f8f193012b20b…` | yes | applied | `4c56ae0` 2026-08-17 |
| `20260831000014_installment_plan_rpcs.sql` | 10462 | `55ae3cdf5fcaf369…` | yes | applied | `bd8fd07` 2026-08-17 |
| `20260901000001_bank_reconciliation_schema.sql` | 7723 | `fc6d6a26868b80be…` | yes | applied | `f7559f8` 2026-08-18 |
| `20260901000002_bank_reconciliation_functions.sql` | 12863 | `df1eaa0885f9caa4…` | yes | applied | `f7559f8` 2026-08-18 |
| `20260901000003_member_invitation_phone_only.sql` | 3841 | `2dd0557c46eeeba8…` | yes | applied | `f06ed70` 2026-08-18 |
| `20260902000001_dues_general_ledger_recognition.sql` | 7767 | `69dfbc9888248466…` | yes | applied | `e729a3c` 2026-08-18 |
| `20260902000002_member_invitation_short_links.sql` | 2303 | `591fbca658117e8d…` | yes | applied | `02bddd1` 2026-08-18 |
| `20260903000001_service_charges_schema.sql` | 6858 | `4c4737dc95195b6d…` | yes | applied | `6ae9ec0` 2026-08-18 |
| `20260903000002_service_charges_engine.sql` | 11661 | `a2d46ec5039ecb14…` | yes | applied | `6ae9ec0` 2026-08-18 |
| `20260904000001_security_deposits_on_books.sql` | 14619 | `1213767567eb0f26…` | yes | applied | `a274123` 2026-08-18 |
| `20260905000001_currency_minor_units.sql` | 12394 | `468af9b6c3436a34…` | yes | applied | `ae32556` 2026-08-18 |
| `20260906000001_broker_commissions.sql` | 17870 | `f9cd9e0e4f33e1c8…` | yes | applied | `81aa1e4` 2026-08-18 |
| `20260907000001_unit_handover.sql` | 15780 | `898b31ef9cfa9f84…` | yes | applied | `38f48cb` 2026-08-18 |
| `20260908000001_einvoice_core.sql` | 17527 | `f92baf009dabf57b…` | yes | applied | `de686e2` 2026-08-18 |
| `20260909000001_einvoice_profile_upsert.sql` | 5743 | `891ac4a369d16af1…` | yes | applied | `e02527c` 2026-08-18 |
| `20260910000001_einvoice_restrict_jurisdictions.sql` | 4144 | `d7bd85d8c578f8d1…` | yes | applied | `8766279` 2026-08-18 |
| `20260911000001_einvoice_tax_identity_source_alignment.sql` | 10333 | `9d9906debd0a5412…` | yes | applied | `ddd8577` 2026-08-18 |
| `20260912000001_revenue_classification_foundation.sql` | 38726 | `9dfa790f7a9b75c1…` | yes | applied | `b33b659` 2026-08-18 |
| `20260913000001_tax_mapping_review_audit_and_listing.sql` | 8920 | `27c62e9ad026bce8…` | yes | applied | `b719dc5` 2026-08-18 |
| `20260914000001_tax_decision_derive_from_source.sql` | 20884 | `6f6e430f5604836c…` | yes | no row | `c6340e4` 2026-08-18 |
| `20260915000001_per_organization_tax_enforcement.sql` | 17066 | `cb80350fe12b5c7a…` | yes | no row | `43ed661` 2026-08-18 |
| `20260916000001_tax_enforcement_lapse_visibility.sql` | 6095 | `5c793eab703d7f7c…` | yes | applied | `6a7d65e` 2026-08-18 |
| `20260917000001_fix_coa_clone_bare_delete_regression.sql` | 2131 | `c8bd4b624dc7bd81…` | yes | applied | `3498b5a` 2026-08-18 |
| `20260918000001_tax_historical_gap_must_be_acknowledged.sql` | 8125 | `c112ad5953fb0f87…` | yes | applied | `b601bd1` 2026-08-18 |
| `20260919000001_output_vat_amount.sql` | 17624 | `2abf6357af7cde55…` | yes | no row | `8b9ed05` 2026-08-18 |
| `20260920000001_output_tax_account_and_ledger_split.sql` | 13285 | `67aa537b214553ba…` | yes | applied | `65d648c` 2026-08-19 |
| `20260920000002_tax_decision_stamps_account_and_three_line_entry.sql` | 12517 | `b70f53d73f6c7215…` | yes | no row | `65d648c` 2026-08-19 |
| `20260921000001_buyer_tax_identity_on_members.sql` | 9893 | `002e6f57112c4954…` | yes | applied | `420fae2` 2026-08-19 |
| `20260921000002_tax_decision_requires_buyer_identity.sql` | 17169 | `96deb55a4771c799…` | yes | applied | `420fae2` 2026-08-19 |
| `20260922000001_input_tax_eligibility_model.sql` | 18073 | `90573b89ac22e95f…` | yes | applied | `10eba91` 2026-08-19 |
| `20260922000002_input_tax_decisions.sql` | 16764 | `4ef1caa4d23214b5…` | yes | no row | `10eba91` 2026-08-19 |
| `20260923000001_supplier_invoice_posting_respects_eligibility.sql` | 8791 | `727b06fc987c7883…` | yes | no row | `745f945` 2026-08-19 |
| `20260924000001_einvoice_document_numbering_and_source.sql` | 11230 | `ee0b70aad6c996eb…` | yes | applied | `3f9056f` 2026-08-19 |
| `20260925000001_catalogue_items_and_authority_codes.sql` | 15691 | `612c2d8d771c8b5b…` | yes | no row | `26b0e4a` 2026-08-19 |
| `20260926000001_credit_notes.sql` | 16360 | `dfa67c0f12bc567c…` | yes | applied | `41c2e7b` 2026-08-19 |
| `20260927000001_suppliers_financial_terms.sql` | 660 | `405cd84be559ad70…` | yes | no row | `512742e` 2026-08-19 |
| `20260929000001_credit_note_listing_functions.sql` | 3943 | `dd64b1667b082c68…` | yes | applied | `a4fe0ab` 2026-08-19 |
| `20260929000002_catalogue_listing_functions.sql` | 3248 | `da7c0ad8675a11db…` | yes | applied | `a4fe0ab` 2026-08-19 |
| `20260930000001_fixed_assets_and_depreciation.sql` | 16483 | `7a34e9c59813d852…` | yes | applied | `fa73ccb` 2026-08-19 |
| `20260930000002_exchange_rates_foundation.sql` | 8498 | `20319173cf47bbf6…` | yes | applied | `fd6a10a` 2026-08-19 |
| `20260930000003_fx_difference_accounts.sql` | 7814 | `b7e5c0aa8dc3a0fe…` | yes | applied | `3eb2c9a` 2026-08-19 |
| `20260930000004_fixed_asset_disposal.sql` | 11042 | `72765879af27d4a5…` | yes | applied | `9185626` 2026-08-19 |
| `20260930000005_supplier_invoice_foreign_currency.sql` | 9842 | `982141d8db216094…` | yes | applied | `85d5671` 2026-08-19 |
| `20260930000006_dunning_notices.sql` | 16593 | `efa4260f3afb206d…` | yes | applied | `ad8a9e4` 2026-08-20 |
| `20260930000007_projects_and_wip.sql` | 12943 | `080731f4095a5765…` | yes | no row | `3454c35` 2026-08-20 |
| `seed-platform-admin.sql` <br><sub>not a migration — no leading digits</sub> | 544 | `051662c68ac09246…` | no | n/a | `e5bd7c4` 2026-08-11 |

Full SHA-256 values are truncated above for readability. They are recoverable at any
time with `sha256sum 2026-08-21-pre-squash/*.sql`; the bytes were verified unchanged
across the move by re-hashing all 228 files after `git mv`.
