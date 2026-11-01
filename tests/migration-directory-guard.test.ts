/**
 * Migration directory guard.
 *
 * WHY THIS EXISTS
 * `supabase/migrations/` is a release contract, not a scratch directory. This
 * guard pins every active migration by filename, byte size, and SHA256 so the
 * Supabase CLI cannot silently see a different migration set than reviewers do.
 *
 * CURRENT SHAPE (2026-09-25)
 * The active directory intentionally contains 55 SQL migrations:
 *
 *   - 33 historical migrations matching the production ledger through
 *     RECONCILIATION_LEDGER_TIP (`20260903172101`)
 *   - 22 authorized current migrations, including the completion rollout policy
 *     (`20260925184655`); the newest is a forward-only candidate pending review
 *
 * The 15 former ledger-only rows (`20260829104638` through `20260831205217`)
 * are now real SQL files recovered from production migration history and pinned
 * in RECONCILED_REMOTE_MIGRATIONS.
 *
 * WHAT A PASS HERE DOES NOT MEAN
 * This suite reads the filesystem only. It does not apply migrations, inspect
 * production, or authorize a production `db push` outside an explicit DB
 * release window.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
const ARCHIVE = "supabase/migrations-archive";
const ARCHIVED_FILES = join(ARCHIVE, "2026-08-21-pre-squash");

/**
 * Every migration allowed to be active, pinned by name, size and digest, in the
 * order the database records them.
 *
 * SECOND AMENDMENT (2026-08-23). The first amendment re-pointed this from
 * "zero .sql files, ever" to a named allowlist of one, when the squashed
 * baseline was admitted. This one extends that allowlist to seven, and the
 * reasoning is unchanged: the assertion is not loosened to "some migrations are
 * fine", it is re-pointed at a longer named list. An eighth file, or a changed
 * byte in any of these, still fails.
 *
 * The six additions were applied through Supabase's apply_migration rather than
 * `supabase db push`, which writes a row to
 * supabase_migrations.schema_migrations but no file. They lived outside this
 * directory for a day precisely so this guard would keep working, which left
 * the repository unable to describe the database. Each filename below is the
 * exact version recorded in that ledger, so the two now agree.
 */
export type MigrationProvenance =
  | "restored_exact"
  | "reconstructed_from_evidence"
  | "post_apply_nonsemantic_edit"
  | "reconciled_remote_migration"
  | "new_authorized_migration";

export interface MigrationDescriptor {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly provenance: MigrationProvenance;
}

interface HistoricalLedgerManifest {
  readonly rows: readonly { readonly version: string }[];
}

/**
 * Latest migration version already present in production history before the
 * PR3-PR6 database release. Historical migration reconciliation ends here.
 */
export const RECONCILIATION_LEDGER_TIP = "20260903172101";

/**
 * Highest migration version currently authorized in this repository. Any new
 * migration added after this reconciliation must have a greater version.
 */
export const FUTURE_MIGRATION_VERSION_FLOOR = "20260925184655";

export const RECONCILED_REMOTE_MIGRATIONS: readonly MigrationDescriptor[] = [
  { file: "20260829104638_legacy_access_migration_control_plane.sql", bytes: 4147, sha256: "91dd76d76bf470d2309d55725b2f4ce988a666f62ecabff61d7b777db0f2f640", provenance: "reconciled_remote_migration" },
  { file: "20260829105948_legacy_migration_raw_staging_tables.sql", bytes: 6264, sha256: "82150799528f0b5f6fe371f4aa5c04e20ab70d2a4353b4394e3be115aeb8a520", provenance: "reconciled_remote_migration" },
  { file: "20260829110027_legacy_migration_validation_views_v2.sql", bytes: 3198, sha256: "da9b02973bd68f9a8d742bf7e76114bcc38e6c9c7d21d36b6fda3dc30e13ed61", provenance: "reconciled_remote_migration" },
  { file: "20260831194315_accsys_migration_staging_schema.sql", bytes: 2404, sha256: "f114872dc86ff24b49e1b4b650ef7034c212bbd40cf2324a3f991483e42ee002", provenance: "reconciled_remote_migration" },
  { file: "20260831194442_accsys_stage_loader_casts.sql", bytes: 1112, sha256: "6f09cbd2bd0f041376553880e81610808816d90f3b81e681b9772534ac812c85", provenance: "reconciled_remote_migration" },
  { file: "20260831194633_accsys_stage_compact_bulk_tables.sql", bytes: 473, sha256: "eb6639c7006592253de48c90f4f1fc1550a5222121c164bbb47ac355d94539b1", provenance: "reconciled_remote_migration" },
  { file: "20260831194850_accsys_stage_coa_shape.sql", bytes: 158, sha256: "9c9ee9c233e9a3f904b989daee9dc97190d12cf2564aa651f0672a053da0b2ff", provenance: "reconciled_remote_migration" },
  { file: "20260831195011_accsys_materialize_function.sql", bytes: 8475, sha256: "356f40b9d89bc9fbed229ffe89561ea764b6a9f4d32bef75af39c46e28a326b8", provenance: "reconciled_remote_migration" },
  { file: "20260831195049_accsys_materialize_function_fix.sql", bytes: 7816, sha256: "59ebb651522fa1f4e867429408889774a9bb0a1d3bb4ecf4614a37f7a745ab8d", provenance: "reconciled_remote_migration" },
  { file: "20260831195824_accsys_materialize_no_demo_flag.sql", bytes: 7863, sha256: "a3087cccdff920010708e266ef416148566e7ee2ffad240c1729e2076922a27d", provenance: "reconciled_remote_migration" },
  { file: "20260831200103_accsys_materialize_operations.sql", bytes: 6819, sha256: "f0b68ca23f29143505fe519abaeea984a819a1f692c2bfc8deeacee0c9c110d6", provenance: "reconciled_remote_migration" },
  { file: "20260831200142_accsys_ops_unique_receipt_numbers.sql", bytes: 6966, sha256: "8cd1fc0d130bd5fa579bcfcdf4140babb7ecd76da5df9750ccc35778fb2d9e49", provenance: "reconciled_remote_migration" },
  { file: "20260831201313_accsys_stage_verified_loader.sql", bytes: 874, sha256: "9f1377bc5af4dfd75fe3379454027aa0ca4cc7b85be8028591e16f538e55d05b", provenance: "reconciled_remote_migration" },
  { file: "20260831201513_accsys_stage_dictionary_and_reset.sql", bytes: 1172, sha256: "2f5e5e8a494d093ac481d8c2bdb002f881a514ce65df7d6293b308f2c64cebba", provenance: "reconciled_remote_migration" },
  { file: "20260831205217_accsys_loader_strip_cr.sql", bytes: 2024, sha256: "8bf833c806b77fd8d0150d94f4e35a071a4de811afd58c838265254dd1f0998b", provenance: "reconciled_remote_migration" },
] as const;

