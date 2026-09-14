# AqarBooks Property Operations & Owner Experience Audit

Date: 2026-09-14

Scope: repository-grounded audit for Maintenance, Work Orders, Visitor Passes, Gate Operations, unit timeline, notifications, and accounting integration. This document intentionally stops before production implementation.

## A. Executive Summary

AqarBooks already supports a substantial property finance and owner/member experience:

- Staff app routes under `app/[locale]/(app)` for dashboard, property, members, finance, admin, platform audit, and notifications.
- Member portal routes under `app/[locale]/portal` for dashboard, statement, dues, online payments, units, documents, and profile.
- Supabase-backed tenancy through `organizations`, `organization_memberships`, roles, permissions, and RLS helpers.
- Canonical member/owner model through `members`, `member_phones`, `unit_ownerships`, leases/installment relationships, and `current_member_id()`.
- Canonical accounting through chart of accounts, dues, payments, allocations, supplier invoices, expenses, reports, fiscal periods, and audit logs.
- Supplier, purchasing, expense, payment-provider, and operational-alert primitives that can be reused by maintenance operations.

Relevant functionality already exists:

- Member self-service portal, including financial statement, due settlement, payment history, authorized units, signed document access, and profile display.
- Staff-side property unit detail pages with financial and activity tabs.
- Permission gates through `denyIfMissingPermission`, `hasPermission`, RLS policies, and role templates.
- Audit logging through `platform_audit_logs`.
- Operational alerts derived from existing data through `lib/alerts/operational-alerts.ts`.
- Purchasing and supplier primitives for vendor-facing cost workflows.
- Expense and supplier invoice posting that already writes to the canonical ledger instead of a parallel ledger.

Partially implemented areas:

- Unit timeline exists as a derived UI from financial and ownership events, but it does not yet include maintenance or access events.
- Notifications exist as operational alerts and digest infrastructure, but no maintenance or visitor notification events exist.
- Inventory permissions and subscription entitlements exist, but no repository evidence was found for inventory item or stock-movement tables in the generated Supabase types.
- Owner document access works through a safe admin-client server action workaround because the current `member_documents` RLS policy does not directly authorize portal members by `current_member_id()`.
- Maintenance appears in finance report labels and example due descriptions, but no operational maintenance request/work-order domain exists.

Genuinely missing areas:

- Maintenance request submission, categories, assignment, staff triage, member-visible status, and attachments.
- Work orders, scheduling, SLA timestamps, technician/vendor assignment, completion evidence, and work-order cost breakdown.
- Secure visitor passes, QR validation, gate/operator UI, gates, access events, vehicle association, pass revocation, and replay protection.
- Dedicated operations dashboard for maintenance/access data.
- Feature entitlement checks for the new maintenance/access modules.

Maintenance and Access fit the existing architecture. The right approach is additive: extend `app/[locale]/portal` and the staff app, use Supabase tables with RLS, reuse existing member/unit/property/accounting primitives, and avoid a separate owner portal, access identity model, or shadow ledger.

Recommended implementation order:

1. P1 Maintenance Requests.
2. P2 Work Orders & SLA.
3. P3 Maintenance Cost Integration.
4. P4 Visitor Passes.
5. P5 Gate Operations.
6. P6 Timeline & Notifications.
7. P7 Operations Dashboard.

Largest architectural/security risks:

- Client-supplied `organization_id`, `member_id`, `unit_id`, cost, status, or pass state being trusted server-side.
- Duplicating the member/owner model instead of deriving ownership from `members`, `unit_ownerships`, leases, and installment plans.
- Creating a maintenance ledger separate from the existing dues/payments/journal system.
- Implementing QR codes with sensitive payloads or predictable IDs.
- Shipping UI filtering without RLS-backed tenant/member isolation.
- Creating a second portal instead of extending `app/[locale]/portal`.

## B. Existing Architecture Map

