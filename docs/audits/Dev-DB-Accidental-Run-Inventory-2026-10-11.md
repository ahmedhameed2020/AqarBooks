# Development database — inventory of the accidental test-run effects (read-only)

Date: 2026-10-11 · Container: `supabase_db_aqarbooks` (DEVELOPMENT) · Method: SELECT only, every session opened with `default_transaction_read_only=on` (a write would have errored). **Nothing was deleted, updated or cleaned.** Machine-readable copy: `dev-db-accidental-run-inventory-2026-10-11.json` (all ids).

> Update 2026-10-11: the owner states that all 456 organizations in the development database are test/demo data. The inventory is therefore a record of what the accidental runs added, not of any real tenant data; cleanup remains optional and was not performed.

## 1. What was attributed, and how

The accidental writes came from the 16 integration files that used the development container/target before the isolation gate existed. The attribution is by **time window and fixture name**, not by a marker column (the tables carry none):

| Set | Rule | Organizations |
|---|---|---|
| **A — firm** | created 2026-10-10 19:01:43 → 19:19:59 UTC (the three accidental runs), fixture names `Gate RLS A/B/Disabled`, `Visitor RLS A/B/Disabled`, `Gate Device A/B`, `Maintenance PR3 A`, `Renewal Enabled/Other/Conflict/Starter`, `Unit Experience A`, `Evidence Org`, `Other Evidence Org`, `Gate Connectivity Runtime`, `Notify`, `Supervision`, `Other` | **43** |
| **B — probable** | six orgs named `Hardware` created between 10:38 and 18:13 on the same day (fixture of `gate-hardware-outbox-migration`, one of the 16 files); the time pattern differs from set A, so they may come from earlier ordinary runs | 6 (ambiguous — not counted in the totals below) |
| Other 2026-10-10 07:15–07:59 batch (171 orgs, `FRP A/B` …) | earlier phase work; **not** part of this incident | not included |

Development organizations total now: **456** (unchanged by every later run — checked).

## 2. Organizations in set A (43)