export const MIGRATION_FILES: readonly MigrationDescriptor[] = [
  { file: "20260821105505_baseline.sql", bytes: 956400, sha256: "cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7", provenance: "restored_exact" },
  { file: "20260823044325_member_invitation_access_codes.sql", bytes: 11803, sha256: "9f22f46c461ace9ea4ab11929227f2c63ba43eaf1a819196827def58d74555b8", provenance: "restored_exact" },
  { file: "20260823071129_member_archiving.sql", bytes: 4291, sha256: "8211f77376b27c11607a0689b7ccc0d9fa4d7191b8026805c2e488594f8f0fd2", provenance: "restored_exact" },
  { file: "20260823075533_unit_archive_reason.sql", bytes: 940, sha256: "20dce1c8b187afb22c29638553f2a31c8da3debf1d4fb6310924aeba453ff7b6", provenance: "reconstructed_from_evidence" },
  { file: "20260823083604_revert_unit_archive_reason.sql", bytes: 721, sha256: "776f0dce1b31532f13a5b264180a8deb24835122cb08f00b67d09308c86e9ae3", provenance: "restored_exact" },
  { file: "20260823093809_operational_alerts.sql", bytes: 4593, sha256: "3e2a8e141b301ec73c0ad49370e3fd312ac8d6524536d6ee03d23b4638cf2c2e", provenance: "restored_exact" },
  { file: "20260823100424_alert_digest_runs.sql", bytes: 1794, sha256: "e8f45da0ee44338dfe7215bea443653d76f5c5112c11d7495a89e6eea8bc0182", provenance: "restored_exact" },
  // 2026-09-14 parser repair: the historical repository file was not replayable
  // because its final `on conflict do nothing` lacked a terminating semicolon.
  // The repair adds only that terminator; it is a post-application
  // nonsemantic edit. Local `supabase start` and `supabase db reset`
  // successfully replayed the repaired history with no schema behavior or
  // migration version change.
  { file: "20260823200624_property_reports_permission.sql", bytes: 2296, sha256: "15fbb89edc560d0a29e99a798e8c623400385e33540bf77630f493cc4ad92aab", provenance: "post_apply_nonsemantic_edit" },
  { file: "20260823200722_property_reports_permission_widen.sql", bytes: 1488, sha256: "308a37b472e5f59c77ea8ff94363f2cee04e1b186a5dadbd43119b83b92551ce", provenance: "restored_exact" },
  { file: "20260825084639_organizations_is_demo.sql", bytes: 11904, sha256: "d24b7358734274c79a8eec23ccd444eb17dd78f32ab0e51d0066e87b01bd0f97", provenance: "restored_exact" },
  { file: "20260825124312_generate_lease_rent_dues_authz.sql", bytes: 8499, sha256: "d063fe2ae32188b1c469a722a8f918942b5ea2be99779dfe0a68af9e4a15faba", provenance: "restored_exact" },
  { file: "20260825124342_internal_helper_acls.sql", bytes: 7595, sha256: "3cbcc49b3308e8a2bf772579d2573d60f7b034de74067b20f2dd43fb44bc5082", provenance: "restored_exact" },
  { file: "20260825182109_rent_partial_period_guard.sql", bytes: 11966, sha256: "884dddada7f5b6703e844f1bc8f7a055d5f0692fc73f243865c4da37cc6c6cd4", provenance: "restored_exact" },
  { file: "20260825231151_demo_readonly_hardening_and_cashier_read.sql", bytes: 9984, sha256: "d7dd715e0a06f7457d5cd2ad338e73450569697bfbc22f64bc3aa41e49baf233", provenance: "restored_exact" },
  { file: "20260826072010_public_action_rate_limits.sql", bytes: 5823, sha256: "80611b7bf5e2835d3e8600e45c36a850d6b902e53724f46287422ca843502b3d", provenance: "restored_exact" },
  { file: "20260826102930_assisted_onboarding_requests.sql", bytes: 13325, sha256: "ec62d236b1614c14c2f4f5d8c26bdfbfdb9b1a3b3aa2d0cacc8162099d3f73fc", provenance: "restored_exact" },
  { file: "20260826124013_onboarding_request_idempotency_and_self_read.sql", bytes: 1692, sha256: "fbbba887840710c1f1225263ec82509babda62d1a962624f849871f031263566", provenance: "restored_exact" },
  ...RECONCILED_REMOTE_MIGRATIONS,
  { file: "20260903172101_member_opening_balance.sql", bytes: 17897, sha256: "e2b581796a179ce04d472b2fb29d54ac68e3775be351479c2539e257f8a0ea42", provenance: "post_apply_nonsemantic_edit" },
  { file: "20260913165500_w0_sec_authorization_containment.sql", bytes: 6570, sha256: "eba7ae525f91fb9ff3f0a124d99fa108ddc9731e14815931d0b9a75543d35a7f", provenance: "new_authorized_migration" },
  { file: "20260914131953_maintenance_request_core.sql", bytes: 32171, sha256: "d319cc3c80bea64b7f8576c831f498acaba80f5abf5cd351abaaad9ab480dcbc", provenance: "new_authorized_migration" },
  { file: "20260914200226_maintenance_request_attachments.sql", bytes: 21696, sha256: "7df40451cc9815d1b1b1e18ea3ed943ce41fed8d598b6f8d5fbaaf0be979014a", provenance: "new_authorized_migration" },
  { file: "20260914203712_maintenance_work_orders.sql", bytes: 40233, sha256: "70c91bbe8ef03684f890bccb9acb6fa08762a3acd62c8a60df09a91f3488d57f", provenance: "new_authorized_migration" },
  { file: "20260915050914_maintenance_cost_accounting_bridge.sql", bytes: 39495, sha256: "0f8220d9526e0ffcde3353addc7c12940cae9a80af9c5aefe255e27024c128da", provenance: "new_authorized_migration" },
  { file: "20260915073908_visitor_invitations_secure_qr_passes.sql", bytes: 20826, sha256: "5ab2671a9dcff5a36b46be94e2b4477c91d11c53933c302f902693f744a947a1", provenance: "new_authorized_migration" },
  { file: "20260915081839_gate_operations_access_ledger.sql", bytes: 28731, sha256: "df213495fc66a6b542df95b898c6344d35f9564eb3f1d70ac7e6d5e626fa7624", provenance: "new_authorized_migration" },
  { file: "20260915100016_vehicles_unit_timeline_notifications.sql", bytes: 46232, sha256: "e59ee9176c3b6469dd3e5116053cd57ef08f4c7a7bdb8d66eda998f814b123c5", provenance: "new_authorized_migration" },
  { file: "20260917040349_amenity_bookings.sql", bytes: 27064, sha256: "24a9ed584d8c370f61f6b765444eff28dcee5fedb32bd839588270c65285bd56", provenance: "new_authorized_migration" },
  { file: "20260917183206_lease_renewal_database_contract.sql", bytes: 18039, sha256: "efa71563f4bdc49550f5eabae25d57e178013e7ad30e7801570e60247021bb66", provenance: "new_authorized_migration" },
  { file: "20260917195950_lease_expiry_alerts.sql", bytes: 9061, sha256: "fd0a8c06167b65d01703ddc7ef99f66fd647a65b22cf6cdc31763d7461420923", provenance: "new_authorized_migration" },
  { file: "20260918010000_lease_renewal_successor_activation.sql", bytes: 15716, sha256: "438111dde2fbab31c415383d774ba5a8945115a24d7a10170018b3f93ef50b9c", provenance: "new_authorized_migration" },
  { file: "20260919010000_batch_navigation_permissions.sql", bytes: 1650, sha256: "2dc969478a9b15263458af3c297035e2012558edb945cb3c6fcbf32827014401", provenance: "new_authorized_migration" },
  { file: "20260924072325_online_payment_production_foundation.sql", bytes: 18696, sha256: "e563669f8599b8314b4fdc2b37c56ee4da37aaf476de9e2f6b127c3386460517", provenance: "new_authorized_migration" },
  { file: "20260925124947_gate_device_trust.sql", bytes: 17340, sha256: "533189d06b73b5d821b1fa2c2c1412706f287fcf91f7407f2b123ce862f36122", provenance: "new_authorized_migration" },
  { file: "20260925140133_gate_scan_device_binding.sql", bytes: 1916, sha256: "7ad16dc2e809e5bc74caffb8bbd4709fedab6da3b9f4297f5289a7a30d4b774d", provenance: "new_authorized_migration" },
  { file: "20260925152255_gate_connectivity_incidents.sql", bytes: 4538, sha256: "cb9a84b9667d9812b419823f3018918d0c9020d70791d0c5634b45dffdcdc6ef", provenance: "new_authorized_migration" },
  { file: "20260925160550_gate_supervision_evidence.sql", bytes: 28745, sha256: "62b5c68aaf286ee6c9a2a6b085fc93f95628a3fe414c5099e7fec497e05a8621", provenance: "new_authorized_migration" },
  { file: "20260925182911_gate_notifications.sql", bytes: 10612, sha256: "257502ceae6e3c0c65c65d23d0a40c4325a00aa41349d25ad293c4bcc29384f3", provenance: "new_authorized_migration" },
  { file: "20260925184655_gate_hardware_outbox.sql", bytes: 10256, sha256: "397ab1e0b0a5f757455cd0948f78ddec67659ba58e72b59aa8df32cb68cd1620", provenance: "new_authorized_migration" },
  { file: "20261001052203_gate_long_stay_policy.sql", bytes: 4526, sha256: "9b546f551dd0f899b3aa9368bf330877266d594cc4ff279119fcccbc51f5dcde", provenance: "new_authorized_migration" },
  { file: "20261001070000_gate_completion_rollout.sql", bytes: 9058, sha256: "f709e86ec6ec761cd8dfe437591de7ac5a2811fe0ffc8be167e8ac3bc98ea40c", provenance: "new_authorized_migration" },
  { file: "20261001120000_gate_final_contracts.sql", bytes: 17939, sha256: "0ead460d29d65609c9adfd627b73e4bdd16e9cdd7d71a8aec1f4bd61bf816e9f", provenance: "new_authorized_migration" },
  { file: "20261001121000_gate_operational_cleanup.sql", bytes: 3187, sha256: "7325541600bf1c3bed6e9e9c13b2c9574c9e697bd1b8ac1349923e867d491ef4", provenance: "new_authorized_migration" },
  { file: "20261001122000_gate_export_snapshot_contract.sql", bytes: 4190, sha256: "9d6232ee0980f8d47c1e311208337c330cf5f40fda4005218c35210ea028bdf7", provenance: "new_authorized_migration" },
  { file: "20261001123000_final_hardening_sprint.sql", bytes: 14237, sha256: "219396927bd82f97a9e00c1090be0706c6dd17c2cd5a639229c6983800a5436d", provenance: "new_authorized_migration" },
  { file: "20261004120000_owner_portal_access.sql", bytes: 48776, sha256: "88e761aa8be2a61b0045df07af0ba0dedf1cd6b724a13da8fd1337f079d48d4b", provenance: "new_authorized_migration" },
  { file: "20261009120000_phase1_financial_report_authz.sql", bytes: 8269, sha256: "cde5086b5bbcaafbedc73fd68e465d35021a106c9442a82677d1167a929d7a81", provenance: "new_authorized_migration" },
  { file: "20261009130000_phase1_1_membership_roles_audit.sql", bytes: 9350, sha256: "436d441b23af755db17dcba0f012a00feecbc3bf2fbe64ac608deec48810443a", provenance: "new_authorized_migration" },
  { file: "20261009140000_phase1_2_finance_read_permissions.sql", bytes: 21259, sha256: "340ec5e2e7e6fa014d8a0bc762ecfb0d876957c4edd5d454bd6c61a4d077142a", provenance: "new_authorized_migration" },
  { file: "20261010120000_phase2_ledger_reversals_and_trial_balance_opening.sql", bytes: 23899, sha256: "4ad58ff2cd12584c721d97947155d1daf94094f9039832d720af16b5cb0b25f9", provenance: "new_authorized_migration" },
  { file: "20261011100000_phase2b_receivable_account_setting.sql", bytes: 7133, sha256: "3309fff87e444904e5694e0733651e3626061f93ccb9525ee29dc9eb1c90300b", provenance: "new_authorized_migration" },
  { file: "20261011100100_phase2b_default_receivable_account_rpcs.sql", bytes: 3572, sha256: "7e4e6fbb8c40bee353e000ca9da60b0520d88f480f8428fd7d1f5c6849fdf506", provenance: "new_authorized_migration" },
  { file: "20261012100000_phase2c_bank_reconciliation_unhandled_lines.sql", bytes: 3227, sha256: "f66608d14afbcb9232bdf73188b8eb223e84b0d0737ef17a7869a69d6476ccf2", provenance: "new_authorized_migration" },
  { file: "20261013100000_phase2d_dues_require_open_period.sql", bytes: 16590, sha256: "0463e6103ae4bbb2c8215004cb4ea7278f59739cc6000a573a1556e0f151ee92", provenance: "new_authorized_migration" },
  { file: "20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql", bytes: 5856, sha256: "18178d28b862075be082b9fc69cc1e5790ed517c3deb3acef18be8a690468965", provenance: "new_authorized_migration" },
  { file: "20261015100000_phase2f_notifications_amenity_source_type.sql", bytes: 2049, sha256: "81976d7d5853d28574624842f54a08bf65528e697db527693465fb57a55192ee", provenance: "new_authorized_migration" },
  { file: "20261015100100_phase2f_notifications_amenity_types.sql", bytes: 2159, sha256: "d329459408f91acf7668bfd64c22ab701b26b92832a4193b490e29c2d7e40dc6", provenance: "new_authorized_migration" },
  { file: "20261015100200_phase2f_visitor_gate_scan_foreign_pass.sql", bytes: 10415, sha256: "a40a5e06cacaeac1381a9c7b627711b20eba1d2ce2530e8476031f3cd0b00d03", provenance: "new_authorized_migration" },
  { file: "20261016100000_phase2g_owner_suspended_pass_denial.sql", bytes: 12129, sha256: "71767eceb5f8c02b9f190bee792eea777a932d9e3de9e85ab3b63cee51f2b5f4", provenance: "new_authorized_migration" },
  { file: "20261017100000_phase3a_customer_advances_schema.sql", bytes: 20330, sha256: "0767cae32db5778dab07eaf2bb507daf2ce79f600300d9b4d0206f6aed11d3c2", provenance: "new_authorized_migration" },
  { file: "20261017100100_phase3b_customer_advances_functions.sql", bytes: 43003, sha256: "a2a75bb0ccb45884acc83b9c3a5c7d4f0ac1513147651393cecd1ae23b9c3b3f", provenance: "new_authorized_migration" },
  { file: "20261017100200_phase3c_customer_advances_integrity.sql", bytes: 37921, sha256: "3aa9e43cfd0065b48af07de0b074a56578dae350a43b887cadf430dd88cfe776", provenance: "new_authorized_migration" },
  { file: "20261017100300_phase3d_customer_advances_review2.sql", bytes: 35022, sha256: "3c9cda50b8ffbf93fe3699c28e8172481b390984cc78e4f31b5e9d9ef6c9b271", provenance: "new_authorized_migration" },
  { file: "20261017100400_phase3e_customer_advances_trusted_backend.sql", bytes: 4539, sha256: "5d0be4a8fd41e1f202f9a4b3d01c6bf4c2a6819b264dc1bb93883f02701613fd", provenance: "new_authorized_migration" },
  { file: "20261017100500_phase3f_portal_statement_history.sql", bytes: 2964, sha256: "b7159c55058f38a0d04d533b288ee6a93fb0868b43ee0c454062973c67cc2183", provenance: "new_authorized_migration" },
  { file: "20261017100600_phase3g_advance_account_configured.sql", bytes: 1530, sha256: "c07cc94370d6b627e283a5dc3cc2142e6b2c57d3b0c452bcdef9b39d7bd9d40d", provenance: "new_authorized_migration" },
  { file: "20261017100700_phase3h_owner_statement_settlement.sql", bytes: 5634, sha256: "0df397509563cfb28a017d2113652c8ebaab7209144b8132ec0f2052c596dcff", provenance: "new_authorized_migration" },
  // Phase 3i (20261017100800). Reviewed: units_with_financials / members_with_financials recomputed with LATERAL totals keyed on the returned row
  // (same columns, types, arithmetic, RLS, grants); plus idx_payments_member_posted. Evidence: docs/audits/phase3-evidence/task8-views/.
  { file: "20261017100800_phase3i_view_lateral_aggregates.sql", bytes: 5288, sha256: "579e3591d08b65a57c0a2959ed531cbed09b84bef79f5f5d0acaf39ffc1f2565", provenance: "new_authorized_migration" },
  // Task 10 (20261017100900). Reviewed and approved: the permission check of five policies (chart_of_accounts select + manage, fiscal_periods select + manage,
  // dues_select_permission) is evaluated once per statement through orgs_with_permission_keys instead of once per row; same rows, same grants. Evidence: docs/audits/phase3-evidence/task10-rls/.
  { file: "20261017100900_rls_set_based_permission_policies.sql", bytes: 6822, sha256: "ddee18f634275e21d332424252154bab53912715cbeb783684f873093986c19b", provenance: "new_authorized_migration" },
  // Task 10 follow-up (20261017101000). Reviewed and approved: the platform-admin check of the same five policies is an uncorrelated InitPlan (once per statement) instead of a per-row call;
  // same rows. Evidence: docs/audits/phase3-evidence/task10-rls/ (equivalence + plan assertions, red before / green after).
  { file: "20261017101000_rls_admin_check_once.sql", bytes: 5355, sha256: "ec14382329dbcdc3adc2eca0bd80c62c78f1322d3d627abf726ae9f90f322330", provenance: "new_authorized_migration" },
  // Task 10 follow-up (20261017101100). Reviewed and approved: journal_entries + journal_entry_lines select policies evaluate the permission checks once per statement (both tables together,
  // because the lines policy alone does not help); same rows, no write policy touched. Evidence: docs/audits/phase3-evidence/task10-rls/.
  { file: "20261017101100_rls_journal_entries_and_lines.sql", bytes: 2780, sha256: "acddadb100368b30f31a8241fafbfe6c1c23b283ff3904530d64d75f90f9bafb", provenance: "new_authorized_migration" },
  // Task 10 closing (20261017101200). Reviewed and approved: fiscal_years select + manage (ALL) policies evaluate the permission checks once per statement; same rows for read / insert /
  // update / delete / WITH CHECK; no policy added or removed. Evidence: docs/audits/phase3-evidence/task10-rls/.
  { file: "20261017101200_rls_fiscal_years.sql", bytes: 2367, sha256: "703554ff3f723b09436ce4aa0f1beddb5edb73cd931098d9d908e978e23e731d", provenance: "new_authorized_migration" },
  // Task 11 (20261018100000). Proposed, local only, awaiting approval: the deposit account of a receipt must be the GL account of an ACTIVE cash box or bank account of the same organization
  // (record_payment / record_advance_payment refuse anything else with DEPOSIT_ACCOUNT_INVALID; list_deposit_accounts feeds the screen); the link itself is validated by two triggers on cashboxes / bank_accounts; a third trigger audits changes of chart_of_accounts.is_cash_equivalent. Functions and three triggers: no DML, no backfill.
  // Evidence: docs/audits/phase3-evidence/task11-deposit-account/.
  { file: "20261018100000_deposit_account_cash_or_bank.sql", bytes: 12701, sha256: "add8a244a189b58f548db0d9a6ed6061556504f4326f1b8276349f7b443c1b99", provenance: "new_authorized_migration" },
  // Fiscal year closing set (20261019100000-200). Pinned as present in the repository; not applied to any database.
  { file: "20261019100000_fiscal_year_closing_core.sql", bytes: 28546, sha256: "b752b582604fa36975478bb40aaf0c551fc375ed10d19b8f5edf1cbc38d43ae4", provenance: "new_authorized_migration" },
  { file: "20261019100100_fiscal_year_close_guards.sql", bytes: 25251, sha256: "0e81549e882b8327fb103514f203b12cfe5f794e3c4a8bde0221854e629dc091", provenance: "new_authorized_migration" },
  { file: "20261019100200_fiscal_year_close_permission_and_reports.sql", bytes: 5588, sha256: "3886669724cfd575619b7377dfa4480c7decb12e447fe88bc638c35a14c1c676", provenance: "new_authorized_migration" },
  { file: "20261019100300_fiscal_calendar_truncate_revoke.sql", bytes: 1582, sha256: "a53b4b09f1e9e7e12b20f53ca34c50eac2cd3819fa37fb243f79b5bb7f4114d3", provenance: "new_authorized_migration" },
  { file: "20261019100400_fiscal_calendar_draft_and_open_transition.sql", bytes: 15324, sha256: "93ddb081410ba1e1a51501365e85144d80be6cf94e77f69f1532e5ba2a4103c2", provenance: "new_authorized_migration" },
  // Fiscal year opened audit (20261019100500). Adds FISCAL_YEAR_OPENED to check_audit_action; written by open_fiscal_year (20261019100400). Not applied.
  { file: "20261019100500_fiscal_year_opened_audit.sql", bytes: 1707, sha256: "94baf15575b94612814b8fdd2cc815b5f90e57932257f82a015a9246ab082a7f", provenance: "new_authorized_migration" },
] as const;