| Area | Repository Evidence | Important Files / Tables / Services / Policies | Audit Finding |
| --- | --- | --- | --- |
| Next.js/app structure | App Router under `app/[locale]`; staff app in `(app)` and portal in `portal/(guest)` / `portal/(member)` | `app/[locale]/(app)`, `app/[locale]/portal`, `proxy.ts`, `package.json` | Architecture already separates staff and member experiences cleanly. |
| Supabase integration | Server/client/admin helpers and generated database types | `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/types.ts` | New production features should use existing Supabase helpers and regenerate types after migrations. |
| Authentication | Staff session helpers and portal-member session resolution | `lib/auth/session.ts`, `lib/auth/authorize.ts`, `lib/auth/org-context.ts`, `lib/auth/portal-member.ts` | Staff and member auth paths already exist; maintenance/visitor actions must derive actor identity server-side. |
| Organizations / tenancy | Organization-scoped tables and permission helpers | `organizations`, `organization_memberships`, `organization_is_active()`, `is_org_member()`, `has_permission()` | Every proposed table needs `organization_id`, FK constraints, tenant-scoped indexes, and RLS. |
| Members | Portal identity maps auth users to `members.user_id` | `members`, `member_phones`, `member_invitations`, `members_with_financials`, `current_member_id()` | Reuse `members`; do not create a new resident/owner identity table for MVP. |
| Properties | Staff property module and property-scoped finance/reporting | `properties`, `app/[locale]/(app)/property`, `property.*` permissions | Maintenance/access should be property-scoped where the operation physically belongs to a property. |
| Units | Unit listing/detail, financial summary, ownership tabs | `units`, `units_with_financials`, `app/[locale]/(app)/property/[unitId]` | Maintenance requests and visitor passes should reference existing `units.id`. |
| Ownership/member-unit relationships | Unit ownership and portal unit visibility already use member scope | `unit_ownerships`, `unit_ownerships_select_own`, `app/[locale]/portal/(member)/units/page.tsx` | Member authorization should be derived from active/valid ownership or other existing member-unit relationships, not request payloads. |
| Accounting | Canonical journal/COA/fiscal-period infrastructure exists | Finance pages under `app/[locale]/(app)/finance`, journal/COA/payment functions in migrations/baseline, `platform_audit_logs` | Maintenance must not create a shadow ledger. Costs become expenses/supplier invoices; owner charges become dues/receivables only via explicit rules. |
| Receivables | Dues and due types are canonical receivables | `dues`, `due_types`, `app/[locale]/(app)/finance/dues`, portal dues pages | Optional maintenance owner charges should reuse dues/receivables. |
| Payments | Payments, allocations, online transactions, receipts already exist | `payments`, `payment_allocations`, `online_payment_transactions`, portal payments pages | Maintenance payment collection should reuse existing payment and receipt flows. |
| Receipts | Receipt numbers and print buttons exist in portal/staff finance | `portal-print-receipt-button.tsx`, payment records, `record_payment` docs | No maintenance-specific receipt system should be created. |
| Suppliers/vendors | Supplier and purchasing domain exists | `suppliers`, `supplier_invoices`, `purchase_requests`, `purchase_orders`, `lib/actions/purchasing.ts`, finance supplier pages | Technician/vendor assignment can reuse `suppliers` where the assignee is an external vendor. Internal technician identity needs a minimal staff-user link. |
| Purchasing | Purchase request/order flows exist | `purchase_requests`, `purchase_orders`, purchasing actions and RLS migrations | Work-order procurement should integrate later with purchasing, not duplicate approvals. |
| Expenses | Expense posting/reporting exists | `expenses`, expense categories, `app/[locale]/(app)/finance/expenses` | Maintenance costing can create expenses only through explicit finance actions and permissions. |
| Documents/storage | Member document metadata, storage signing action, and portal UI exist | `member_documents`, `lib/actions/member-portal-documents.ts`, portal documents page | Maintenance attachments need a tenant-safe storage pattern; do not expose arbitrary storage object paths to members. |
| Notifications | Derived operational alerts and settings exist | `lib/alerts/operational-alerts.ts`, `lib/actions/alerts.ts`, `app/[locale]/(app)/notifications` | Initial maintenance notifications can be derived; persistent notification events should wait until product rules are clear. |
| Audit logging | Platform audit log table is reused by many flows | `platform_audit_logs`, `app/[locale]/(app)/platform/audit`, finance audit reports | Maintenance/access lifecycle mutations should write safe audit summaries without sensitive QR tokens or guest PII. |
| Permissions | Permission keys and role templates are central | `permissions`, `roles`, `role_permissions`, `user_role_assignments`, `app/[locale]/(app)/admin/roles` | Add narrow permission keys, e.g. `operations.maintenance.*` and `operations.access.*`, rather than broad admin-only checks. |
| RLS | Baseline/migrations define member and staff policies | `supabase/baseline/baseline_schema.sql`, `supabase/tests/phase_owner_portal_*`, `current_member_id()` | New tables must ship with RLS and tests in the same PR. |
| Feature flags/subscriptions | Plans, entitlements, subscriptions, tenant flags exist | `plans`, `plan_entitlements`, `subscriptions`, `tenant_feature_flags`, `get_entitlement()` | New modules should be entitlement-gated after schema and before broad UI exposure. |

## C. Existing Member Portal Audit

| Route | Purpose | Data Source | Authorization | Mobile Ready | Current Gaps |
| --- | --- | --- | --- | --- | --- |
| `/portal` | Member dashboard: portfolio, balances, recent dues/payments, unit summary | `members_with_financials`, `dues`, `units_with_financials`, `payments`, `payment_allocations` | `getPortalMemberContext()` plus RLS/member filters | Yes; `PortalShell` has mobile header/nav and dashboard cards | No service actions such as maintenance request or visitor invite. |
| `/portal/statement` | Owner/member statement movement list | `dues`, `payments`, `payment_allocations`, units | `getPortalMemberContext()` and RLS | Yes; table/card responsive client | No maintenance-origin charge labels beyond existing due/source metadata. |
| `/portal/dues` | Open dues and checkout entry | `dues`, `payment_allocations`, `organization_finance_settings` | `getPortalMemberContext()` and `dues_select_own` style policies | Yes; member-friendly cards | Does not know maintenance charge source yet. |
| `/portal/payments` | Posted payments and online transaction statuses | `payments`, `payment_allocations`, `online_payment_transactions` | Member-scoped RLS and server action checks | Yes; card/table style | No maintenance-related filtering beyond existing finance records. |
| `/portal/units` | Member authorized units and ownership/installment summary | `units_with_financials`, `unit_ownerships`, `installment_plans` | `getPortalMemberContext()`, member filters, `unit_ownerships_select_own` | Yes; compact cards | No service history, visitor eligibility, or maintenance actions per unit. |
| `/portal/documents` | Member documents and signed download URLs | `member_documents`, storage signed URLs | Safe admin-client action filters by `member_id` and `organization_id` | Yes; document cards | Direct owner-self RLS/storage policy is still a known gap. |
| `/portal/profile` | Member profile and contact/tax/identity details | `members`, auth user, `members_with_financials` | `getPortalMemberContext()` and member self policy | Yes; profile sections | No self-service edit or notification preferences tied to maintenance/access. |

