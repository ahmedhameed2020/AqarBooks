# AqarBooks Tenant Backup — Canonical Snapshot Format v1

**Status:** Phase 1 Foundation specification. Defines the format only —
extraction, restore, and verification code implementing this spec is tracked
separately (`lib/backup/`); nothing in this document has been run against a
live tenant yet (see `docs/backup-recovery/phase1-implementation-report.md`).

**Governing decision:** [ADR 0006](../adr/0006-tenant-backup-identity-preserving-recovery.md)
(TB&R-001) — a package produced under this format is **identity-preserving**.
It never remaps `organization_id`, and it is never valid to restore one into
an environment where that would be required. A workflow that needs to remap
tenant identity is Clone/Data Portability, a different format, out of scope
here.

**Source of truth for table scope:** `lib/backup/table-classification.ts`,
derived from the Phase 0 architecture-discovery audit (2026-08-24) and its
closure passes. This document describes the package *shape*; that module is
the package *content* — if they ever disagree, the code (and its tests) win,
and this document needs updating.

---

## 1. Package layout

```
tenant-backup-format-v1/
├── manifest.json                 — see §2
├── tenant-data/                  — one file per INCLUDE-dispositioned table,
│                                    named after the table, ordered per
│                                    EXTRACTION_LAYER_ORDER
├── reference-metadata.json       — GLOBAL_REFERENCE resolution map (§3) +
│                                    auth id→email map (§4)
├── storage-manifest/
│   └── manifest.json             — per-object entries (§5)
├── checksums/
│   └── files.json                — {path, sha256} for every artifact above,
│                                    independent of manifest.json's own hash
├── accounting-verification/
│   └── export-time-evidence.json — the §7 invariant results captured AT
│                                    EXPORT TIME, for restore-time comparison
└── package.sig                   — detached, see §6. Absent in Phase 1
                                     (no KMS/signing infra yet) — the field
                                     exists in manifest.json as a placeholder.
```

`DATA` (`tenant-data/`) is kept structurally separate from `METADATA`
(`manifest.json`, `reference-metadata.json`), `VERIFICATION EVIDENCE`
(`accounting-verification/`), and `REFERENCE DEPENDENCIES`
(`reference-metadata.json`'s GLOBAL_REFERENCE section) — per the Phase 1
mandate's explicit format requirement. A restore tool must never need to
inspect `tenant-data/` to find dependency or verification information.

## 2. manifest.json

```jsonc
{
  "package_format_version": "tenant-backup-format-v1",
  "schema_migration_version": "20260821105505_baseline",   // latest applied migration filename at export time
  "application_version": "<git sha or release tag>",
  "source_project_ref": "<Supabase project ref>",
  "organization_id": "<the tenant's organization_id — UUID, preserved verbatim>",
  "created_at": "<ISO 8601, server-stamped>",
  "snapshot": {
    "isolation_level": "REPEATABLE READ",                  // see §7
    "snapshot_id": "<pg_export_snapshot() identifier, if a multi-worker extraction was used>",
    "captured_at": "<ISO 8601>"
  },
  "table_inventory": [
    { "table": "dues", "classification": "TENANT_OWNED_DIRECT", "row_count": 1234 },
    // ... one entry per INCLUDE-dispositioned table, in EXTRACTION_LAYER_ORDER
  ],
  "storage_object_count": 0,
  "encryption": {
    "algorithm": null,       // placeholder — Phase 1 does not encrypt. See ADR TB&R-001 note on §26 of Phase 0.
    "key_id": null
  },
  "signature": {
    "algorithm": null,       // placeholder — no KMS/signing in Phase 1
    "detached_file": "package.sig"
  }
  // manifest_hash is appended AFTER this object is finalized — see §6.
  // It is never a key inside the object that gets hashed.
}
```

`table_inventory` lists only tables with `disposition: "INCLUDE"` from
`TENANT_BACKUP_TABLE_CLASSIFICATION_V1` — i.e. `TENANT_OWNED_DIRECT` (82) +
`TENANT_OWNED_INDIRECT` (9) = 91 tables. `organizations` itself is never a
row in `table_inventory` — its identity lives in the top-level
`organization_id` field, per the identity-preserving contract (§1 of ADR
0006): a package doesn't "contain a copy of the tenant row," it *is*
addressed by that tenant's id.

## 3. GLOBAL_REFERENCE resolution — `reference-metadata.json`

For every `GLOBAL_REFERENCE`-classified id actually referenced by the
tenant's data (e.g. a `tax_decisions.tax_rule_version_id` value, a
`subscriptions.plan_id` value), record:

```jsonc
{ "table": "tax_rule_versions", "id": "<uuid>", "captured_content_snapshot": { /* for audit display only */ } }
```

This is **never** inserted as a tenant row on restore. Restore resolves each
id against the destination's live global table and fails the compatibility
check (schema-compatibility gate, restore step 3) if the id doesn't exist
there — it does not fabricate the global row. `captured_content_snapshot` is
informational only, so an auditor can see what the rule *said* at export
time even if the destination's live copy has since changed.

## 4. Auth identity metadata

