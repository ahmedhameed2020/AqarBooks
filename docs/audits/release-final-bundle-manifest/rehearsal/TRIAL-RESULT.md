# Rehearsal tooling v2 — trial on TEST data only

Scope: the four requested fixes to the rehearsal tools. No production data, no connection to production, release bundle (`ec1b669a…`) and `REHEARSAL-PLAN.md` (v3, `25a3bbcb…`) are NOT modified. Everything ran in the isolated stack `aqarbooks_clean` (container `supabase_db_aqarbooks_clean`, scratch DB `rh_trial`). No `aqarbooks_rehearsal` container was created.

## The four fixes
1. **Rule report shows every column, KEEP included** — `example-local/rule-report.txt` (1,703 columns, 144 tables: KEEP 1,602, JSONALLOW 13, PII 32, FREETEXT 36, SECRET 15, BLOB 5; 144 `TABLE|…` lines).
2. **Export stops on any unreviewed column** — new/changed-type/inapplicable-rule columns or tables block `export-run.psql` (exit 3) and `load.psql`. Pass 1 on the test DB: blocked with 1,847 unreviewed items (`example-local/blocked-pass1/`). Controls: missing column, rule PII on a uuid, changed type all block; ghost entries are listed in `stale-reviewed.txt`.
3. **Post-load relationship/constraint check** — `load-verify.psql`: V0 neutralizes references to unexported schemas, V1 row counts vs `_counts.csv`, V2 FK anti-join (506 FKs), V3 owned sequences vs max, V4 lists NOT VALID constraints. Result on test data: `LOAD-VERIFY PASSED`.
4. **Full export → restore trial** — export 147 files / 88.4 MB, schema-only restore, load as `supabase_admin`, verify. Fidelity: 13 tables' KEEP-column checksums EQUAL; members full_name/phone/email unchanged in 0 of 1,557 rows. Sentinel test: 75 of 88 sensitive columns planted; no planted value in the export; positive control finds them in an unredacted copy. Scanner on the export: CLEAN (147 files; 6,815 64-hex digests reported as info).

## Defects the trial found in the tooling (all fixed)
- `*_fingerprint`/`*_hash` columns matched BLOB → `'redacted'` violated a CHECK; BLOB proposal now excludes them.
- `*_hash` SECRET placeholder `'x…'` violated a digest CHECK; now a 64-hex placeholder.
- Scanner flagged 5,501 exact-64-hex digests as LONG-HEX; rule now 40–63 or 65+ hex, 64-hex counted as info.
- Generator: read-only sessions cannot create temp objects (CTE repeated per query); report header column count; missing reviewed file handled.

## Negative controls
Effective: V1 (two), V2 (unit → missing organization), V3 (probe table with identity sequence, rolled back), clean controls exit 0. Earlier flawed controls (orphan-by-delete caught by V1 first, vacuous sequence controls) stay in `trial-run.log`, superseded.

## Coverage limits (honest)
- 13 sensitive columns in 9 tables were not plantable because of complex CHECKs (credit_notes, gate_access_reconciliations, gate_device_enrollments, input_tax_decisions, journal_entry_lines, maintenance_request_updates, online_payment_transactions, visitor_invitations, work_order_costs); their redaction rests on the generated SQL, not on a planted value.
- Phone/text placeholders vs CHECKs only partly exercised.
- The trial base is emulated: `template1` is bare, so Supabase init objects came from a base dump of the `postgres` DB. A real rehearsal restores into the container's initialized `postgres` DB.
- `lease_renewal_requests_successor_consistent` is NOT VALID in the test data (listed by V4).
- Test data is not production: row counts, sizes, and timings say nothing about production.

## Left behind (nothing deleted)
Scratch DB `rh_trial` (160 MB), container dir `/tmp/rh` (180.8 MB: CSVs, dumps, scripts), older scratch DBs `scratch_ref/after/ab/rls`, `aqar_local`. Waiting for the user's instruction before any deletion.


## Follow-up (tools v3) — gaps found in review of v2 and closed
Three gaps were real: the 13 JSON columns proposed KEEP went out unredacted, the migration ledger was exported but **never loaded or compared** (the trial DB held 0 ledger rows), and nothing proved `session_replication_role` returned to normal.