Additional portal components inspected:

- Portal layout: `app/[locale]/portal/(member)/layout.tsx` protects every member route through `getPortalMemberContext()`.
- Portal shell: `portal-shell.tsx` provides desktop sidebar, mobile header, owner card, RTL/LTR support, and shared spacing.
- Desktop navigation: `portal-nav.tsx` groups Overview, Finance, Portfolio, and Account.
- Mobile navigation: `portal-shell.tsx` renders flattened horizontal navigation.
- Dashboard client: `portal-dashboard-client.tsx` renders financial summary and portfolio cards.
- Reusable portal UI: `portal-ui.tsx` provides native portal cards, badges, empty states, and helper formatting.

Conclusion: no new portal should be created. Extend the existing portal. The default recommendation in the prompt is supported by repository evidence.

## D. Existing Domain Reuse Matrix

| Proposed Capability | Existing Primitive to Reuse | New Code Required | Notes |
| --- | --- | --- | --- |
| Maintenance Request | `members`, `units`, `properties`, `current_member_id()`, portal shell/UI | New tables/actions/routes | Member creates against authorized existing unit. |
| Work Order | `properties`, `units`, `suppliers`, staff permissions, audit logs | New table/actions/staff UI | Keep operational status separate from accounting. |
| Technician/Vendor | `suppliers` for external vendors; `organization_memberships`/auth users for staff | Assignment fields and permissions | Do not create a full HR module. |
| Attachments | Storage helpers, `member_documents` pattern, signed URLs | Maintenance attachment table and storage policy | Use opaque object paths; no cross-tenant bucket leakage. |
| Parts | Inventory permissions/entitlements | Defer or create only after inventory schema confirmed | Current evidence shows permissions/entitlements, not stock tables. |
| Expenses | `expenses`, `expense_categories`, supplier invoice posting | Linking fields from work order to expense/invoice | Costs post only through existing finance permissions. |
| Owner Charges | `dues`, `due_types`, receivable posting | Explicit owner-charge action | Never auto-post from completion alone. |
| Receivables | `dues`, payment allocations, statements | Source link metadata | Reuse canonical receivable lifecycle. |
| Payments | `payments`, `payment_allocations`, online transactions | No new payment domain | Maintenance dues are paid normally. |
| Receipts | Existing payment receipt model | No new receipt domain | Use existing receipt numbers/print. |
| Visitor Pass | `members`, `units`, `properties`, portal UI | New pass/token model | QR payload should contain opaque token only. |
| Gate | `properties`, org permissions | New gate table and restricted UI | Keep hardware vendor independent. |
| Access Event | `platform_audit_logs` for audit; proposed operational event table for gate history | New `access_events` | Audit log is not a substitute for operational access history. |
| Vehicle | Existing member/unit identity | Optional `vehicles` table | Defer if visitor MVP can work without it. |
| Notifications | `operational-alerts`, alert settings/digest | Add maintenance/access alert derivation later | Avoid premature notification table. |
| Unit Timeline | `lib/property/unit-activity.ts`, unit detail activity tab | Extend event builder | Do not build a separate timeline system first. |
| Audit Trail | `platform_audit_logs` | New safe action names/summaries | Avoid logging tokens or unnecessary guest PII. |

## E. Gap Analysis

| Capability | Classification | Evidence / Reason |
| --- | --- | --- |
| Owner/member portal | EXISTS | `app/[locale]/portal/(member)` implements protected dashboard, finance, units, documents, and profile. |
| Maintenance requests | MISSING | No maintenance request table/routes/actions found; finance text only references maintenance conceptually. |
| Work orders | MISSING | No work-order operational table/routes/actions found. |
| Assignment | MISSING | No maintenance assignment domain found; supplier/staff primitives exist. |
| SLA | MISSING | No SLA timestamps/policies for maintenance found. |
| Vendors | REUSE EXISTING PRIMITIVE | `suppliers` and purchasing/supplier invoice flows exist. |
| Maintenance attachments | MISSING | Documents exist, but no maintenance attachment domain/storage policy. |
| Inventory | PARTIAL | Permissions and entitlements exist; no generated inventory item/stock-movement tables found. |
| Stock movements | MISSING | No stock movement table was found in `lib/supabase/types.ts`. |
| Maintenance costing | REUSE EXISTING PRIMITIVE | Expenses, suppliers, supplier invoices, and reports exist; operational work-order cost links are missing. |
| Owner charge integration | REUSE EXISTING PRIMITIVE | Use existing dues/receivables/payments/receipts. |
| Visitors | MISSING | No visitor pass domain found. |
| QR passes | MISSING | No QR token/pass validation domain found. |
| Gates | MISSING | Only marketing `gates_count`/payment gateway wording found; no physical gate model. |
| Gate operators | MISSING | No gate operator role/permission found. |
| Access events | MISSING | No access event table found. |
| Vehicles | MISSING | Early planning docs mention vehicles, but no active generated table evidence was found. |
| Notifications | PARTIAL | Operational alert framework exists; no maintenance/access events. |
| Timeline | PARTIAL | Unit activity timeline exists for finance/ownership/unit-created events only. |
| Operations dashboard | MISSING | Staff dashboards exist, but not maintenance/access operational KPIs. |
| Feature entitlements | PARTIAL | Plans/subscriptions/feature flags exist; no maintenance/access entitlements found. |