| # | id | name | slug | status | created_at (UTC) |
|---|---|---|---|---|---|
| 1 | `425621f8-bd4a-424d-b935-22011d95c194` | Notify | `425621f8-bd4a-424d-b935-22011d95c194` | ACTIVE | 2026-10-10 19:01:43 |
| 2 | `147d1ebb-9c47-4d43-9cc7-48052eec8274` | Supervision | `147d1ebb-9c47-4d43-9cc7-48052eec8274` | ACTIVE | 2026-10-10 19:02:35 |
| 3 | `82f40048-cefa-401e-83ce-3ef4cb5cb23e` | Other | `82f40048-cefa-401e-83ce-3ef4cb5cb23e` | ACTIVE | 2026-10-10 19:02:35 |
| 4 | `7aec8248-4ea0-4d4a-a84a-9de1015db059` | Maintenance PR3 A | `maintenance-pr3-a-25bcb998` | ACTIVE | 2026-10-10 19:04:42 |
| 5 | `5afac2a0-4c0c-4ff8-9342-f691a387dc78` | Gate RLS A | `gate-rls-a-184bb62e` | ACTIVE | 2026-10-10 19:04:54 |
| 6 | `19dbc6dc-ff80-40ad-a9b0-9c5a6e6d45b3` | Gate RLS B | `gate-rls-b-ebeda9b0` | ACTIVE | 2026-10-10 19:04:57 |
| 7 | `da66b6c6-b787-4c50-994f-9aad549bdb89` | Gate RLS Disabled | `gate-rls-disabled-c473f9cf` | ACTIVE | 2026-10-10 19:05:01 |
| 8 | `43f71ce1-1b69-472d-a741-66da008b07a0` | Visitor RLS A | `visitor-rls-a-88f3d545` | ACTIVE | 2026-10-10 19:05:29 |
| 9 | `4c38cdd8-154a-439e-83ef-da0bb37d3a09` | Visitor RLS B | `visitor-rls-b-47279657` | ACTIVE | 2026-10-10 19:05:32 |
| 10 | `12e4c01e-92b7-4127-b57e-9af53680263b` | Visitor RLS Disabled | `visitor-rls-disabled-99112e48` | ACTIVE | 2026-10-10 19:05:34 |
| 11 | `589415ff-aede-4b1e-b19f-521447d437e6` | Evidence Org | `589415ff-aede-4b1e-b19f-521447d437e6` | ACTIVE | 2026-10-10 19:05:39 |
| 12 | `b6d52ecb-8763-4751-8b59-50be77d7ecc8` | Other Evidence Org | `b6d52ecb-8763-4751-8b59-50be77d7ecc8` | ACTIVE | 2026-10-10 19:05:39 |
| 13 | `2b8f4b0c-d56b-4a36-b1e3-5b92efb646e5` | Gate Device A | `gate-device-a-a243d4af` | ACTIVE | 2026-10-10 19:05:52 |
| 14 | `818e60a8-4264-476e-9012-2f21de11097f` | Gate Device B | `gate-device-b-8dbe144e` | ACTIVE | 2026-10-10 19:05:54 |
| 15 | `5236917b-7069-4dca-852f-6875394bb448` | Gate Connectivity Runtime | `gate-connectivity-e7a212f5` | ACTIVE | 2026-10-10 19:06:35 |
| 16 | `2d88f8ae-b8b8-4c0a-9354-d38d6a684b50` | Renewal Enabled | `renewal-enabled-edfa5f4a` | ACTIVE | 2026-10-10 19:09:46 |
| 17 | `00af06b0-5d09-4fe6-95b9-a547d082c5b6` | Renewal Other | `renewal-other-125b1b52` | SUSPENDED | 2026-10-10 19:09:50 |
| 18 | `4340e3c9-adc5-4b74-b3ab-0effec4e1ec5` | Renewal Conflict | `renewal-conflict-5fc0fb66` | ACTIVE | 2026-10-10 19:09:52 |
| 19 | `46358126-bdff-4419-9183-2e0b9cd14a06` | Renewal Starter | `renewal-starter-932bae62` | ACTIVE | 2026-10-10 19:09:55 |
| 20 | `38d432eb-84e5-4d8f-8294-43ad772b9fe9` | Unit Experience A | `unit-experience-a-feca031f` | ACTIVE | 2026-10-10 19:10:13 |
| 21 | `3e2c4c6d-bf7f-4b6a-b3ae-1d0aaa53a92c` | Gate RLS A | `gate-rls-a-fd8ac4bc` | ACTIVE | 2026-10-10 19:13:06 |
| 22 | `a508fd66-e998-4337-b98d-48a2c8d959fa` | Gate RLS B | `gate-rls-b-5aa3d545` | ACTIVE | 2026-10-10 19:13:07 |
| 23 | `5a02dd7e-89c7-47d0-9c59-b1e51cfda48b` | Gate RLS Disabled | `gate-rls-disabled-cc708510` | ACTIVE | 2026-10-10 19:13:09 |
| 24 | `61e1d742-9ef2-4099-86c5-c69ff2db1bf1` | Visitor RLS A | `visitor-rls-a-5e478a2d` | ACTIVE | 2026-10-10 19:13:37 |
| 25 | `c64a0a0c-01b8-45be-9baa-b11f08c28b68` | Visitor RLS B | `visitor-rls-b-cd922a7e` | ACTIVE | 2026-10-10 19:13:39 |
| 26 | `7cb86931-410d-47b7-a0c3-43fc69589bb6` | Visitor RLS Disabled | `visitor-rls-disabled-3175ee13` | ACTIVE | 2026-10-10 19:13:41 |
| 27 | `5d0e93b6-7ba8-403a-a159-0d63bbbcf8f1` | Maintenance PR3 A | `maintenance-pr3-a-77029d14` | ACTIVE | 2026-10-10 19:13:50 |
| 28 | `a32c6290-2fb8-4951-92f0-e4e38e4c4c19` | Gate Device A | `gate-device-a-fe88bfaa` | ACTIVE | 2026-10-10 19:14:16 |
| 29 | `063b6099-47ef-4a1b-99b9-7962c0a9c5ac` | Gate Device B | `gate-device-b-5860f970` | ACTIVE | 2026-10-10 19:14:17 |
| 30 | `7af6b466-e90b-4a0b-87e6-a81443f4df89` | Renewal Enabled | `renewal-enabled-bdd66dfd` | ACTIVE | 2026-10-10 19:15:32 |
| 31 | `a356f156-d58f-4132-97d2-e1b4091ad3f0` | Renewal Other | `renewal-other-3e1c95d5` | SUSPENDED | 2026-10-10 19:15:35 |
| 32 | `636e8d79-dcdc-4831-9b68-632a4f146a3f` | Renewal Conflict | `renewal-conflict-d094ae3d` | ACTIVE | 2026-10-10 19:15:38 |
| 33 | `6ddd1c3f-1149-4ffd-b400-6dba245fdfff` | Renewal Starter | `renewal-starter-1741ce84` | ACTIVE | 2026-10-10 19:15:41 |
| 34 | `c3b26f6f-01db-4949-9f33-b7bb13e8c6c6` | Unit Experience A | `unit-experience-a-c51e5b49` | ACTIVE | 2026-10-10 19:15:56 |
| 35 | `ec3eb617-2aec-425d-90af-4f466d0b3efb` | Maintenance PR3 A | `maintenance-pr3-a-3e3ecc9c` | ACTIVE | 2026-10-10 19:18:57 |
| 36 | `56553e77-b716-4874-95de-c2d5e736b0db` | Visitor RLS A | `visitor-rls-a-503cbc77` | ACTIVE | 2026-10-10 19:19:30 |
| 37 | `2c1c7302-5086-49ea-80c8-fbf0121ebb54` | Visitor RLS B | `visitor-rls-b-891b6679` | ACTIVE | 2026-10-10 19:19:31 |
| 38 | `f89aa7df-ac0d-4be6-944f-bd2aec53de14` | Visitor RLS Disabled | `visitor-rls-disabled-87faedf5` | ACTIVE | 2026-10-10 19:19:33 |
| 39 | `ce63c20a-c348-4aa0-bcd8-c4cc60b42b14` | Gate RLS A | `gate-rls-a-1407e0f7` | ACTIVE | 2026-10-10 19:19:39 |
| 40 | `87bc5852-9c5f-4cd4-b05a-61c73e2d6963` | Gate RLS B | `gate-rls-b-8a119405` | ACTIVE | 2026-10-10 19:19:40 |
| 41 | `5c93121f-0723-4277-90ea-619642a9ac34` | Gate RLS Disabled | `gate-rls-disabled-1cbfb26c` | ACTIVE | 2026-10-10 19:19:41 |
| 42 | `72360ee5-d9ac-47c5-88bb-ce5d7548751f` | Gate Device A | `gate-device-a-3d6a0660` | ACTIVE | 2026-10-10 19:19:57 |
| 43 | `85e147f1-a5ad-4c48-90f0-40a9ea9c30b8` | Gate Device B | `gate-device-b-ef60518d` | ACTIVE | 2026-10-10 19:19:59 |