### 1. JSON columns: per-path ALLOWLIST (v4 — replaces the v3 "short token" exception, which was withdrawn after review)
Review finding (accepted): v3 kept lowercase tokens, numbers and keys, so `ahmed`, a short lowercase secret, a numeric phone or a phone/email used as a key could pass. v4 removes every shape-based exception.
- Rule **JSONALLOW** (proposed for every json/jsonb column not SECRET/BLOB, with **no** allowlist lines): only paths listed in the reviewed file as `JSONKEEP|table|column|path|kind` survive. Everything else is dropped: every other key (dynamic keys included), every other value, containers, numbers, strings. The number of dropped entries is kept as `{"_redacted": n}`.
- `path` = `key` | `[].key` (array of objects) | `.` (top-level scalar). Nested objects and arrays inside a value are not descended into: they survive only if the path is listed with `KEEP` (the reviewer attests the whole value).
- `kind` = `NUM` | `BOOL` | `UUID` | `TS` | `ENUM:a,b,c` (value kept only if it has that type/shape or is in that list) | `KEEP` (any value, reviewer attests). A value of the wrong type at an allowed path is dropped (a phone string under a `NUM` path does not pass).
- Empty allowlist = the column exports as `{"_redacted": n}` per row (safe default). An invalid kind/path, or a JSONKEEP line for a column that is not JSONALLOW, blocks the export; a line for a column that no longer exists is only listed in `stale-reviewed.txt`. The old rule name JSONSAFE is rejected (blocks).
- `example-local/json-allowlist.txt` is an EXAMPLE built from the TEST database (80 paths: uuid/timestamp/number/boolean/enum-like keys; ENUM only for keys named status/direction/mode/type/policy/provider/reason_code/state/decision/kind; free text, containers and keys not shaped like identifiers are not listed). **The owner must build the real allowlist from the real keys on production; nothing here replaces that review.**
- Evidence (all TEST data): `example-local/json-trap-test.txt` — planted a short name (`ahmed`), a short lowercase secret (`abc123`), a phone as number (966500000000) and as string (0500123456), personal data as keys (`0500123456`, `ahmed@mail.com`, `Ahmed`), nested containers, arrays of strings, and strings at NUM/UUID/ENUM/scalar paths. Export: none of the needles in any of the 147 files; only the correctly typed allowlisted entries survived (`total`, `due_id`, `direction`; `as_of_date`; `[].row`, `[].error`); positive control: the unredacted rows hold them. This test also found a real defect in the first v4 build (a leftover `{{2}}` made the TS check fail closed, so timestamps were dropped); fixed and re-tested.
- Row-by-row comparison of all 13 JSONALLOW columns, source vs restored (`example-local/json-columns-review.txt`): 0 violations (every surviving entry is identical to the source; kept + dropped = source entries). Example: platform_audit_logs.safe_change_summary 58,276 rows, 54,160 entries kept, 27,187 dropped; financial_audit_logs.metadata 1,708 rows, 10,385 kept, 1,102 dropped; payment_credit_requests.result 2,076 rows, 9,480 kept, 747 dropped. 7 JSONALLOW columns have 0 rows locally and are covered by the rule and the trap test only.
- 3 columns BLOB (`{}`): einvoice_submission_attempts.response_summary, online_payment_events.redacted_payload, online_payment_transactions.provider_payload.
- Gating controls (all exit 3 except the last): invalid kind, invalid path, JSONKEEP on a text column, JSONSAFE rule, JSONALLOW on a text column; JSONKEEP for a column that does not exist → information only, export passes (147 files).
- Limits: a path the owner allowlists wrongly (e.g. `NUM` on a field that holds a phone number, or `KEEP` on a field with personal data) will pass — the allowlist is a reviewed decision, not a detector. Rows lose structure that upgrade code may read (dropped keys; array elements that are not objects become `{}`). Redacted JSON cannot test features that read those values.

### 2. Migration ledger
- `load.psql` now creates `supabase_migrations.schema_migrations` if absent and loads `data/_ledger.csv` (version + name; `statements` is not exported). `load-verify.psql` V5 requires the table to be non-empty and identical to the export: 0 missing, 0 extra, 0 different names. Test data: 87 migrations (20260821105505 … 20261018100000).
- Controls (exit 3, then restored): row missing, extra row, different name; the clean run exits 0.
- Limit: the ledger proves the restored copy carries the same migration history as the export, not that the schema matches the repository's migrations; that comparison is in REHEARSAL-PLAN.

### 3. session_replication_role
- `load.psql` runs `reset session_replication_role;` then `show` (prints `origin`) before ANALYZE. `load-verify.psql` V6 resets again in a fresh session and requires `origin`, no database/role setting storing it (`pg_db_role_setting`), and no disabled user trigger in public/auth. Controls (exit 3, then restored): setting stored on the database, a trigger disabled; clean run exits 0.
- Note: V0 itself runs under `replica` (it updates referencing columns) and V6 resets before finishing.

### 4. The 242 reference changes (V0, `example-local/v0-reference-changes.csv`)
- 242 = 2 foreign keys × 121 rows of `payment_provider_settings`: `api_key_secret_id` and `hmac_secret_id`, both referencing schema `vault` (not exported). Every row of the referencing table is updated, but only 240 references were non-null (120 + 120) and set to NULL; the rest were already null.
- Also in V0: all 121 `payment_provider_settings` rows get `enabled=false` and `status='DISABLED'` (73 were enabled before), so the copy can never call an external provider.
- In production the vault references will be of different number; the script fails (not silently nulls) if a referencing column is NOT NULL.

### 5. Limits of how well the copy represents production
- Secrets, vault contents, provider credentials, auth passwords/sessions, storage objects and `auth` data other than id/created_at/masked email are absent; features depending on them (provider calls, logins, files) cannot be exercised.
- Redacted columns hold placeholders, so data-dependent behaviour (search by name/phone, email sends, duplicates by phone) is not representative; JSON values outside the allowlist are gone.
- References to vault are NULL and provider settings disabled (section 4).
- Only schema `public` rows (+ledger, auth stub) are loaded; other schemas come from the container's base. Sequences are set from the snapshot.
- Statistics are rebuilt with ANALYZE, not copied: plans and timings differ from production.
- `statements` of the ledger are empty.

### 6. Tests run (targeted; the full suite was not rerun)
JSON allowlist trap test (short name, short secret, numeric phone, data in keys); generator gating controls (6 + 1); chain export→restore→load→verify; JSON row-by-row source-vs-restored comparison; V5 ×3 and V6 ×2 negative controls + clean control; generator control (JSONSAFE on a text column blocks); scanner on the final export (see `trial-run.log`).

Hashes of every file in this folder: `SHA256SUMS.txt`.
