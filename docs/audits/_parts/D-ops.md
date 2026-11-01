# Audit part D — Operations / non-finance (READ-ONLY, static code inspection)

Commit audited: 5d2804f (master). The working tree has uncommitted edits (see section 4). Nothing was executed and no DB was queried. No capability below is VERIFIED END-TO-END. Many tests exist under tests/ (gate-*, amenity-*, final-hardening, demo-*) but this audit did not run them.

Legend: IRNV = IMPLEMENTED — RUNTIME NOT VERIFIED; PI = PARTIALLY IMPLEMENTED; BO = BACKEND ONLY; UI = UI ONLY-MOCK; NF = NOT FOUND. Priority: P0 launch/commercial-critical, P1 important, P2 later.

## 0. Cross-cutting facts

1. Enablement is three independent layers, all must pass:
   a. Org status. `organization_is_active()` = organizations.status IN ('TRIAL','ACTIVE'). TRIAL is treated as fully active. There is NO trial expiry date/timer/column (grep trial_end: none).
   b. Plan entitlement `get_entitlement(org,key)` (subscriptions.status='ACTIVE' JOIN plan_entitlements) OR a `tenant_feature_flags` row (flag_key, enabled=true). Keys actually read by code/SQL: `maintenance_module`, `visitor_management` (gate operations too: `gate_operations_enabled()` just calls `visitor_management_enabled()`), `unit_experience` (vehicles, unit timeline, notifications), `amenity_bookings`, `lease_lifecycle`. Each migration seeds 'true' only for PROFESSIONAL/ENTERPRISE and 'false' for STARTER (20260914131953, 20260915073908, 20260915100016, 20260917040349, 20260917183206).
   c. RBAC `has_permission`, plus for gate "completion" features an opt-in per-org `gate_completion_policy` (default OFF; RPC `set_gate_completion_policy`, needs operations.gates.manage; migration 20261001070000).
2. `tenant_feature_flags` is writable only by platform admin (RLS). NO UI or server action writes it (grep: only backup classification refers to it). Enabling a flag for one org = manual SQL as platform admin. Plan change UI exists: /platform/organizations/[id] subscription-form -> `assignSubscription` -> RPC `assign_subscription` (STARTER/PROFESSIONAL/ENTERPRISE).
3. Owner-portal ACCESS itself (login, dues, statement, payments list, documents, profile) is NOT plan-gated. It depends on a member row linked to the auth user, org active, portal not suspended, no pending forced password change (`current_member_id()` returns NULL otherwise; migration 20261004120000_owner_portal_access.sql). Individual portal modules (maintenance, visitors, vehicles/notifications, amenities, leases) are plan/flag-gated per 0.1b.
4. Demo: `organizations.is_demo` + env `DEMO_ORGANIZATION_ID`; writes blocked by RLS and `denyIfDemo`. Demo visibility of ops modules depends on the demo org's plan/flags and principal role, not on code absence. `scripts/demo/seed-demo-tenant.ts` is referenced in lib/demo/config.ts but does NOT exist in the repo.

## 1. Seats / user limits / "flexible paid user count"

- DB seeds (baseline 20260821105505, ~L21418-21446): plan_entitlements `max_users` STARTER=5, PROFESSIONAL=25, ENTERPRISE=-1; `max_resorts` 1/3/-1; `max_units` 100/1000/-1.
- ENFORCEMENT: NONE FOUND. Grep for max_users|max_units|max_resorts|user_limit|seat over app/ lib/ components/ and post-baseline migrations: zero consumers. `get_entitlement` is only called for the 5 boolean keys above. `inviteUserAction` (lib/actions/users.ts:126), `createResortAction` (lib/actions/tenant.ts) and unit creation contain no limit check. Confidence HIGH.
- Pricing page (components/marketing/pricing/pricing-data.ts, pricing-copy.ts) states DIFFERENT numbers and names: Essential EGP 1,490/mo (1,190 annual), 100 units / 3 users; Professional 3,490 (2,790 annual), 500 units / 10 users; Enterprise custom (1,000+ units). Onboarding package EGP 2,900. DB: 5/25/unlimited users, 100/1000/unlimited units, plan keys STARTER/PROFESSIONAL/ENTERPRISE. Mismatch (3 vs 5, 10 vs 25, 500 vs 1000).
- No per-seat add-on, no quantity column (subscriptions: plan_id, status ACTIVE|CANCELED|PAST_DUE, period start/end), no tenant-billing integration (onboarding migration says "NO PAYMENT PROVIDER"). Billing is manual/offline. period_end is not enforced (get_entitlement checks status only).
- FLEXIBLE PAID USER COUNT: NOT SUPPORTED. plan_entitlements is global per plan (platform-admin managed); there is no per-org numeric override (tenant_feature_flags is boolean only). Pricing FAQ says owners/tenants do not consume seats: consistent with the data model (staff = organization_memberships; owners = members rows).
- Classification: user limits = BACKEND ONLY, NOT ENFORCED; flexible seats = NOT FOUND.