Per Phase 0 §7/§22: `auth.users` is never exported. `reference-metadata.json`
carries only:

```jsonc
{
  "active_identity_map": [
    { "auth_user_id": "<original uuid, preserved verbatim>", "email": "<email, for re-binding>" }
  ]
}
```

covering only the 7 `ACTIVE_IDENTITY` FK columns (§22 of the Phase 0 report)
— `profiles.id`, `organization_memberships.user_id`,
`resort_memberships.user_id`, `user_role_assignments.user_id`,
`members.user_id`, `member_invitations.accepted_user_id`,
`alert_dismissals.user_id`. No password, session, refresh token, or MFA
material is ever present, because none of it exists duplicated in `public`
schema to begin with (confirmed in Phase 0).

Every other `auth.users`-referencing column (`HISTORICAL_ACTOR`, `CREATOR`,
`APPROVER`, `SYSTEM_ACTOR` — the ~55 remaining) travels inside `tenant-data/`
as part of its owning row, **preserved verbatim, never rewritten**. This is
non-negotiable for `financial_audit_logs.actor_user_id` (it is a hash input —
Phase 0 §29) and is the default policy for every other such column too, for
provenance consistency (Phase 0 §22).

## 5. Storage manifest

One entry per Storage object referenced by an INCLUDE-dispositioned row
(currently only `member_documents.file_path`):

```jsonc
{ "bucket": "member-documents", "path": "<org_id>/<member_id>/<filename>", "organization_id": "<uuid, authoritative>", "sha256": "<checksum at capture time>", "size": 12345, "content_type": "application/pdf" }
```

`organization_id` here is the DB row's column value, not parsed from the
path — per Phase 0 §8/§25, the path is an RLS-scoping convention, not a
verified source of truth. See `lib/backup/storage-completeness.ts` for the
COMPLETE_VERIFIED / INCOMPLETE / FAILED state machine that governs whether a
package with a non-trivial storage manifest may be considered restorable.
As of Phase 0, production Storage is empty (0 objects) — this section is
specified for correctness, not because there is current volume to move.

## 6. Checksums, hashing, signature — no self-reference

Implemented exactly by `lib/backup/hashing.ts` (tested in
`tests/backup-hashing.test.ts`):

- **Artifact hash** — `sha256` of each file's raw bytes, computed before
  `manifest.json` is written.
- **Manifest hash** — `sha256` of the RFC 8785-canonicalized `manifest.json`
  content **excluding** the `manifest_hash` key itself; the key is appended
  only after the hash is computed (`writeManifest`/`verifyManifest`).
  `computeManifestHash` throws if handed content that already contains a
  `manifest_hash` key — the guard is in code, not just in this document.
- **Package hash** — a Merkle-root-style `sha256` over the sorted
  `(path, sha256)` index of every artifact, never a hash of raw archive
  bytes (archive metadata like timestamps is non-deterministic and would
  make verification unreproducible).
- **Signature payload** — `manifest_hash + "|" + package_hash`
  (`buildSignaturePayload`). Phase 1 implements this payload construction
  only; it does not sign anything and does not touch KMS. `package.sig` is
  absent from a Phase 1 package, and `manifest.json.signature.algorithm` is
  `null` until Phase 2+ wires a real signer.

## 7. Snapshot consistency

Extraction of `tenant-data/` must run inside a single `REPEATABLE READ`
transaction (or an equivalent exported-snapshot mechanism,
`pg_export_snapshot()`, if extraction is parallelized across workers) — never
sequential unrelated transactions per table. This is required specifically
because `journal_entries`/`journal_entry_lines`, `dues`/`payment_allocations`,
and `financial_audit_logs`'s hash chain must all be read from one consistent
point in time; a table-by-table sequential export could observe a due
without its payment allocation, or a journal header without its lines, or a
hash-chain row appended mid-export. `manifest.json`'s `snapshot` object
records the isolation level and snapshot identifier used, so a restore-time
auditor can confirm the claim rather than trust it blindly.

Storage capture cannot share this transaction (Storage isn't part of
Postgres's MVCC) — see §5 and `storage-completeness.ts` for how that gap is
handled explicitly rather than silently.

## 8. Accounting verification evidence (export time)

`accounting-verification/export-time-evidence.json` captures the result of
running the applicable invariant checks (Phase 0 report §12) against the
SOURCE tenant at export time — trial balance, `verify_financial_audit_chain`,
document-numbering high-water marks. This is not a restore-time check; it's
a signed statement of "the source was internally consistent when this
snapshot was taken," so a later restore-time re-run of the same checks
(`lib/backup/verification-gates.ts`) has something to compare against beyond
its own output.

## 9. What this format explicitly does NOT do (Phase 1 scope boundary)

- No encryption (`encryption.algorithm: null`) — customer-controlled
  encryption model is still an owner decision (Phase 0 §26), and Phase 1 is
  explicitly prohibited from deploying KMS.
- No signing (`signature.algorithm: null`) — payload construction only.
- No production data has ever been packaged under this format — Phase 1's
  one validation drill (when it runs) targets a disposable non-production
  source and destination only.