### Set B (probable, ambiguous)

| id | created_at (UTC) |
|---|---|
| `cf6ae3b5-9d3a-4211-9e02-1daf7c0d8954` | 2026-10-10 10:38:04 |
| `253cfb17-c593-4da4-b28e-00bb2ae16876` | 2026-10-10 10:58:12 |
| `f4025dae-0520-4055-ac87-e762dcba4393` | 2026-10-10 13:34:26 |
| `05cd70c4-9aaf-41a2-beec-87bc3b44cd7a` | 2026-10-10 14:05:13 |
| `6fc198e3-855c-4eac-981c-81a5a97bd8a7` | 2026-10-10 16:52:26 |
| `61c24891-d349-4d10-a5f2-3a3f6beb3272` | 2026-10-10 18:13:10 |

## 3. Affected rows in set A (all tables with `organization_id`; zero-row tables omitted)

| table | rows |
|---|---|
| `visitor_invitations` | 1171 |
| `notifications` | 1123 |
| `roles` | 315 |
| `platform_audit_logs` | 235 |
| `access_events` | 200 |
| `maintenance_categories` | 190 |
| `visitor_access_state` | 124 |
| `gate_scan_devices` | 85 |
| `visitor_invitation_secrets` | 69 |
| `organization_memberships` | 64 |
| `user_role_assignments` | 63 |
| `units` | 59 |
| `unit_ownerships` | 54 |
| `gates` | 50 |
| `gate_notification_outbox` | 48 |
| `members` | 44 |
| `gate_device_enrollments` | 42 |
| `gate_devices` | 39 |
| `properties` | 39 |
| `subscriptions` | 28 |
| `gate_manual_exceptions` | 17 |
| `chart_of_accounts` | 15 |
| `gate_completion_policy` | 15 |
| `document_sequences` | 6 |
| `gate_access_reconciliations` | 4 |
| `gate_connectivity_incidents` | 1 |
| `gate_long_stay_policy` | 1 |
| **total** | **4101** |