## 2. Capability classification

### Property
| # | Capability | Class | Paths / tables / RPCs | Limitation | Relevance | Conf | Pri |
|---|---|---|---|---|---|---|---|
| P1 | Projects/resorts, zones, buildings, units | IRNV | tables properties, zones, buildings, units (types VILLA/CHALET/APARTMENT/SHOP/OFFICE/SERVICE/OTHER; area, floor, handed_over_at, archived_at); /admin/resorts, /property, /property/[unitId]; lib/actions/tenant.ts, property.ts, projects.ts, unit-lifecycle.ts | max_resorts/max_units not enforced; no phase/cluster level beyond zone/building | Fits tourist village | H | P1 |
| P2 | Members (owners/tenants/companies), phones, archiving, opening balance | IRNV | members, member_phones; lib/actions/member-lifecycle.ts, member-profile.ts, member-opening-balance.ts; /members | — | Core | H | P1 |
| P3 | Ownership shares + validation | IRNV | unit_ownerships.share_percentage numeric(5,2) CHECK (0,100]; RPC link_unit_ownership (SHARE_OVERFLOW); trigger trg_unit_ownership_total -> enforce_unit_ownership_total() (advisory lock, overlapping date ranges, total <= 100) in 20261001123000_final_hardening_sprint.sql; RLS unit_ownerships_manage needs property.members.manage | Total must be <=100, NOT required =100 (under-allocation allowed). Time-share / week-based usage rights: NF | Owners' association shares OK; timeshare not modelled | H | P1 |
| P4 | Bulk import + legacy Access migration | IRNV | RPC import_property_csv, /import, lib/actions/property-import.ts; accsys_* staging migrations | Accsys is a one-off toolkit | Onboarding accelerator | M | P2 |