/**
 * EIGHTH AMENDMENT (2026-09-16 — Production migration-history reconciliation).
 *
 * The 15 production-only rows once tracked as ledger-only exceptions are now
 * checked in as exact remote-history SQL files, pinned in
 * RECONCILED_REMOTE_MIGRATIONS by filename, byte size, and SHA256. No unresolved
 * ledger-only migration versions remain.
 *
 * The repository now describes 33 historical migrations through
 * RECONCILIATION_LEDGER_TIP plus 20 authorized current migrations through
 * FUTURE_MIGRATION_VERSION_FLOOR. Historical `legacy_migration`, `legacy_access`,
 * and `accsys_stage` namespaces are allowed only inside those exact 15 pinned
 * reconciliation files; runtime code and all other migrations must remain free
 * of those staging dependencies.
 */
export const LEDGER_ONLY_VERSIONS: readonly string[] = [] as const;

/**
 * SIXTH AMENDMENT (2026-09-07). Extends the allowlist to eighteen with two
 * migrations that were applied to the project on 2026-08-26 through
 * apply_migration from branch claude/aqarbooks-conversion-flow-2tplsl, which
 * was never merged:
 *
 *   20260826102930  assisted_onboarding_requests
 *   20260826124013  onboarding_request_idempotency_and_self_read
 *
 * RESTORED, NOT RECONSTRUCTED, as with the third amendment: each blob is
 * byte-identical between the commit that introduced it (8a4b6e1 / 7764931)
 * and that branch's tip, so these are the files that were applied.
 */

