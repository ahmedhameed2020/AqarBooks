# Rollout plan — `replace_role_permissions_atomic` signature change

Status: **plan + local order test only. Nothing has been deployed.** Tested locally by
`tests/role-permissions-rollout.local-sql.test.ts` (4 tests, scratch PostgreSQL, real psql).

## What changed
| Migration | Effect on the function |
|---|---|
| `20261009120000` | 3-argument form restricted to `service_role`; behaviour unchanged |
| `20261009130000` | adds the 4-argument form `(org, role, permission_ids, actor_user_id)` that re-verifies the acting user inside the transaction; **drops** the 3-argument form |
| `20261009140000` | re-creates the 3-argument form **only as a fail-closed shim**: raises `SIGNATURE_RETIRED` (SQLSTATE `0A000`), touches no data, executable by `service_role` alone |

The application (`lib/actions/roles.ts`) calls the 4-argument form with `p_actor_user_id = currentUser.id`.

## Why there is no "compatible" 3-argument implementation
An old application build calls the function with the service key and no actor. The only way to make that
call succeed is to execute without the database-side check — i.e. to bring back the unguarded path this
work removed. So compatibility is deliberately **availability for old builds, not authorization**: during
the overlap, role-permission edits from an old build are refused with a clear error; every other feature
of the old build is unaffected. The old build's own application-layer checks are not relied on.

## Deploy order (one release)
1. Apply `20261009120000`, `20261009130000`, `20261009140000` **in order, in the same release window.**
   (Applying only `…120000` is harmless. The gap between `…130000` and `…140000` — seconds in a single
   `supabase db push` — makes an old build fail with "function does not exist"; after `…140000` it gets
   `SIGNATURE_RETIRED`. Both refuse, neither writes.)
2. Deploy the new application build.
3. Overlap behaviour until every old instance is gone:

   | Caller | Database state | Result |
   |---|---|---|
   | old build (3 args) | after `…130000` | error `function … does not exist`, role unchanged |
   | old build (3 args) | after `…140000` | error `SIGNATURE_RETIRED`, role unchanged |
   | new build (4 args) | migrations not yet applied | PostgREST `PGRST202` / `42883` → action returns `role_service_upgrading`; **no fallback to the 3-argument form**; role unchanged |
   | new build (4 args) | after `…130000` | works; unauthorized / suspended / invited / other-org actors refused by the database |
   | any client role (`authenticated`, `anon`) | any state | `permission denied` for both signatures |

4. Recommended order is migrations first, then application. New-build-first is also safe (row above) but
   role editing is unavailable until the migration lands.

## Contract step (later, separate migration)
Once no running build can call the 3-argument form (check API/PostgREST logs for `SIGNATURE_RETIRED`
and `replace_role_permissions_atomic` 3-argument calls over a full release cycle):
```sql
DROP FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]);
```
Covered by the "contract step" test. Update `tests/revoked-function-matrix.integration.test.ts` in the same change.

## Rollback
Do **not** restore the 3-argument body. To roll the application back, keep the migrations: the previous
application build only loses role-permission editing (it receives `SIGNATURE_RETIRED`). If role editing
must stay available from the old build, ship a patched old build that passes the actor — not a database
change.

## Verification checklist for the real rollout (NOT done here)
- `supabase migration list` on the target project shows the three versions in order.
- `select proname, pronargs, prosecdef, proacl from pg_proc where proname='replace_role_permissions_atomic';` →
  two rows; 4-arg ACL contains only `service_role`/owner; 3-arg body is the `RAISE EXCEPTION` shim.
- From a staging user session: both signatures return `42501` permission denied.
- A role edit through the UI succeeds for the organization owner and fails for a suspended/invited/other-org user.