### Owner / customer portal (app/[locale]/portal)
| # | Capability | Class | Paths | Gate | Limitation | Conf | Pri |
|---|---|---|---|---|---|---|---|
| O1 | Provisioning/activation (email link; client-ID + temp password) | IRNV | /activate/<token>, POST /api/portal-activation/inspect and /complete, lib/actions/member-portal-access.ts, lib/portal-access/*, migration 20261004120000, docs/owner-portal-activation.md | staff perms members.portal.invite / members.portal.manage; owner needs >=1 active unit_ownerships; Resend required for email path | Depends on RESEND_API_KEY; no WhatsApp API (credentials copy/paste). Whether migration 20261004120000 is applied in prod is unknown | H | P0 |
| O2 | Legacy passwordless invite | IRNV | migration 20260823044325, /portal/accept-invite | — | Superseded | M | P2 |
| O3 | Login, suspended-org handling | IRNV | /portal/login, lib/auth/portal-member.ts | org active | — | H | P1 |
| O4 | Units list + unit timeline | IRNV | portal units/, units/[unitId]/timeline, lib/portal/unit-command-center*.ts | timeline under unit_experience | PRO+ | M | P1 |
| O5 | Balance / dues / statement / payment history / receipts | IRNV | portal dues, statement, payments; view members_with_financials; lib/portal/portal-finance.ts; lib/actions/member-portal-receipts.ts | RLS dues_select_own; org active; not plan-gated | — | H | P0 |
| O6 | Online payment (Fawry) | IRNV at 5d2804f; DISABLED in working tree | lib/actions/online-payment-checkout.ts, lib/payments/providers/fawry.ts, paymob.ts (contract tests only, not approved for prod), app/api/webhooks/fawry, cron payment-events, migration 20260924072325, /finance/payment-providers (finance.online_payments.manage), docs/runbooks/fawry-production-pilot.md ("NO-GO by default", pilot-org allowlist) | per-org provider settings + pilot allowlist | Uncommitted lib/payments/fawry-initiation-policy.ts hard-returns isFawryInitiationAllowed()=false (no merchant agreement). No refunds/settlement posting. Net: no live online payments | Collections stay manual/cashier/bank | H | P0 |
| O7 | Documents | IRNV (web only) | portal documents, lib/actions/member-portal-documents.ts (admin-client signed link) | — | Mobile defers (no member-safe RPC) | M | P2 |
| O8 | Maintenance requests (create, timeline, cancel, photos) | IRNV | portal maintenance/*; RPC create_maintenance_request, cancel_own_maintenance_request, begin/finalize/abort_maintenance_attachment_upload (private bucket maintenance-attachments) | maintenance_module; is_current_member_unit_owner | PRO+ | H | P1 |
| O9 | Visitor QR passes (owner issues) | IRNV | portal visitors/*; RPC create_visitor_invitation, revoke_visitor_invitation; tables visitor_invitations, visitor_invitation_secrets (sha256 only) | visitor_management | PRO+ only | H | P0 |
| O10 | Vehicles | IRNV | portal vehicles/*, table vehicles; staff /operations/vehicles | unit_experience | — | M | P2 |
| O11 | Amenity bookings | IRNV | portal amenities, staff /operations/amenities, amenity_bookings, amenity_booking_enabled() | amenity_bookings | Pool/beach/court fits resort | M | P1 |
| O12 | Leases + renewal requests | IRNV | portal leases, leases/[id]/renewal, lease_renewal_requests, lease_lifecycle_enabled() | lease_lifecycle | — | M | P2 |
| O13 | In-app notifications | IRNV | portal notifications, table notifications | unit_experience | In-app only, no push/SMS | M | P2 |

### Maintenance
| # | Capability | Class | Detail | Limitation | Conf | Pri |
|---|---|---|---|---|---|---|
| M1 | Requests, categories, status machine | IRNV | migration 20260914131953; create_maintenance_request, update_maintenance_request_staff, assert_maintenance_status_transition; /operations/maintenance(+[requestId]); perms operations.maintenance.view/manage | maintenance_module, PRO+ | H | P1 |
| M2 | Work orders: create, assign (internal user XOR supplier), schedule, start/wait/resume/complete/cancel, SLA | IRNV | migration 20260914203712; create_work_order, assign_work_order, schedule_work_order, transition_work_order, work_order_sla_breached; /operations/maintenance/work-orders(+[id]); perms operations.work_orders.view/manage/assign/complete | Read is ORG-WIDE for anyone with .view/.complete (work_order_staff_can_read). "My tasks only" is client filtering (mobile repository.dart ~L1314-1322 .eq('assigned_user_id', me)), not RLS. Whether transition_work_order requires caller == assignee was not traced | H/M | P1 |
| M3 | Attachments (before/after photos) | IRNV | migration 20260914200226, private bucket, server-generated paths, extension allow-list fn | — | H | P2 |
| M4 | Costs -> accounting bridge | IRNV | migration 20260915050914; add_work_order_cost, update/void_unposted_work_order_cost, post_work_order_cost_as_expense, post_work_order_cost_as_supplier_invoice, charge_work_order_cost_to_owner (owner due); perms operations.maintenance.costs.view/manage/post, operations.maintenance.owner_charge | Posting correctness belongs to finance audit | H | P1 |
| M5 | Technician role | PI | No technician template exists. The 12 role templates are TENANT_OWNER, TENANT_ADMIN, GENERAL_MANAGER, FINANCE_MANAGER, ACCOUNTANT, CASHIER, COLLECTOR, AUDITOR, PROPERTY_MANAGER, STOREKEEPER, PURCHASING_MANAGER, VIEWER. work_orders.* is granted to OWNER/ADMIN/GM/PROPERTY_MANAGER, view to VIEWER. A technician is a custom role (/admin/roles). Mobile README: start/wait/resume need .manage, complete needs .complete, so a field technician needs broader .manage | M | P1 |
| M6 | Lease-expiry alerts / digest | IRNV | cron lease-expiry, alert-digest, alert_digest_runs | Email optional | M | P2 |

### Gates / security
| # | Capability | Class | Detail | Limitation | Conf | Pri |
|---|---|---|---|---|---|---|
| G1 | Gate setup | IRNV | migration 20260915081839; create_gate, update_gate; /operations/gates; perms operations.gates.view/manage | visitor_management, PRO+ | H | P0 |
| G2 | Trusted device enrolment/revocation | IRNV | migration 20260925124947 + 20260925140133; create_gate_device_enrollment, redeem_gate_device_enrollment, revoke_gate_device, verify_gate_device_binding; lib/gates/device-credentials.ts, device-store.ts; gates/device-enrollment-dialog.tsx, gate-devices-panel.tsx; perm operations.gates.devices.manage; single-use code, hash-only storage | Device credential supplements user auth | H | P0 |
| G3 | QR visitor passes: issuance, windows, revocation | IRNV | visitor_invitations (valid_from < valid_until, max 30 days, SINGLE_USE|MULTI_USE, ACTIVE|REVOKED), validate_visitor_pass_token, revoke_visitor_invitation; staff /operations/visitors(+[id]); perms operations.visitors.view/manage | 30-day cap; no recurring contractor/staff pass type seen; no guest ID capture | H | P0 |
| G4 | Entry/exit scans and decisions | IRNV | process_visitor_gate_scan (ALLOW VALID_ENTRY/VALID_EXIT; DENY EXPIRED, NOT_YET_VALID, REVOKED, PASS_ALREADY_USED, ALREADY_INSIDE...), append-only access_events; /operations/gate (operations.gates.scan), /operations/access-events (operations.access_events.view); lib/gates/scanner-*.ts; app/gate-scanner.webmanifest | Online-only | H | P0 |
| G5 | Occupancy + reconcile | IRNV | /operations/gate/occupancy, bounded CSV export, perm operations.gates.occupancy.reconcile | needs gate_completion_policy ON | M | P1 |
| G6 | Exceptions, supervision evidence, audit ledger | IRNV | migration 20260925160550; separate append-only REQUEST and APPROVAL rows, self-approval blocked; perms operations.gates.exceptions.create/approve; lib/actions/gate-supervision.ts, gate-evidence.ts, lib/gates/evidence-csv.ts | needs gate_completion_policy ON | H | P1 |
| G7 | Connectivity / offline limits | IRNV | public/gate-scanner-sw.js caches only 4 static assets (manifest, 2 icons, offline.html); /api,/auth,/rest,/rpc network-only; record_gate_connectivity_incident (20260925152255) | FAIL-CLOSED: no offline validation, no cached allow-list, no queued scans. Internet/Supabase outage = no QR admission. Material for remote resort gates | H | P0 |
| G8 | Hardware outbox (barrier/turnstile) | PI | migration 20260925184655; cron app/api/cron/gate-hardware; lib/gates/hardware/registry.ts returns only the NOOP adapter; perm operations.gates.hardware.manage | No vendor adapter: cannot actually open a barrier | H | P1 |
| G9 | Owner entry notifications, long-stay alerts | IRNV | migration 20260925182911, 20261001052203; cron gate-notifications; /operations/gates/long-stay-policy | Opt-in; CRON_SECRET + 5-min best-effort scheduler; in-app only | M | P2 |
| G10 | Pilot readiness | doc | docs/runbooks/gate-operations-pilot.md; docs/CLAUDE-HANDOFF-GATES-2026-10-01.md (feature merged to master, commit 27f8e68, PR #57) | Handoff explicitly "not a production-readiness certificate"; preconditions: long-stay owner/threshold, CRON_SECRET + workflows, named operators, evidence retention owner | H | P0 |

### Roles & permissions
| # | Capability | Class | Detail | Limitation | Conf | Pri |
|---|---|---|---|---|---|---|
| R1 | System role templates | IRNV | 12 templates cloned per org by clone_tenant_role_templates. No gate-operator, technician, demo or owner/customer role. Owner/customer is not a role: it is members + current_member_id() | Gate operator and technician must be custom roles | H | P1 |
| R2 | Permission catalogue | IRNV | `permissions` table (~100+ keys): platform.*, tenant.settings/users/roles.manage, property.*, finance.*, operations.* (maintenance, work_orders, costs, visitors, gates + sub-keys, access_events, vehicles, amenities), members.portal.invite/manage | Mostly module-level view/manage; fine-grained only for gates, work orders, costs. tenant.settings.manage also guards AI governance | H | P1 |
| R3 | Custom roles | IRNV | /admin/roles, lib/actions/roles.ts (tenant.roles.manage; only keys present in role_template_permissions are assignable; atomic replace_role_permissions_atomic) | Cannot grant keys outside templates | H | P1 |
| R4 | Per-user scoping (property/zone) | NOT ENFORCED | user_role_assignments.property_id column exists but has_permission(user,org,key) ignores it (baseline L4684, never redefined). Actions/UI never set it | Roles are org-wide. "Manager of resort B only" is impossible; gate scanning is limited by device/gate binding, not user scope | H | P1 |
| R5 | Nav/page guards | IRNV | lib/auth/nav-permissions.ts (server pruning via get_navigation_permissions), lib/auth/page-guard.tsx | Defence-in-depth with RPC/RLS | H | — |
| R6 | Platform admin | IRNV | is_platform_admin() bypasses has_permission in every org | Super-user | H | P1 |

### Employee replacement / user lifecycle
| # | Capability | Class | Detail | Limitation | Conf | Pri |
|---|---|---|---|---|---|---|
| U1 | Invite, change role, suspend/reactivate, remove | IRNV | lib/actions/users.ts (inviteUserAction, changeUserRoleAction, updateUserStatusAction active|invited|suspended, removeUserAction); last-tenant-owner guard; audit trail; /admin/users | No session revocation/ban in users.ts. has_permission checks role assignments only, not organization_memberships.status, so a SUSPENDED user with role assignments may retain permissions: VERIFY at runtime | M | P0 |
| U2 | Transfer/reassign records on replacement | NF | No reassignment tool; work orders must be reassigned via assign_work_order; history kept by FKs/audit | Manual process | M | P1 |
| U3 | Tenant-owner replacement | PI | last-owner guard only; no transfer flow | — | M | P2 |

### Mobile
| # | Capability | Class | Detail | Conf | Pri |
|---|---|---|---|---|---|
| MB1 | Flutter app (mobile/lib/main.dart, Supabase auth + RLS/RPC) with 5 permission-driven personas: Resident/Owner, Operations Manager, Collector/Cashier, Technician, Gate Operator. Files: lib/screens/{resident,manager,collector,technician,gate,activation,app,feature}_screens.dart (~12.6k LOC); mobile_scanner QR; local_auth biometric lock | IRNV | No push (no firebase/fcm dependency), no geolocation/face packages; documents and gate hardware activity deferred | H | P0 |
| MB2 | preview_main.dart QA gallery with _mockUser for 16 screens | UI ONLY-MOCK | Not the shipped entrypoint | H | — |
| MB3 | Google Play status | docs | mobile/docs/GOOGLE_PLAY_CONSOLE_STATUS_2026-10-09.md: draft 1.0.0 (1), Egypt only, listing "Ready to send for review", NOT submitted/released. V1 = no electronic payment initiation: uploaded AAB, a Fawry screenshot, listing text and release notes still carry Fawry claims and need replacement. Pending: Data safety, remaining setup tasks, Play-signing fingerprint on assetlinks (website deploy). Incident docs: mobile/docs/GOOGLE_PLAY_LOCAL_TEST_SCOPE_INCIDENT_2026-10-09.md (a test run hit a real Supabase project and created fictional test orgs/user) | H | P0 |
| MB4 | Web/PWA | PI | Only the gate scanner is a PWA (manifest + static-asset SW). No general owner-portal offline | H | P2 |

### Integrations, notifications, AI
| # | Capability | Class | Detail | Conf | Pri |
|---|---|---|---|---|---|
| N1 | Email | IRNV | Resend (lib/env/server.ts; RESEND_API_KEY optional, unset = log only); activation + alert digest | H | P1 |
| N2 | WhatsApp | PI (deep-link only) | lib/whatsapp.ts builds wa.me URLs; used in finance UIs and mobile pass sharing. No Business API, templates, delivery tracking | H | P1 |
| N3 | SMS / push | NF | grep twilio/sms/web-push/fcm: none | H | P1 |
| N4 | E-invoice | PI | ETA adapter explicitly NOT IMPLEMENTED (lib/einvoice/adapters/eta.ts throws EINVOICE_ETA_NOT_IMPLEMENTED); zatca.ts, fake.ts; /finance/einvoice pipeline. Detail in finance part | H | P1 |
| A1 | AI features | IRNV | app/api/ai/{ask-aqarbooks,extract-invoice,financial-insights,import-map,journal-propose,reconcile-match,smart-dunning}, lib/ai/* | H | P2 |
| A2 | AI governance page | UI ONLY (shell) | /admin/ai-governance client is 33 lines of static text. lib/ai/kill-switch.ts uses an in-memory Map + env AI_KILL_SWITCH_*; isAiFeatureEnabled is referenced only inside kill-switch.ts, so it is not wired to the API routes (per-route env checks not exhaustively verified). Tables ai_audit_logs and correction deltas have NO migration; writes in lib/ai/governance.ts are try/catch-swallowed, so AI audit logging silently no-ops unless created out-of-band. Provenance constants hardcoded (CERT-2026-08-A, PRE_PRODUCTION_CERTIFIED) | H | P1 |

### HR / attendance / payroll
NOT FOUND. Case-insensitive grep for payroll|attendance|timesheet|geofence|face_recog|geolocator|haversine|selfie across app/, lib/, components/, supabase/migrations/, mobile/lib/, mobile/pubspec.yaml found nothing relevant (one comment containing "employee" at lib/portal-access/orchestrate.ts:244). No employee, shift, leave, attendance (face or location) or payroll tables, screens, permissions or packages. Mobile camera use is QR scanning only.

### Trial / subscription / onboarding / support
| # | Capability | Class | Detail | Conf | Pri |
|---|---|---|---|---|---|
| T1 | Trial | PI | organizations.status default 'TRIAL' behaves as active; no expiry, no limits, no conversion flow | H | P1 |
| T2 | Subscription management | PI | subscriptions + assign_subscription; /platform/organizations/[id]; no billing/invoicing/renewal; period_end not enforced | H | P1 |
| T3 | Assisted onboarding | IRNV | /onboarding, onboarding_requests (entity types incl. TOURIST_RESORT, TOURIST_VILLAGE, OWNERS_ASSOCIATION; requested_plan_key), platform super-admin approval provisions org (status ACTIVE) + role clone + TENANT_OWNER + subscription (migration 20260826102930); /platform/leads. Self-service tenant creation deliberately revoked (20260825231151) | H | P0 |
| T4 | Public demo | IRNV | /demo, enterDemoAction, rate limit, funnel events to stdout only | M | P2 |
| T5 | Pricing page | IRNV | /pricing (numbers in section 1); founding program (10 slots via env FOUNDING_SLOTS_REMAINING) | H | P1 |
| T6 | Support / training | NF/PI | /contact form (leads), support@aqarbooks.com; no in-app help center, ticketing or training content | M | P2 |

## 3. Visibility matrix

"per demo org config" = depends on the demo org's plan/flags/principal; not provable from repo.

| Feature | Route / surface | Required role / permission | Entitlement / flag | Demo-visible? | Customer-visible? | Staff-visible? | Evidence |
|---|---|---|---|---|---|---|---|
| Resorts | /admin/resorts | tenant.settings.manage | none | read-only | no | yes | (app)/layout.tsx L113 |
| Units | /property, /property/[id] | property.units.manage | none | read-only | own units via portal | yes | layout L119 |
| Members | /members | property.members.manage | none | read-only | own profile | yes | layout L131 |
| Ownership link | member/unit dialogs | property.members.manage | none | write-blocked | no | yes | unit_ownerships_manage policy |
| Owner portal provisioning | member page | members.portal.invite / .manage | none (active ownership needed; Resend for email path) | write-blocked | n/a | yes | owner-portal-activation.md |
| Portal home/dues/statement/payments | /portal | owner session | none (org TRIAL/ACTIVE) | no demo owner login evidenced | yes | no (staff without member row = not_a_member) | portal-member.ts |
| Online payment | portal payments, mobile | owner | provider settings + pilot allowlist; Fawry initiation hard-disabled (uncommitted) | no | currently NOT available | finance.online_payments.manage | fawry-initiation-policy.ts |
| Portal maintenance | /portal/maintenance | owner (unit owner) | maintenance_module | per demo org config | PRO+ | operations.maintenance.view | 20260914131953 |
| Portal visitor QR | /portal/visitors | owner | visitor_management | per demo org config | PRO+ | operations.visitors.view | 20260915073908 |
| Vehicles / notifications / unit timeline | /portal/vehicles etc. | owner | unit_experience | per demo org config | PRO+ | operations.vehicles.view | 20260915100016 |
| Amenities | /portal/amenities | owner | amenity_bookings | per demo org config | PRO+ | operations.amenities.view | 20260917040349 |
| Leases / renewal | /portal/leases | owner | lease_lifecycle | per demo org config | PRO+ | property.leases.* | 20260917183206 |
| Documents | /portal/documents | owner | none | — | yes | — | member-portal-documents.ts |
| Maintenance (staff) | /operations/maintenance | operations.maintenance.view/manage | maintenance_module (page shows enable-entitlement message when off) | per demo org config | no | yes | operations/maintenance/page.tsx L52 |
| Work orders | /operations/maintenance/work-orders | operations.work_orders.view (+manage/assign/complete) | maintenance_module | per demo org config | member-visible summary only | yes (technicians see org-wide by RLS) | 20260914203712 |
| Work-order costs | WO detail | operations.maintenance.costs.*, owner_charge | maintenance_module | write-blocked | charged due only | accounting/managers | 20260915050914 |
| Gate dashboard | /operations | operations.gates.view | visitor_management | per demo org config | no | yes | layout L151 |
| Gate mgmt / devices | /operations/gates | gates.view/manage, gates.devices.manage | visitor_management | per demo org config | no | yes | layout L164 |
| Scanner | /operations/gate | operations.gates.scan + trusted device | visitor_management | no | no | gate operator | layout L163, handoff doc |
| Access ledger | /operations/access-events | operations.access_events.view | visitor_management | per demo org config | owner gets own-visitor entry notification (opt-in) | yes | layout L165 |
| Occupancy / reconcile | /operations/gate/occupancy | access_events.view / gates.occupancy.reconcile | + gate_completion_policy | per demo org config | no | yes | rollout migration |
| Exceptions / supervision | gates UI | gates.exceptions.create / .approve | + gate_completion_policy | per demo org config | no | supervisors | G6 |
| Long-stay / completion policy | /operations/gates/long-stay-policy, /completion-policy | gates.manage | visitor_management | per demo org config | no | managers | pages exist |
| Roles | /admin/roles | tenant.roles.manage | none | write-blocked | no | yes | layout L309 |
| Users | /admin/users | tenant.users.manage | max_users not enforced | write-blocked | no | yes | layout L308 |
| AI governance | /admin/ai-governance | tenant.settings.manage | none | shell page | no | yes | layout L310 |
| Payment gateways | /finance/payment-providers | finance.online_payments.manage | provider settings | — | no | yes | layout L311 |
| Platform admin | /platform/* | is_platform_admin | — | no | no | platform staff | middleware.ts |
| Onboarding request | /onboarding | authenticated requester | — | — | prospect | platform approves | 20260826102930 |
| Pricing | /pricing | public | — | yes | yes | yes | pricing-data.ts |
| Mobile personas | Play app | permission keys per mobile/README.md | server entitlements still apply | — | resident persona | manager/collector/technician/gate personas | mobile/README.md |

## 4. Caveats / not verified
- Working tree differs from 5d2804f: lib/actions/online-payment-checkout.ts and lib/payments/providers/fawry.ts modified, new lib/payments/fawry-initiation-policy.ts (initiation disabled); mobile screens/repository edited. Payment conclusions reflect both states.
- Live DB migration state was not checked. Whether 20261004120000_owner_portal_access.sql is applied in production is unknown.
- Suspended-membership behaviour (U1) and technician-must-be-assignee (M2) were not traced to final SQL; flagged for runtime test.
- docs/CLAUDE-HANDOFF-GATES-2026-10-01.md refers to a separate worktree; the gate work was later merged to master and appears in HEAD migrations.