## 4. Relations that matter for any later cleanup (nothing done now)

* **Foreign keys to `organizations` WITHOUT `ON DELETE CASCADE`** (a plain `delete from organizations` would be blocked while these rows exist): `gate_access_reconciliations` (4), `gate_completion_policy` (15), `gate_manual_exceptions` (17), `gate_notification_outbox` (48), `gate_scan_devices` (85), `platform_audit_logs` (235). The rest of the 117 tenant tables cascade. `platform_audit_logs` (235 rows) is append-only audit evidence; whether to keep or purge it is a policy decision, not a technical one.
* **Auth users:** 100 users were created in the window, all `@aqarbooks-test.local`; 64 of them are linked through `organization_memberships` to set-A organizations and **none of those is a member of any organization outside set A** (0); 44 have no membership at all (owners/viewers attached through `members`/ownership rows). Auth users are *not* removed by deleting an organization. The development database holds 352 test-domain users in total out of 1008 (the rest come from earlier ordinary test runs). Ids are in the JSON (`auth_users_created_in_window`).
* **Gate devices:** 39 `gate_devices` (+85 `gate_scan_devices`, 42 `gate_device_enrollments`) with credentials; they are test credentials of throw-away organizations, not usable against any other organization.
* **Access events:** 200 rows — ALLOW VALID_ENTRY ×127, DENY PASS_ALREADY_USED ×24, DENY INVALID_PASS ×9, ALLOW VALID_EXIT ×8, DENY REVOKED ×5, DENY EXPIRED ×5, DENY ALREADY_INSIDE ×5, DENY PROPERTY_MISMATCH ×4, RECONCILE RECONCILED_EXIT ×3, DENY NOT_YET_VALID ×3, DENY FEATURE_DISABLED ×3, DENY NOT_INSIDE ×3, RECONCILE RECONCILED_ENTRY ×1.
* **Notifications:** VISITOR_INVITATION_CREATED ×1068, VISITOR_ENTERED ×26, INVITATION_REVOKED ×10, VISITOR_SECURITY_ALERT ×9, VISITOR_EXITED ×8, VISITOR_MANUAL_EXCEPTION ×2 (total 1123).
* **Storage objects** under these organization ids: 0.
* Cross-organization references from set-A rows to other organizations were not separately enumerated beyond the membership check above.

## 5. What was NOT done

No `DELETE`, `UPDATE`, `TRUNCATE`, `DROP`, migration, or auth-admin call touched the development database. Decision on cleanup is left to you; if you want it, the safe order is: scripted per-organization removal inside one transaction in the order set by §4, auth users last, with `platform_audit_logs` handled by an explicit policy decision.