## F. Proposed Domain Model

Use repository naming conventions from existing tables: plural snake_case, `organization_id`, `property_id` where applicable, `created_at`, `updated_at`, RLS-enabled, and permission-gated staff writes.

### `maintenance_categories`

- Purpose: organization-scoped service categories shown to members and staff.
- Key columns: `id`, `organization_id`, `name_en`, `name_ar`, `default_priority`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- Foreign keys: `organization_id -> organizations.id`.
- Constraints: unique active category names per organization; `default_priority` constrained to known values.
- Indexes: `(organization_id, is_active, sort_order)`.
- Lifecycle/status: active/inactive only.
- Tenant ownership: organization-owned.
- RLS: staff with maintenance manage permission can CRUD; members can read active categories for their organization.
- Relationship: used by `maintenance_requests.category_id`.

### `maintenance_requests`

- Purpose: member/staff-submitted maintenance issue tied to a property/unit.
- Key columns: `id`, `request_no`, `organization_id`, `property_id`, `unit_id`, `requester_member_id`, `category_id`, `title`, `description`, `priority`, `status`, `member_visible_note`, `internal_note`, `submitted_at`, `triaged_at`, `assigned_at`, `started_at`, `completed_at`, `closed_at`, `cancelled_at`, `reopened_count`, `created_by`, `updated_by`, `created_at`, `updated_at`.
- Foreign keys: organization, property, unit, requester member, category.
- Constraints: `unit.organization_id = organization_id`; `property.organization_id = organization_id`; `unit.property_id = property_id`; status constrained by server-side transition function/action; request number unique per organization.
- Indexes: `(organization_id, status, created_at desc)`, `(organization_id, property_id, status)`, `(organization_id, unit_id, created_at desc)`, `(requester_member_id, created_at desc)`.
- Lifecycle/status: `SUBMITTED`, `TRIAGED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `CLOSED`, `CANCELLED`.
- Tenant ownership: organization-owned; unit/property scoped.
- RLS: members can create/read own authorized-unit requests; staff can read/write by organization and permission.
- Relationship: source for work orders, attachments, audit events, optional owner charges.

### `maintenance_request_attachments`

- Purpose: tenant-safe files/evidence for maintenance requests.
- Key columns: `id`, `organization_id`, `maintenance_request_id`, `uploaded_by_member_id`, `uploaded_by_user_id`, `storage_bucket`, `storage_path`, `file_name`, `content_type`, `byte_size`, `visibility`, `created_at`.
- Foreign keys: request, organization, member/user.
- Constraints: storage path prefix includes organization/request id; visibility constrained to `MEMBER_VISIBLE` or `STAFF_ONLY`; one organization per request.
- Indexes: `(organization_id, maintenance_request_id)`.
- Lifecycle/status: immutable metadata; soft delete only if existing repo convention requires it.
- Tenant ownership: organization-owned through request.
- RLS: member can access own request attachments only where visible; staff can access within org by permission.
- Relationship: reuses signed URL pattern from member documents without exposing raw storage.

### `work_orders`

- Purpose: staff-managed operational execution record for a request.
- Key columns: `id`, `organization_id`, `property_id`, `unit_id`, `maintenance_request_id`, `work_order_no`, `status`, `assigned_user_id`, `supplier_id`, `scheduled_start_at`, `scheduled_end_at`, `sla_due_at`, `started_at`, `completed_at`, `completion_summary`, `member_visible_summary`, `estimated_cost_amount`, `actual_cost_amount`, `financial_posting_status`, `created_at`, `updated_at`.
- Foreign keys: organization, property, unit, maintenance request, supplier, assigned user profile/auth mapping.
- Constraints: at least one of internal assignee or supplier when status becomes `ASSIGNED`; costs non-negative; `financial_posting_status` independent from operational status.
- Indexes: `(organization_id, status, scheduled_start_at)`, `(organization_id, supplier_id)`, `(organization_id, maintenance_request_id)`.
- Lifecycle/status: `DRAFT`, `ASSIGNED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Tenant ownership: organization-owned.
- RLS: staff manage; members read only member-visible summaries for their authorized unit/request.
- Relationship: created from maintenance request, can link to expenses/supplier invoices later.

### `work_order_parts`