/**
 * FIFTH AMENDMENT (2026-09-03). Extends the allowlist to sixteen: member
 * (client) opening balances -- an OPENING_BALANCE provenance on dues and the
 * two RPCs that record one. Same reasoning as every prior amendment -- a
 * seventeenth file, or a changed byte in any of these, still fails.
 */

/**
 * FOURTH AMENDMENT (2026-08-26). Extends the allowlist to fifteen: the durable
 * rate-limit table and function backing public demo entry. Same reasoning as
 * every prior amendment -- a sixteenth file, or a changed byte in any of
 * these, still fails.
 */

/**
 * THIRD AMENDMENT (2026-08-25). Extends the allowlist to fourteen. The
 * reasoning is unchanged: a fifteenth file, or a changed byte in any of these,
 * still fails.
 *
 * Ten of the fourteen were already listed. The other four closed a real gap:
 *
 *   20260825084639  organizations_is_demo
 *   20260825124312  generate_lease_rent_dues_authz
 *   20260825124342  internal_helper_acls
 *   20260825182109  rent_partial_period_guard
 *
 * They were applied to production through apply_migration -- which writes a
 * ledger row but no file -- from a branch whose work was never merged, so for a
 * day the repository could not describe its own database. This suite reads the
 * filesystem only and could not see that: it passed the whole time.
 *
 * RESTORED, NOT RECONSTRUCTED. The originals were recovered from git history
 * (feat/public-demo-phase-1, commits f6e5cb6 / 423f0b0 / 2802399) at the same
 * paths they were authored at. Each blob is byte-identical between the commit
 * that introduced it and that branch's tip, so these are the files that were
 * applied, not a re-derivation of them. Reconstructing the SQL from
 * supabase_migrations.schema_migrations.statements was deliberately NOT done --
 * that would have produced text that merely behaves the same, and the digests
 * pinned above would then have attested to something nobody actually ran.
 *
 * The list order matches the ledger's version order, which is also filename
 * order. None of these will execute again: every version below is already
 * recorded in supabase_migrations.schema_migrations, so the CLI treats them as
 * applied and skips them.
 */

