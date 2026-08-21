# supabase/migrations

**This directory holds exactly one migration: the baseline.**

```
20260821105505_baseline.sql   956,400 bytes
sha256 cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7
```

The 228 migration files that used to live here were moved on 2026-08-21 to:

```
supabase/migrations-archive/2026-08-21-pre-squash/
```

Nothing was deleted or renamed. Every filename and every byte is unchanged —
including the seven malformed filenames, which are evidence of how they were
produced and were deliberately left as they were.

Start with [`../migrations-archive/MANIFEST.md`](../migrations-archive/MANIFEST.md).
It records, per file, its hash, whether the Supabase CLI could parse it, and
whether production's ledger has a row of that name — which is the question that
actually gets asked.

## Why they were moved

The repository and the production ledger had stopped describing the same
history. Of 212 unique CLI-visible versions in the repository and 143 rows in
`supabase_migrations.schema_migrations`, the versions intersected in **six** —
and those six are aligned only because they were renamed by hand during the
Phase 1 security work. The ledger's earliest row is `20260814092045`; the entire
foundational schema is applied in the database and unrecorded in the ledger.

Replaying those files against production was therefore never a safe operation,
and leaving them here implied it was.

## What the baseline file is

Generated deterministically from the five frozen evidence files under
[`../baseline/`](../baseline/), in the order their headers state — the security
preamble first, because it fixes default privileges so no function is created
already granted to `anon`. Those five are not modified by generation and still
hash to the values in `../baseline/MANIFEST.md`.

It was proven before being admitted here: applied on its own to a freshly
created, empty Supabase project, it reproduced production's schema, security
posture and reference state across all sixteen classes of the Step 5 comparator,
with 456 reference rows, exactly one global `PLATFORM_SUPER_ADMIN` role, and zero
rows in all 92 tenant tables.

## What this does NOT mean

**Production's ledger has not been changed.**

`supabase db push` against production remains **prohibited** by
[ADR 0004](../../docs/adr/0004-security-baseline-freeze.md). Production still
holds 143 ledger rows, 137 of which correspond to no repository version, and the
baseline version is not among them. Until the ledger cutover runs and is
verified, the repository and production name different histories — and the CLI
will say so.

## Adding another migration

Not yet. Until the cutover is complete and ADR 0004 is lifted, a second file here
would join a directory whose relationship to production is still undefined.

`tests/migration-directory-guard.test.ts` fails if any `.sql` file other than the
baseline appears here, or if the baseline's bytes change. That guard is
deliberate — read the archive manifest before working around it.
