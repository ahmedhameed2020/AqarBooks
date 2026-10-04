# Local database replay

Replays `supabase/migrations/` onto a **throwaway local PostgreSQL** so SQL can
be tested without touching any hosted Supabase project. It only ever connects
to `127.0.0.1` and never reads `.env.local`.

```bash
# 1. a scratch cluster (any PostgreSQL 15+; production is 17)
initdb -D "$TMPDIR/aqar-pg" -U postgres -A trust -E UTF8 --locale=C
pg_ctl -D "$TMPDIR/aqar-pg" -o "-p 54329" -l "$TMPDIR/aqar-pg/log" start

# 2. replay the baseline + every migration into database aqar_local
PG_BIN=/path/to/postgres/bin LOCAL_PG_PORT=54329 node scripts/local-db/replay.mjs

# 3. run the suites that need it (skipped when LOCAL_PG_PORT is unset)
PG_BIN=/path/to/postgres/bin LOCAL_PG_PORT=54329 npx vitest run tests/owner-portal-access.local-sql.test.ts
```

`00_supabase_stubs.sql` supplies the few Supabase-only pieces the schema needs
(roles, `auth.users/sessions`, `auth.uid()/jwt()`, `vault`, `storage`, the
realtime publication). It is a stand-in, not a replica: it proves SQL logic and
privileges, not hosted-platform behaviour (for example Auth's own tables).

The test suites clone `aqar_local` per run (`create database ... template`), so
they are repeatable and leave the template untouched.