/**
 * 20260823075533 adds units.archive_reason and 20260823083604 drops it again.
 * Keeping the pair rather than cancelling them out is deliberate: production
 * passed through that state, and a history that quietly omits its own mistakes
 * cannot be replayed to the schema that actually exists.
 */
/** Exactly what `supabase/migrations/` is allowed to contain. */
const PERMITTED = ["README.md", ".gitkeep", ...MIGRATION_FILES.map((m) => m.file)].sort();

/** The Supabase CLI's own rule, read out of the v2.78.1 binary. */
const CLI_MIGRATION_PATTERN = /^([0-9]+)_(.*)\.sql$/;

/**
 * Read the ledger export as lines, tolerating either line ending.
 *
 * The repository has no `-text` attribute on this path, so git normalises it on
 * checkout and a Windows working tree receives CRLF. Splitting on "\n" alone
 * would leave a trailing "\r" on every line and fail the header comparison on a
 * fresh clone while passing on the machine that wrote the file.
 */
function readLedger(): string[] {
  return readFileSync(join(ARCHIVE, "ledger-2026-08-21.tsv"), "utf8")
    .replace(/\r\n/g, "\n")
    .trimEnd()
    .split("\n");
}

describe("migrations directory holds exactly the approved baseline", () => {
  it("supabase/migrations holds exactly the permitted files and nothing else", () => {
    const entries = readdirSync(MIGRATIONS).sort();
    expect(entries).toEqual(PERMITTED);
  });

  it("the CLI parses exactly the allowed migrations, in ledger order", () => {
    const parsed = readdirSync(MIGRATIONS)
      .filter((f) => CLI_MIGRATION_PATTERN.test(f))
      .sort();
    expect(parsed).toEqual(MIGRATION_FILES.map((m) => m.file).slice().sort());
  });

  it.each(MIGRATION_FILES.map((m) => [m.file, m] as const))(
    "%s matches pinned repository size and digest (provenance: %s)",
    (_name, expected) => {
      const p = join(MIGRATIONS, expected.file);
      const raw = readFileSync(p);
      expect(statSync(p).size).toBe(expected.bytes);
      expect(raw.length).toBe(expected.bytes);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(expected.sha256);
    },
  );

  it("no .sql file exists at any depth beyond the allowed set", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const sql = walk(MIGRATIONS)
      .filter((p) => p.toLowerCase().endsWith(".sql"))
      .map((p) => p.replace(/\\/g, "/"))
      .sort();
    expect(sql).toEqual(
      MIGRATION_FILES.map((m) => `${MIGRATIONS}/${m.file}`).slice().sort(),
    );
  });

  // The staging directory these six sat in must not linger. Leaving it would
  // invite the next migration to be parked there again, which is how the
  // repository stopped describing the database in the first place.
  it("the migrations-pending staging directory is gone", () => {
    expect(existsSync("supabase/migrations-pending")).toBe(false);
  });

  // Anti-vacuity: the assertions above would all pass if the archive had been
  // deleted rather than moved aside. These prove the history still exists.
  it("the archive still holds all 228 files (the move was not a deletion)", () => {
    expect(existsSync(ARCHIVED_FILES)).toBe(true);
    const archived = readdirSync(ARCHIVED_FILES).filter((f) => f.endsWith(".sql"));
    expect(archived).toHaveLength(228);
  });

  it("the archive manifest and ledger export are present", () => {
    expect(existsSync(join(ARCHIVE, "MANIFEST.md"))).toBe(true);
    expect(existsSync(join(ARCHIVE, "ledger-2026-08-21.tsv"))).toBe(true);

    const tsv = readLedger();
    expect(tsv[0]).toBe("version\tname");
    expect(tsv).toHaveLength(144); // header + 143 ledger rows
  });

  it("the ledger export carries only version and name", () => {
    for (const line of readLedger()) {
      expect(line.split("\t")).toHaveLength(2);
    }
  });

  describe("DB-01 reconciliation invariants — Seventh Amendment", () => {
    it("reconciled remote migration list records exactly the 15 recovered production versions", () => {
      expect(RECONCILED_REMOTE_MIGRATIONS).toHaveLength(15);
      const versions = RECONCILED_REMOTE_MIGRATIONS.map((m) => m.file.match(CLI_MIGRATION_PATTERN)?.[1]);
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(15);
    });

    it("has no unresolved ledger-only migration versions", () => {
      const liveFiles = readdirSync(MIGRATIONS);
      for (const version of LEDGER_ONLY_VERSIONS) {
        const matching = liveFiles.filter((f) => f.startsWith(version));
        expect(
          matching,
          `Found unexpected fabricated migration file for ledger-only version ${version}: ${matching.join(", ")}`
        ).toHaveLength(0);
      }
    });

    it("the latest historical reconciled migration matches RECONCILIATION_LEDGER_TIP", () => {
      const historical = MIGRATION_FILES.filter((m) => m.provenance !== "new_authorized_migration");
      const latestHistorical = historical[historical.length - 1];
      const versionMatch = latestHistorical.file.match(CLI_MIGRATION_PATTERN);
      expect(versionMatch).not.toBeNull();
      expect(versionMatch![1]).toBe(RECONCILIATION_LEDGER_TIP);
    });

    it("all other historical migrations have versions strictly preceding RECONCILIATION_LEDGER_TIP", () => {
      const historical = MIGRATION_FILES.filter((m) => m.provenance !== "new_authorized_migration");
      for (let i = 0; i < historical.length - 1; i++) {
        const m = historical[i];
        const versionMatch = m.file.match(CLI_MIGRATION_PATTERN);
        expect(versionMatch).not.toBeNull();
        const version = versionMatch![1];
        expect(BigInt(version)).toBeLessThan(BigInt(RECONCILIATION_LEDGER_TIP));
      }
    });

    it("new authorized migrations strictly succeed RECONCILIATION_LEDGER_TIP", () => {
      const newMigrations = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(newMigrations.length).toBeGreaterThanOrEqual(1);
      for (const m of newMigrations) {
        const match = m.file.match(CLI_MIGRATION_PATTERN);
        expect(match).not.toBeNull();
        const version = match![1];
        expect(BigInt(version)).toBeGreaterThan(BigInt(RECONCILIATION_LEDGER_TIP));
      }
    });

    it("any future migration added to supabase/migrations must satisfy version > FUTURE_MIGRATION_VERSION_FLOOR", () => {
      const liveFiles = readdirSync(MIGRATIONS);
      const knownFileSet = new Set(MIGRATION_FILES.map((m) => m.file));
      for (const file of liveFiles) {
        const match = file.match(CLI_MIGRATION_PATTERN);
        if (match && !knownFileSet.has(file)) {
          const version = match[1];
          expect(
            BigInt(version) > BigInt(FUTURE_MIGRATION_VERSION_FLOOR),
            `New migration ${file} must have version > ${FUTURE_MIGRATION_VERSION_FLOOR}, got ${version}`
          ).toBe(true);
        }
      }
    });

    it("provenance metadata correctly classifies restored vs reconstructed vs modified migrations", () => {
      const reconstructed = MIGRATION_FILES.filter((m) => m.provenance === "reconstructed_from_evidence");
      expect(reconstructed).toHaveLength(1);
      expect(reconstructed[0].file).toBe("20260823075533_unit_archive_reason.sql");

      const modified = MIGRATION_FILES.filter((m) => m.provenance === "post_apply_nonsemantic_edit");
      expect(modified).toHaveLength(2);
      expect(modified.map((m) => m.file)).toEqual([
        "20260823200624_property_reports_permission.sql",
        "20260903172101_member_opening_balance.sql",
      ]);

      const restored = MIGRATION_FILES.filter((m) => m.provenance === "restored_exact");
      expect(restored).toHaveLength(15);

      const reconciledRemote = MIGRATION_FILES.filter((m) => m.provenance === "reconciled_remote_migration");
      expect(reconciledRemote).toEqual([...RECONCILED_REMOTE_MIGRATIONS]);

      const authorized = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(authorized).toHaveLength(60);
      expect(authorized[0].file).toBe("20260913165500_w0_sec_authorization_containment.sql");
      expect(authorized[1].file).toBe("20260914131953_maintenance_request_core.sql");
      expect(authorized[2].file).toBe("20260914200226_maintenance_request_attachments.sql");
      expect(authorized[3].file).toBe("20260914203712_maintenance_work_orders.sql");
      expect(authorized[4].file).toBe("20260915050914_maintenance_cost_accounting_bridge.sql");
      expect(authorized[5].file).toBe("20260915073908_visitor_invitations_secure_qr_passes.sql");
      expect(authorized[6].file).toBe("20260915081839_gate_operations_access_ledger.sql");
      expect(authorized[7].file).toBe("20260915100016_vehicles_unit_timeline_notifications.sql");
      expect(authorized[8].file).toBe("20260917040349_amenity_bookings.sql");
      expect(authorized[9].file).toBe("20260917183206_lease_renewal_database_contract.sql");
      expect(authorized[10].file).toBe("20260917195950_lease_expiry_alerts.sql");
      expect(authorized[11].file).toBe("20260918010000_lease_renewal_successor_activation.sql");
      expect(authorized[12].file).toBe("20260919010000_batch_navigation_permissions.sql");
      expect(authorized[13].file).toBe("20260924072325_online_payment_production_foundation.sql");
      expect(authorized[14].file).toBe("20260925124947_gate_device_trust.sql");
      expect(authorized[15].file).toBe("20260925140133_gate_scan_device_binding.sql");
      expect(authorized[16].file).toBe("20260925152255_gate_connectivity_incidents.sql");
      expect(authorized[17].file).toBe("20260925160550_gate_supervision_evidence.sql");
      expect(authorized[18].file).toBe("20260925182911_gate_notifications.sql");
      expect(authorized[19].file).toBe("20260925184655_gate_hardware_outbox.sql");
      expect(authorized[20].file).toBe("20261001052203_gate_long_stay_policy.sql");
      expect(authorized[21].file).toBe("20261001070000_gate_completion_rollout.sql");
    });

    it("remote ledger snapshot matches mathematical set partitioning with repository migrations", () => {
      const tsvPath = join("docs/evidence", "migration-ledger-version-name-2026-09-12.tsv");
      expect(existsSync(tsvPath)).toBe(true);

      const tsvLines = readFileSync(tsvPath, "utf8")
        .replace(/\r\n/g, "\n")
        .trimEnd()
        .split("\n")
        .slice(1); // skip header

      const remoteVersions = tsvLines.map((line) => line.split("\t")[0]);
      const historicalRepoVersions = MIGRATION_FILES
        .filter((m) => m.provenance !== "new_authorized_migration")
        .map((m) => {
          const match = m.file.match(CLI_MIGRATION_PATTERN);
          expect(match).not.toBeNull();
          return match![1];
        });

      // 1. remote rows = 33
      expect(remoteVersions).toHaveLength(33);

      // 2. reconciled repository migration versions at tip = 33
      expect(historicalRepoVersions).toHaveLength(33);

      // 3. historical ledger-only versions = 0; the former 15 are now pinned files.
      expect(LEDGER_ONLY_VERSIONS).toHaveLength(0);

      // 4. LEDGER_ONLY_VERSIONS equals exactly (remote - repo) in sorted order
      const repoSet = new Set(historicalRepoVersions);
      const computedDiff = remoteVersions.filter((v) => !repoSet.has(v)).sort();
      const expectedSorted = [...LEDGER_ONLY_VERSIONS].sort();
      expect(expectedSorted).toEqual(computedDiff);

      // 5. union(historical repo versions, historical-only versions) == remote versions
      const allReconciled = [...historicalRepoVersions, ...LEDGER_ONLY_VERSIONS].sort();
      const sortedRemote = [...remoteVersions].sort();
      expect(allReconciled).toEqual(sortedRemote);

      // 6. intersection(historical repo versions, historical-only versions) == empty
      const intersection = historicalRepoVersions.filter((v) =>
        LEDGER_ONLY_VERSIONS.includes(v)
      );
      expect(intersection).toEqual([]);

      // 7. latest remote version == RECONCILIATION_LEDGER_TIP
      const latestRemote = remoteVersions[remoteVersions.length - 1];
      expect(latestRemote).toBe(RECONCILIATION_LEDGER_TIP);

      // 9. new authorized migrations strictly forward: version > RECONCILIATION_LEDGER_TIP
      const newMigrations = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(newMigrations).toHaveLength(60);
      for (const m of newMigrations) {
        const v = m.file.match(CLI_MIGRATION_PATTERN)![1];
        expect(BigInt(v) > BigInt(RECONCILIATION_LEDGER_TIP)).toBe(true);
      }
    });

    it("public manifest rows match HISTORICAL_LEDGER_ONLY_VERSIONS exactly", () => {
      const manifestPath = join("docs/evidence", "migration-ledger-15-manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as HistoricalLedgerManifest;
      expect(manifest.rows).toHaveLength(15);
      const manifestVersions = manifest.rows.map((r) => r.version);
      const reconciledVersions = RECONCILED_REMOTE_MIGRATIONS.map((m) => m.file.match(CLI_MIGRATION_PATTERN)![1]);
      expect(manifestVersions).toEqual(reconciledVersions);
    });

    it("forensics report 15-row table and total bytes match public manifest byte-for-byte", () => {
      const manifestPath = join("docs/evidence", "migration-ledger-15-manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      const reportPath = join("docs", "migration-ledger-forensics-report.md");
      expect(existsSync(reportPath)).toBe(true);
      const reportLines = readFileSync(reportPath, "utf8")
        .replace(/\r\n/g, "\n")
        .split("\n");

      const tableRows = reportLines.filter((line) => line.startsWith("| `2026"));
      expect(tableRows).toHaveLength(15);

      let totalBytes = 0;
      tableRows.forEach((row, i) => {
        const parts = row
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        const version = parts[0].replace(/`/g, "");
        const name = parts[1].replace(/`/g, "");
        const stmts = parseInt(parts[2], 10);
        const bytes = parseInt(parts[3].replace(/,/g, ""), 10);
        const classification = parts[4].replace(/`/g, "");

        const expected = manifest.rows[i];
        expect(version).toBe(expected.version);
        expect(name).toBe(expected.name);
        expect(stmts).toBe(expected.statement_count);
        expect(bytes).toBe(expected.statement_byte_length);
        expect(classification).toBe(expected.classification);
        totalBytes += bytes;
      });

      expect(totalBytes).toBe(manifest.total_statement_bytes);
      expect(totalBytes).toBe(59735);
    });

    it("proves zero runtime dependency on historical staging schemas in application code and migrations", () => {
      const runtimeDirs = ["app", "components", "lib"];
      const reconciledRemoteFiles = new Set(RECONCILED_REMOTE_MIGRATIONS.map((m) => m.file));
      const historicalNamespacePatterns = [
        /\baccsys_/i,
        /\baccsys_stage\b/i,
        /\blegacy_migration\b/i,
        /\blegacy_access_/i,
      ];

      function scanDir(
        dir: string,
        options: { readonly exemptReconciledRemoteMigrations?: boolean } = {}
      ): string[] {
        const fullDir = join(process.cwd(), dir);
        if (!existsSync(fullDir)) return [];
        const entries = readdirSync(fullDir, { withFileTypes: true });
        const findings: string[] = [];

        for (const entry of entries) {
          const relPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            findings.push(...scanDir(relPath, options));
          } else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) {
            const isPinnedReconciledMigration =
              options.exemptReconciledRemoteMigrations === true &&
              dir.replace(/\\/g, "/") === MIGRATIONS &&
              reconciledRemoteFiles.has(entry.name);

            const content = readFileSync(join(process.cwd(), relPath), "utf8");
            if (!isPinnedReconciledMigration) {
              for (const pat of historicalNamespacePatterns) {
                if (pat.test(content)) {
                  findings.push(`${relPath} matches ${pat}`);
                }
              }
            }
          }
        }
        return findings;
      }

      const allFindings: string[] = [];
      for (const dir of runtimeDirs) {
        allFindings.push(...scanDir(dir));
      }
      allFindings.push(...scanDir(MIGRATIONS, { exemptReconciledRemoteMigrations: true }));

      expect(allFindings).toEqual([]);
    });
  });
});
