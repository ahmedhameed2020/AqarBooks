# supabase/migrations

**This directory is intentionally empty of SQL.**

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

Replaying these files against production was therefore never a safe operation,
and leaving them here implied it was.

## What this does NOT mean

An empty directory is not a reconciled database.

`supabase db push` remains **prohibited** by
[ADR 0004](../../docs/adr/0004-security-baseline-freeze.md). Production's ledger
still holds 143 rows, 137 of which correspond to no repository version. Moving
files changed nothing about that. If the CLI reports *"Remote database is up to
date"* against this directory, it means only that there is no local migration
left to push — not that the drift is resolved.

## Adding a new migration

Don't, yet. The baseline squash is incomplete: `supabase/baseline/` holds a
verified reproduction of production's schema, but the ledger has not been
rewritten to match it (Step 7). Until that is done and ADR 0004 is lifted, a new
file here would join a directory whose relationship to production is undefined.

`tests/migration-directory-guard.test.ts` fails if a `.sql` file appears here.
That guard is deliberate — please read the manifest before working around it.