- Purpose: optional material/parts consumption for a work order.
- Key columns: `id`, `organization_id`, `work_order_id`, `description`, `quantity`, `unit_cost`, `inventory_item_id`, `stock_movement_id`, `created_at`.
- Foreign keys: work order; future inventory tables if confirmed.
- Constraints: quantity > 0; costs non-negative.
- Indexes: `(organization_id, work_order_id)`.
- Lifecycle/status: tied to work order; do not post stock movements until inventory schema exists.
- Tenant ownership: organization-owned.
- RLS: staff only; member sees only rolled-up visible costs if explicitly allowed.
- Relationship: deferred until inventory readiness.

### `visitor_passes`

- Purpose: member-created visitor invitation for authorized property/unit.
- Key columns: `id`, `organization_id`, `property_id`, `unit_id`, `created_by_member_id`, `guest_display_name`, `guest_phone_last4` or minimal contact field, `purpose`, `valid_from`, `valid_until`, `single_use`, `status`, `token_hash`, `token_version`, `revoked_at`, `revoked_by`, `consumed_at`, `created_at`, `updated_at`.
- Foreign keys: organization, property, unit, member.
- Constraints: `valid_until > valid_from`; token hash unique; status constrained; no sensitive business data in QR payload.
- Indexes: `(organization_id, property_id, valid_from, valid_until)`, `(organization_id, unit_id, created_at desc)`, `(token_hash)`.
- Lifecycle/status: stored `ISSUED`, `REVOKED`, `CONSUMED`, `DENIED`; computed display state may be upcoming/active/expired/check-in/out.
- Tenant ownership: organization/property-owned; created by member.
- RLS: member can manage own passes for authorized units; staff can view/manage by permission; gate operator cannot list all passes.
- Relationship: validated by server action/API to create `access_events`.

### `gates`

- Purpose: physical/logical access checkpoint independent from hardware vendor.
- Key columns: `id`, `organization_id`, `property_id`, `name`, `direction`, `is_active`, `metadata`, `created_at`, `updated_at`.
- Foreign keys: organization, property.
- Constraints: unique active name per property; direction constrained to `ENTRY`, `EXIT`, `BOTH`.
- Indexes: `(organization_id, property_id, is_active)`.
- Lifecycle/status: active/inactive.
- Tenant ownership: organization/property-owned.
- RLS: staff with access manage permission can CRUD; gate operator can read assigned active gates only if assignment is introduced.
- Relationship: used by pass validation and access events.

### `access_events`

- Purpose: immutable operational evidence for pass validation decisions.
- Key columns: `id`, `organization_id`, `property_id`, `gate_id`, `visitor_pass_id`, `unit_id`, `decision`, `reason_code`, `occurred_at`, `operator_user_id`, `request_fingerprint`, `safe_summary`.
- Foreign keys: organization, property, gate, visitor pass, unit, user.
- Constraints: decision constrained to `ALLOWED`/`DENIED`; no raw token; reason code constrained.
- Indexes: `(organization_id, property_id, occurred_at desc)`, `(organization_id, visitor_pass_id, occurred_at desc)`, `(gate_id, occurred_at desc)`.
- Lifecycle/status: append-only.
- Tenant ownership: organization/property-owned.
- RLS: staff can read by permission; member can read filtered events for own passes; gate operator can insert validation decision through server-side RPC/action and see minimal result.
- Relationship: source for visitor history and access audit.

### `vehicles`

- Purpose: optional visitor/member vehicle metadata if product chooses to capture it.
- Key columns: `id`, `organization_id`, `member_id`, `unit_id`, `plate_label`, `country_code`, `vehicle_type`, `is_active`, `created_at`, `updated_at`.
- Foreign keys: organization, member, unit.
- Constraints: plate data optional/minimized; unique active plate per organization only if operationally required.
- Indexes: `(organization_id, unit_id, is_active)`, `(organization_id, member_id)`.
- Lifecycle/status: active/inactive.
- Tenant ownership: organization-owned.
- RLS: member can manage own authorized-unit vehicles; staff by permission.
- Relationship: optional link from `visitor_passes` later.

## G. State Machines

### Maintenance Request

Allowed states:

- `SUBMITTED`
- `TRIAGED`
- `ASSIGNED`
- `IN_PROGRESS`
- `WAITING`
- `COMPLETED`
- `CLOSED`
- `CANCELLED`

Allowed transitions:

| From | To | Actor | Rules |
| --- | --- | --- | --- |
| create | `SUBMITTED` | Member/owner or staff | Server derives organization/member/unit authorization. |
| `SUBMITTED` | `TRIAGED` | Property staff/admin | Category/priority can be confirmed. |
| `TRIAGED` | `ASSIGNED` | Property staff/admin | Requires internal assignee or supplier/work-order link. |
| `ASSIGNED` | `IN_PROGRESS` | Property staff/admin/assigned staff | Sets `started_at`. |
| `IN_PROGRESS` | `WAITING` | Property staff/admin/assigned staff | Requires reason/member-visible or internal note. |
| `WAITING` | `IN_PROGRESS` | Property staff/admin/assigned staff | Resumes work. |
| `IN_PROGRESS` | `COMPLETED` | Property staff/admin/assigned staff | Requires completion summary/evidence policy. |
| `COMPLETED` | `CLOSED` | Property staff/admin | Terminal normal closure. |
| `SUBMITTED`, `TRIAGED` | `CANCELLED` | Requesting member or staff | Member cancellation only before work starts. |
| non-terminal | `CANCELLED` | Staff/admin | Requires cancellation reason. |
| `COMPLETED`, `CLOSED` | `TRIAGED` | Staff/admin | Reopen by creating an event, incrementing `reopened_count`, and clearing terminal timestamp only if business rules allow. |

