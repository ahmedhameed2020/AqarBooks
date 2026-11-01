# G0 v3 — options for a COMPLETE JSON inventory when row security applies (comparison, nothing created in production)

Fact base (TEST data, verified): 14 public tables have a json/jsonb column; the five with the largest JSON content have row security enabled and are not forced (`forced=false`); their policy calls `current_member_id`, which a non-privileged role cannot execute. Roles tested: `postgres` (bypassrls=true in the test cluster), `supabase_admin` (superuser), `authenticated`/`anon` (bypassrls=false). The production roles are NOT known to this review; they must be checked by the owner with the read-only query in §5 before any choice is taken.

Why this matters: an inventory run by a role subject to row security sees only the rows its policies allow. Without a guard that is a silent partial inventory. `json-key-inventory.sql` v2 stops with `RLS-GUARD` in that case (tested: exit 3, nothing written).

## Options

| # | Option | Completeness | Who holds the power | What an attacker or a mistake can do | Needs |
|---|---|---|---|---|---|
| A | Run as the table owner (not forced RLS) | full | ownership: ALTER, DROP, TRUNCATE, GRANT on the tables | a stolen credential can destroy or rewrite the schema | **forbidden** by the G0 condition (no ownership) |
| B | Dedicated SELECT-only role WITH `BYPASSRLS`, SELECT only on the 14 JSON tables | full | reads every row of those 14 tables across all organisations; no write | a stolen credential reads cross-tenant JSON rows (values are not written anywhere; the inventory shows names/shapes only, but the role can read values by hand) | **explicit approval** (contradicts the no-BYPASSRLS condition) |
| C | `SECURITY DEFINER` function owned by a BYPASSRLS owner, returns only aggregates (no values, no key names outside an approved list); the role gets EXECUTE on that single function | full for the aggregates | the owner role (bypassrls) runs a fixed body | the owner role itself is powerful; the function must be reviewed like code and must set `search_path`; a future edit could leak | owner role with bypassrls **created in production** (forbidden now); not prototyped |
| D | Run the inventory on the **restored copy** in the isolated rehearsal container (the copy is restored by the owner's dump, after the export; the restore role in the container must be the table owner or bypass RLS: TO VERIFY in the rehearsal, not assumed here) | full on the copy | the rehearsal container (isolated, no outbound access) | the copy must be produced first; a raw dump contains secrets unless produced with the export method; the copy is only as current as the snapshot | the rehearsal phase (G3); the export-of-the-copy itself has the same RLS question (see §3) |
| E | Keep the guard; no production inventory; the approved list is written by the owner from knowledge of the code | partial, owner-driven | none extra | a key the owner forgets is not in the list; no automated detection | no new privilege |

## Recommendation (for the owner's decision; nothing chosen here)
- **D** is the only option that is complete AND adds no privilege in production. It moves the inventory to the rehearsal copy, which is already part of the approved path. Its limit: it needs the copy first.
- If the production inventory is required before the copy, **B** is the least-complex option, and it needs an explicit exception to the no-BYPASSRLS condition, a written owner approval, and a credential that exists only for the inventory window.
- **A** and **C** are not recommended now. C needs production objects, which the current conditions forbid.
- **E** is acceptable only if the owner accepts that the inventory is partial by design.

## §3 Same issue in the EXPORT (not in the inventory)
`export-run.psql` reads the tables through the same role, and it writes `_counts.csv` from `count(*)` in the same snapshot. Under row security with a non-bypass role, the export and its counts would both be partial and would agree, so load-verify V1 would pass on a partial export. **This is a blocker for the export phase** and must be decided before any production export: the export role must bypass row security (option B-style, SELECT only) or the export must refuse to run when row security applies (same guard as the inventory). This review did NOT change the export for this; it is recorded as a risk R-RLS-EXPORT.

## §4 What was verified on TEST
- Non-bypass role: inventory stops with RLS-GUARD (T5); export of a non-bypass role not run (R-RLS-EXPORT is a risk, not tested end-to-end).
- Bypass role, SELECT only: inventory output identical to the owner run (T6).
- Non-bypass role reading `members`: fails closed with `permission denied for function current_member_id` (R3). This is NOT a general proof: a role that CAN execute the policy functions and is not bypassing RLS was not tested.

## §5 Read-only query for the owner (to be run by the owner on production; NOT run by the assistant)
```sql
-- read-only: attributes and RLS state only; no row data
select rolname, rolbypassrls, rolsuper from pg_roles where rolname in (current_user, 'postgres', 'authenticated', 'anon');
select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity order by 1;
```
