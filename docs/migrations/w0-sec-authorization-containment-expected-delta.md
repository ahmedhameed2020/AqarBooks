# Expected Delta Manifest: W0-SEC Authorization Containment

**Migration Version**: `20260913165500`  
**Migration Filename**: `20260913165500_w0_sec_authorization_containment.sql`  
**Migration SHA-256**: `eba7ae525f91fb9ff3f0a124d99fa108ddc9731e14815931d0b9a75543d35a7f`  
**Base Commit**: PR #34 Merge Commit `252a2987361cac14399d5012114b4eff08322145`  
**ADR 0005 Rollback Classification**: `R1` (Compensating Migration Required)

---

## 1. Structural Changes

### Functions Modified / Replaced:
1. **`public.is_platform_admin(p_user_id uuid)`**
   - **Pre-W0**: Permitted users with `PLATFORM_SUPER_ADMIN` assignments even if `organization_id` was non-null.
   - **Post-W0**: Hardened to strictly require `ura.organization_id IS NULL AND r.key = 'PLATFORM_SUPER_ADMIN' AND r.organization_id IS NULL`.
   - **Security Attribute**: `SECURITY DEFINER`, `SET search_path TO 'public'`.

2. **`public.has_permission(p_user_id uuid, p_organization_id uuid, p_permission_key text)`**
   - **Pre-W0**: Evaluated tenant permissions without asserting active membership in `organization_memberships`.
   - **Post-W0**: Requires canonical platform-admin bypass OR (`status = 'active'` in `public.organization_memberships` for exact `organization_id` AND valid tenant-scoped role assignment with matching permission).
   - **Security Attribute**: `SECURITY DEFINER`, `SET search_path TO 'public'`.

### Functions Created:
3. **`public.guard_user_role_assignments_security()`**
   - Trigger function enforcing:
     - `PLATFORM_SUPER_ADMIN` assignments must have `organization_id IS NULL`.
     - Tenant-owned roles (`r.organization_id IS NOT NULL`) must have assignment `ura.organization_id == r.organization_id` (blocks cross-tenant role assignments).
   - **Security Attribute**: `SECURITY DEFINER`, `SET search_path TO 'public'`.

4. **`public.guard_roles_security()`**
   - Trigger function rejecting creation or modification of organization-scoped roles (`organization_id IS NOT NULL`) with reserved key `PLATFORM_SUPER_ADMIN`.
   - **Security Attribute**: `SECURITY DEFINER`, `SET search_path TO 'public'`.

5. **`public.guard_role_permissions_scope()`**
   - Trigger function preventing organization roles (`r.organization_id IS NOT NULL`) from receiving platform-scoped permissions (`key LIKE 'platform.%'`).
   - **Security Attribute**: `SECURITY DEFINER`, `SET search_path TO 'public'`.

### Triggers Created / Replaced:
1. **`public.user_role_assignments.trg_user_role_assignments_security_guard`**
   - `BEFORE INSERT OR UPDATE ON public.user_role_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_assignments_security();`
2. **`public.roles.trg_roles_security_guard`**
   - `BEFORE INSERT OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.guard_roles_security();`
3. **`public.role_permissions.trg_role_permissions_scope_guard`**
   - `BEFORE INSERT OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.guard_role_permissions_scope();`

---

## 2. Data Impact

```text
Expected business-data row mutation: NONE
```

- **No DML operations**: Zero `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` against business or accounting data tables.
- **Zero backfills**: No existing business rows are altered or deleted.
- **Pre-migration Production Preflight**: **REQUIRED BEFORE DEPLOYMENT AUTHORIZATION**
  - Staged forensics queries from `docs/forensics/w0-sec-production-check.sql` must be executed as a strictly read-only, count-only check against production by an authorized operator prior to release authorization.
  - Required Preflight Invariants:
    1. Cross-tenant assignments count: must be `0`.
    2. Tenant roles with platform permissions count: must be `0`.
    3. Malformed `PLATFORM_SUPER_ADMIN` assignments count: must be `0`.
  - Production writes executed: **0** (Production remains strictly read-only).

---

## 3. Expected Unchanged Surfaces

All of the following surfaces are asserted and verified to experience **ZERO** structural or data changes:
- **Accounting & Ledger tables**: `chart_of_accounts`, `fiscal_years`, `journal_entries`, `journal_entry_lines`, `cost_centers`.
- **Property & Operational tables**: `properties`, `units`, `leases`, `lease_installments`, `dues`, `payments`, `receipts`, `expenses`.
- **Tenant Business data**: All tenant-scoped entities remain completely unaffected.
- **Retired Customer-Import Staging Schemas**: `legacy_migration` (14 tables, 6 views) and `accsys_stage` (22 tables) remain completely untouched.
- **Unrelated RLS Policies**: All 177 existing RLS policies remain identical (0 diff).
- **Public Tables & Columns**: Total tables (107) and columns (1,255) remain identical (0 diff).

---

## 4. Replay & Catalog Delta Verification Result

Measured in isolated disposable PGlite database (replayed from canonical baseline start `20260821105505_baseline.sql` through `20260903172101_member_opening_balance.sql`):
- **Note on Replay Normalization**: Historical migration `20260823200624_property_reports_permission.sql` is strictly preserved byte-for-byte in repository `supabase/migrations/`. In-memory during disposable PGlite replay, the missing semicolon between `ON CONFLICT DO NOTHING` and `COMMIT;` is normalized for WASM parser compatibility.
- **Tables changed**: 0
- **Views changed**: 0
- **Columns changed**: 0
- **Policies changed**: 0
- **Triggers added**: 3 (exact expected triggers: `trg_user_role_assignments_security_guard`, `trg_roles_security_guard`, `trg_role_permissions_scope_guard`)
- **Functions added/modified**: 5 (exact expected functions: `is_platform_admin`, `has_permission`, `guard_user_role_assignments_security`, `guard_roles_security`, `guard_role_permissions_scope`)
- **Unexpected Forward Delta Count**: **0** (`unexpected forward delta = 0` ✅)

---

## 5. ADR 0005 Class R1 Compensating Recovery & Round-Trip Parity

- **Compensating Script**: `supabase/recovery/20260913165500_w0_sec_authorization_containment_recovery.sql`
- **Exact Restorations**:
  - Restores `public.is_platform_admin(uuid)` to exact PRE-W0 baseline definition from `20260821105505_baseline.sql` lines 5009-5024.
  - Restores `public.has_permission(uuid, uuid, text)` to exact PRE-W0 baseline definition from `20260821105505_baseline.sql` lines 4684-4701.
  - Drops the 3 W0 guard triggers and 3 W0 guard functions.
  - Re-applies exact baseline owners and grants to `authenticated` and `service_role`.
- **Round-Trip Parity**: `PRE-W0 -> W0 -> RECOVERY -> PRE-W0`
  - Replayed in disposable in-memory PGlite.
  - Pre-W0: 107 tables, 3 views, 1255 cols, 423 fns, 59 triggers, 177 policies.
  - Post-W0: 107 tables, 3 views, 1255 cols, 426 fns, 65 triggers, 177 policies.
  - Post-Recovery: 107 tables, 3 views, 1255 cols, 423 fns, 59 triggers, 177 policies.
  - **Unexpected Recovery Delta Count**: **0** (`unexpected recovery delta = 0` ✅)