Terminal states: `CLOSED`, `CANCELLED`. Reopen should be explicit and audited; arbitrary status update is not allowed.

### Visitor Pass

Recommended stored states:

- `ISSUED`
- `REVOKED`
- `CONSUMED`
- `DENIED`

Recommended computed display states:

- Upcoming: `ISSUED` and `now < valid_from`.
- Active: `ISSUED` and `valid_from <= now <= valid_until`.
- Expired: `ISSUED` and `now > valid_until`.
- Checked In / Checked Out: derived from successful `access_events`.

Allowed transitions:

| From | To | Actor | Rules |
| --- | --- | --- | --- |
| create | `ISSUED` | Authorized member or staff | Server derives authorized unit/property. |
| `ISSUED` | `REVOKED` | Creator member or staff | Fails future validation immediately. |
| `ISSUED` | `CONSUMED` | Server validation | Only for `single_use = true` after allowed entry; protected by transaction/lock. |
| `ISSUED` | `DENIED` | Staff/admin | Optional moderation state if product wants staff approval. |
| any terminal | no update | Server | Terminal states cannot be reactivated; issue a new pass. |

Single-use behavior: validation must lock the pass row, check hash/status/window/property/gate, create one access event, and mark the pass consumed in the same transaction. Replay sees `CONSUMED` and is denied.

## H. Authorization Matrix

Existing role names include tenant/admin/finance/property roles in the seeded role templates. A dedicated gate operator role was not found; this audit recommends adding a narrow permission such as `operations.access.validate` and assigning it to a future gate operator role or existing property staff role.

| Action | Admin (`TENANT_OWNER` / `GENERAL_MANAGER`) | Accountant (`FINANCE_MANAGER` / `ACCOUNTANT`) | Property Staff (`PROPERTY_MANAGER`) | Gate Operator (new narrow permission) | Member/Owner |
| --- | --- | --- | --- | --- | --- |
| View maintenance request | Yes, org-scoped | Cost/finance view only if needed | Yes, org/property-scoped | No | Own authorized-unit requests only |
| Create maintenance request | Yes | No by default | Yes | No | Yes, authorized units only |
| Assign work order | Yes | No | Yes | No | No |
| Complete work order | Yes | No | Yes/assigned staff | No | No |
| View cost | Yes | Yes | Limited, if permitted | No | No, unless explicitly member-visible |
| Create owner charge | Yes | Yes via finance permission | No by default | No | No |
| Create visitor pass | Yes | No | Optional staff-created pass | No | Yes, authorized units only |
| Revoke visitor pass | Yes | No | Yes by access permission | No | Own pass only |
| Scan/validate pass | Yes | No | Yes if assigned | Yes, minimal result only | No |
| View access history | Yes | No by default | Yes, property-scoped | Minimal current decision/history only | Own passes/events only |
| Manage gates | Yes | No | Yes with access manage permission | No | No |
| View operational dashboard | Yes | Finance widgets only if needed | Yes | No | No |

## I. RLS Plan

Staff access:

- Staff reads and writes are always scoped by `organization_id`.
- Write policies should require explicit permission keys such as `operations.maintenance.manage`, `operations.maintenance.assign`, `operations.access.manage`, and `operations.access.validate`.
- Use existing helper style from `has_permission(auth.uid(), organization_id, permission_key)`.
- Staff UI must still filter by property/status for UX, but security is RLS and server-side validation.

Member access:

- Member identity is derived by `current_member_id()` and `members.user_id = auth.uid()` through existing portal logic.
- Member maintenance reads require `requester_member_id = current_member_id()` or an authorized relationship to `unit_id`.
- Member pass reads/writes require pass `created_by_member_id = current_member_id()` and unit authorization.
- Unit authorization should reuse existing owner/member-unit patterns: `unit_ownerships`, lease tenant membership where applicable, and installment buyer relationships if product confirms they may request service or invite guests.

Gate operator access:

- Gate operator should not list visitors or full pass history.
- Validation should be a server-side function/action accepting an opaque token and gate id.
- Response should be minimal: allow/deny, display-safe guest name if required, unit/building label if required, reason code, and next action.
- The raw token is never stored in `access_events` or logs.

Cross-tenant protection:

- Every proposed table carries `organization_id`.
- FK consistency must prevent cross-tenant property/unit/member/pass links.
- Policies must compare the table `organization_id`, not client-submitted organization values.
- Validation must derive `organization_id` from gate/pass rows and reject mismatches.
- RLS tests must include cross-org member spoofing, cross-org unit spoofing, cross-property gate misuse, and revoked/expired/replayed token cases.

## J. QR Threat Model

