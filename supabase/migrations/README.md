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

## What this means now

**Production's ledger was replaced on 2026-08-21 by the Step 7 cutover, and this
repository names the same history it does.**

Re-measured from production on 2026-08-22 before this text was written:

```
rows                         1
version                      20260821105505
name                         baseline
created_by / idempotency_key / rollback   NULL
statements elements          3331
element bytes                943910
canonical array digest       7700b0003e3eeceacd0b640d81de51eae50d3b20a8318c2e3d036e0e379f14ca
ordered per-element digest   967f57390f4cfa9a5db6b8ccdd6ca41d46684d6e46998722064318bb1031d425
```

`supabase migration list` reports the local and remote version sets as the same
single element, `{20260821105505}`. The 143 pre-cutover rows were replaced by
exactly this row in one delete-only transaction; all sixteen classes of the Step 5
comparator were unchanged before, during and after, and no business data was
touched.

The rollback evidence for those 143 rows — the only copy of the SQL as it was
actually applied — is retained in two independent locations and must not be
deleted. The Git migration archive under `../migrations-archive/` is not an
equivalent reconstruction of that applied ledger history.

## Adding another migration

Still not yet, but for one reason rather than two.

The ledger cutover is complete. `supabase db push` against production nevertheless
remains **prohibited** by
[ADR 0004](../../docs/adr/0004-security-baseline-freeze.md); the completion of the
cutover satisfied that prohibition's stated condition but does not lift it. A
successor ADR governing how migrations resume is drafted and awaiting signature.

`tests/migration-directory-guard.test.ts` fails if any `.sql` file other than the
baseline appears here, or if the baseline's bytes change. That guard is
deliberate — read the archive manifest before working around it.

## Local unpublished branches

Local unpublished branches are not authoritative migration references. Before any
such branch is proposed for integration, it must first be reconciled against the
then-current `origin/master` under a separately authorized workflow.
