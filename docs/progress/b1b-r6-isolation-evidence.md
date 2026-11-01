# B1B-R6 isolated Supabase stack: isolation evidence

Scope: an isolated, rehearsal-only Supabase stack named with the `g0r6` suffix. No integration tests were run, and nothing was committed, pushed or deployed. No secret values appear in this document. Secret material lives only in `C:\Users\Lenovo\AppData\Local\Temp\g0-r6\`.

## 1. Containers, networks and volumes created (all `g0r6-*`)

| Name | Image (tag) | Image ID (short) | Networks | Host bindings |
|---|---|---|---|---|
| g0r6-db | public.ecr.aws/supabase/postgres:17.6.1.165 | 28f0e16a019e | g0r6-internal (172.25.0.2) | none |
| g0r6-auth | public.ecr.aws/supabase/gotrue:v2.196.0 | c0c25187a6b8 | g0r6-internal (172.25.0.4) | none |
| g0r6-storage | public.ecr.aws/supabase/storage-api:v1.79.36 | 6a32896ae2d1 | g0r6-internal (172.25.0.3) | none |
| g0r6-rest | public.ecr.aws/supabase/postgrest:v14.15 | 2f8e7b656f09 | g0r6-internal (172.25.0.5) | none |
| g0r6-kong | public.ecr.aws/supabase/kong:2.8.1 | 1b53405d8680 | g0r6-edge (172.26.0.2), g0r6-internal (172.25.0.6) | 127.0.0.1:58461 -> 8000/tcp |

Networks:
- `g0r6-internal` (bridge, `Internal=true`, id be47db87adc4): g0r6-db, g0r6-auth, g0r6-storage, g0r6-rest, g0r6-kong.
- `g0r6-edge` (bridge, `Internal=false`, id b4ad0b8e5a2e): g0r6-kong only. It exists because Docker does not publish host ports on `--internal` networks, so Kong needs one non-internal network to hold its loopback binding. No other container is attached to it.

Volumes: `g0r6-db-data`, `g0r6-storage-data`.

Binding check:
- `docker inspect` of every g0r6 container shows `HostConfig.PortBindings` empty except g0r6-kong, which has exactly `127.0.0.1:58461`.
- `netstat` shows the host listener only on `127.0.0.1:58461`. No `0.0.0.0` or `[::]` listener exists for this port.
- Host ports for the database (5432), auth (9999), rest (3000) and storage (5000) are not published.

## 2. Identity and endpoint proofs

- `GET http://127.0.0.1:58461/rest/v1/` with apikey and bearer headers: HTTP 200, OpenAPI document, title "standard public schema", version 14.15. PostgREST schema cache: 161 relations, 242 relationships, 394 RPCs.
- `GET /rest/v1/` without apikey: HTTP 401.
- `GET /auth/v1/health` with apikey: HTTP 200, `{"name":"GoTrue","version":"v2.196.0"}`.
- `GET /auth/v1/health` without apikey: HTTP 401.
- `GET /storage/v1/status` with apikey: HTTP 200.
- `GET /auth/v1/admin/users` with the service-role key (read only): HTTP 200.

## 3. Database roles and migrations

Roles present before migrations: anon, authenticated, service_role, authenticator, supabase_auth_admin, supabase_storage_admin, supabase_admin (the image creates them; nothing was created by hand).

Migration run:
- Source: the 93 files in `D:\Web\AqarBooks\supabase\migrations\*.sql`, sorted with `LC_ALL=C`, through `20261019100500_fiscal_year_opened_audit.sql`. Count = 93, which is every migration in the folder.
- Staging copy: `C:\Users\Lenovo\AppData\Local\Temp\g0-r6-mig\` (`files\`, `order.txt`, `apply.sh`). Copied into `g0r6-db:/tmp/g0-r6-mig`, and only that container's /tmp was used.
- Executed as `postgres` over the container-local socket (`psql -h /run/postgresql`), `ON_ERROR_STOP=1`, `VERBOSITY=verbose`.
- Log `/tmp/g0-r6-mig/apply.log` in the container: 93 `OK`, 0 `FAIL`, final line `ALL 93 APPLIED`. No SQLSTATE was raised.
- Result: 145 tables in `public`.

Services migrations: GoTrue applied 70 of its own migrations. storage-api applied 74 of its own migrations (`storage.migrations`), against the real storage-api container, not the stub from `g0-mig\storage-stub.sql`.

## 4. Container log summary

- g0r6-auth: "GoTrue migrations applied successfully", "GoTrue API started". Warnings only for deprecated env names.
- g0r6-rest: connected to PostgreSQL 17.6 at g0r6-db:5432; listener on the `pgrst` channel; schema cache loaded.
- g0r6-storage: one transient `startupError` with SQLSTATE 28P01 (password authentication failed) at first start, before the database role password was ready. The container then started, connected as supabase_storage_admin and listened on 5000. No later errors.
- g0r6-kong: declarative config loaded from `kong.yml` (routes `/auth/v1/`, `/rest/v1/`, `/storage/v1/`; key-auth on the `apikey` header).

## 5. Test users

No test users were created. The integration suite creates its own users per test through the auth admin API (for example `admin.auth.admin.createUser` with randomised emails), so no fixed accounts are needed by the suite. `auth.users` count = 0.

## 6. Pre-existing resources

Not touched: g0rehearsal-b1b-20261024, -r2, -r3, -r5, g0_iso_test, g0_isolated_test_net, every `supabase_*aqarbooks*` / `supabase_*_EduEdara` / `supabase_*_harrik` / `supabase_*_Al-Kadi` container, `intelligent_hamilton`, the Vector containers, all pre-existing volumes and networks. `docker ps -a` uptimes after the run match the start-of-session snapshot.

No `docker prune`, `docker rm` or `rm -rf` was run on existing resources. One `rm -rf` inside the r6 DB container was denied by the permission layer and was not executed; the copy was redone without it.

## 7. BLOCKED items

None for the stack itself.

Notes and deviations:
- Kong sits on the extra `g0r6-edge` network so the loopback publish works. Database, auth, rest and storage stay on `g0r6-internal` only.
- PostgREST v14.15 was chosen because it matches the main local AqarBooks stack. v16.1 was available as well.
- `docker run` used env files from the r6 secret folder. The secrets themselves are not in this document or the repo.

## 8. Cleanup

Nothing was stopped or removed. The r6 stack stays running for the next stage. Teardown is a later, explicit step that removes only the g0r6 containers, the `g0r6-edge` and `g0r6-internal` networks, and the `g0r6-db-data` and `g0r6-storage-data` volumes.