| Threat | Mitigation |
| --- | --- |
| Token guessing | Use high-entropy random token; store only hash; rate-limit validation endpoint. |
| Sequential IDs | QR payload contains opaque token only, never database IDs. |
| QR screenshot reuse | Single-use option consumes pass in a transaction; multi-use passes still log each use and enforce window/status. |
| Replay | Lock pass row during validation; reject already consumed single-use passes. |
| Expired pass reuse | Server compares `valid_from`/`valid_until`; client clock irrelevant. |
| Revoked pass reuse | Server checks stored status before allowing access. |
| Cross-property reuse | Validation checks gate property against pass property. |
| Cross-tenant reuse | Validation checks organization consistency across gate/pass/property/unit. |
| Client-side authorization bypass | QR rendering is display only; all validation and mutations are server-side. |
| Forged organization/unit IDs | Server derives org/unit/member from existing rows and current session. |
| Brute-force validation | Rate limit public/operator endpoint; log denial reason without token; monitor abnormal failures. |
| Leaking guest PII through QR payloads | Payload contains only opaque token/version; no guest name, phone, unit, org, or property data. |

## K. Accounting Integration Map

Recommended flow:

`Maintenance Request`
-> `Work Order`
-> `Cost`
-> `Optional Owner Charge`
-> `Existing Receivable`
-> `Existing Payment`
-> `Existing Receipt`
-> `Existing Ledger`

Operational status is separate from financial posting status:

- A request can be `COMPLETED` without any owner charge.
- A work order can have estimated/actual costs without posting finance entries yet.
- Supplier/vendor costs should become supplier invoices or expenses only through existing finance permissions and posting actions.
- Owner charges should become `dues` only through explicit business rules, selected due type/account mapping, and receivables permissions.
- Payments and receipts remain in `payments`, `payment_allocations`, online transactions, and existing receipt rendering.
- Ledger impact remains through existing posting functions and journal infrastructure.

Existing functions/services to reuse:

- Purchasing/supplier actions in `lib/actions/purchasing.ts` for vendor-side workflows.
- Finance expenses pages/actions/RPCs for non-invoice expense posting.
- `dues` and due issuance patterns for owner charges.
- `record_payment` / online payment flows for settlement.
- `platform_audit_logs` for auditable financial and operational transitions.

Completing a maintenance job must not automatically create financial entries unless explicit business rules require it.

## L. UX / Navigation Proposal

Member portal changes should extend the current information architecture:

- Dashboard
- Finance
- Statement
- Dues
- Receipts / Payments
- Property
- Units
- Documents
- Services
- Maintenance
- Visitors
- Account
- Profile

Desktop:

- Add a `Services` group in `portal-nav.tsx`.
- Add `/portal/maintenance` and `/portal/visitors`.
- Keep the current `PortalShell` sidebar and owner identity card.
- Unit cards can expose compact actions: "New maintenance request" and "Invite guest" only when the member is authorized for that unit.

Mobile:

- Prioritize action-first pages.
- Maintenance page starts with `New Request`, then simple status cards.
- Visitors page starts with `Invite Guest`, then active/upcoming pass cards and "Show pass".
- Avoid dense tables in the member portal; staff can use tables.

Staff/admin:

- Add staff-side Maintenance Operations under existing staff app navigation conventions, likely near Property rather than Finance.
- Add Access / Gates as an operations/security area, restricted by access permissions.
- Unit detail activity tab can later include maintenance/access events by extending `lib/property/unit-activity.ts`.

Do not redesign unrelated pages.

## M. Implementation Plan

| Phase | Goal | Schema Changes | Backend Changes | UI Changes | Permissions/RLS | Tests | Migration Risk | Dependencies | Definition of Done |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 Maintenance Requests | Member can submit, staff can triage/assign basic request | `maintenance_categories`, `maintenance_requests`, attachments metadata | Server actions with status transition validation and storage signing | `/portal/maintenance`, staff request list/detail | New maintenance permissions; member/staff RLS | RLS isolation, server action auth, bilingual UI smoke | Low/medium additive | Existing portal/member/unit/security | Meets Maintenance MVP items 1-8, 9-10 with translations/mobile. |
| P2 Work Orders & SLA | Staff execution workflow | `work_orders`; optional event table | Assignment, scheduling, SLA timestamps, completion evidence | Staff work order detail; member-visible updates | Assignment/complete permissions | Transition tests, staff org isolation | Medium | P1 | Work orders cannot bypass request/org constraints. |
| P3 Maintenance Cost Integration | Costs link to accounting without shadow ledger | Cost link fields; maybe due source metadata | Explicit expense/supplier invoice/owner charge actions | Staff cost panel | Finance permissions reused | Accounting regression, no auto-post test | Medium/high | P2, finance mapping decision | Financial posting status independent and tested. |
| P4 Visitor Passes | Member creates secure visitor pass | `visitor_passes` | Token generation/hash, revoke, QR render action | `/portal/visitors` | Member authorized-unit RLS | Expired/revoked/cross-tenant tests | Medium | Portal/unit authorization | Meets Visitor MVP items 1-6 and mobile/i18n basics. |
| P5 Gate Operations | Operator validates pass and records decision | `gates`, `access_events` | Server validation RPC/action with replay protection | Restricted scanner UI | Access permissions/gate operator | Replay, cross-property, minimal disclosure tests | Medium/high | P4 | Every validation creates event; QR never authorizes client-side. |
| P6 Timeline & Notifications | Surface operational events | Maybe no new table if deriving | Alert derivation and timeline builder extension | Unit timeline, portal dashboard cards | Reuse alert settings and RLS | Visibility tests | Low/medium | P1-P5 event data | Owners see only filtered history. |
| P7 Operations Dashboard | KPI dashboard after reliable data exists | Views/materialized summary only if needed | Aggregation services | Staff operations dashboard | Staff read permission | Aggregate correctness and tenant isolation | Low/medium | P1-P6 | KPIs reflect real operational data. |

## Required Final Output Before Implementation

### 1. What Already Exists

- Existing bilingual staff app and member portal structure.
- Member portal auth, dashboard, statements, dues, payments, units, documents, and profile.
- Supabase tenancy, permissions, RLS helpers, generated types, admin/server/client helpers.
- Properties, units, members, ownership, leases/installment relationships, receivables, payments, receipts, suppliers, purchasing, expenses, reports, notifications, and audit logs.

### 2. What Is Missing

- Maintenance request/work-order operational domain.
- Maintenance attachments and status state machine.
- Visitor pass, QR token validation, gate, access event, and gate operator domain.
- Operations dashboard for these new workflows.
- Direct owner-self RLS for member document metadata/storage remains a related gap.

### 3. What Should Be Reused

- Tables: `organizations`, `members`, `properties`, `units`, `unit_ownerships`, `dues`, `payments`, `payment_allocations`, `suppliers`, `purchase_requests`, `purchase_orders`, `expenses`, `platform_audit_logs`, `plans`, `subscriptions`, `tenant_feature_flags`.
- Services/actions: `getPortalMemberContext()`, Supabase helpers, purchasing actions, finance due/payment patterns, operational alerts.
- Components/routes: existing `app/[locale]/portal`, `PortalShell`, `portal-nav`, `portal-ui`, staff property detail/activity tab.
- Security: `current_member_id()`, `has_permission()`, org-scoped RLS, server-side actions/RPCs.

### 4. Proposed Architecture

Add a small operations domain alongside existing property and finance modules. Maintenance starts as member-submitted operational records tied to existing units/properties. Work orders manage execution. Costs optionally flow into existing expenses/supplier invoices/dues. Visitor passes use opaque QR tokens and server validation. Gates and access events remain hardware independent.

### 5. Proposed Schema Changes

First PR should introduce only P1 schema:

- `maintenance_categories`
- `maintenance_requests`
- `maintenance_request_attachments`
- Maintenance permission keys
- RLS policies and pgtap-style tests

Later phases add `work_orders`, optional `work_order_parts`, `visitor_passes`, `gates`, `access_events`, and optional `vehicles`.

### 6. Portal Changes

- Extend existing `app/[locale]/portal`.
- Add `Services` navigation group.
- Add `/portal/maintenance` in P1.
- Add `/portal/visitors` in P4.
- Add unit-level shortcuts after server authorization is implemented.

### 7. Staff/Admin Changes

- Add Maintenance Operations staff list/detail under the staff app.
- Add assignment/triage controls after request schema exists.
- Add Access/Gates screens only in P5.
- Add operations dashboard only after real events exist.

### 8. Security Review

- Tenant isolation depends on `organization_id` FKs, RLS, and server-side derivation.
- Member authorization must derive from `current_member_id()` and existing member-unit relationships.
- QR codes must contain opaque tokens only.
- Gate validation must be transactional, rate-limited, and minimal-disclosure.
- No production feature should ship without RLS tests.

### 9. Accounting Integration

Maintenance operational records do not post to accounting automatically. Vendor cost posting reuses expenses/supplier invoices. Owner charges reuse dues/receivables. Payments and receipts reuse existing payment infrastructure. Financial posting status is separate from maintenance/work-order status.

### 10. Implementation Phases

Use P1-P7 from section M. Keep each phase reviewable and additive.

### 11. Risks / Open Decisions

- Whether tenants, installment buyers, and owners all have the same maintenance/visitor rights.
- Whether member-visible cost summaries are allowed.
- Whether visitor passes require approval for specific properties.
- Minimum visitor data and retention period.
- Whether to create a dedicated gate operator role or only a permission key initially.
- Inventory readiness before work-order parts consumption.

### 12. Recommended First PR

Smallest high-value first PR: Maintenance Request MVP foundation.

Expected files:

- Migration under `supabase/migrations/*_maintenance_requests.sql`.
- Generated types in `lib/supabase/types.ts`.
- Server actions such as `lib/actions/maintenance.ts`.
- Portal routes under `app/[locale]/portal/(member)/maintenance`.
- Staff routes under `app/[locale]/(app)/operations/maintenance` or the existing closest staff navigation location.
- Portal navigation update in `app/[locale]/portal/(member)/portal-nav.tsx`.
- Translations used by Arabic/English UI.
- Tests in `supabase/tests/*maintenance*`, Vitest action tests if harness permits, and Playwright smoke for member mobile submission.

Acceptance criteria:

- Authenticated member sees only authorized units.
- Member creates request only for authorized unit.
- Payload spoofing of member/unit/organization fails.
- Staff sees only organization requests.
- Staff can triage/assign through validated transitions.
- Attachments are tenant-safe.
- Actions write safe audit logs.
- Arabic/English and mobile flows are usable.
- Existing accounting tests remain unaffected.
