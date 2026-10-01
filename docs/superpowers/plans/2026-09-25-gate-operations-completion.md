# Gate Operations Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete AqarBooks visitor QR and gate operations as a production-ready field workflow with trusted scanner devices, fail-closed PWA behavior, supervisor evidence, notifications, and a vendor-neutral hardware outbox.

**Architecture:** Preserve `process_visitor_gate_scan` as the server-authoritative decision core, then add a second factor of device-to-gate binding around it. Build supervision and hardware dispatch as immutable, idempotent side effects; neither may rewrite the original access decision. Ship in four sequential slices so every commit leaves a usable and testable system.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL with RLS and SECURITY DEFINER RPCs, Vitest, Playwright, Web APIs (BarcodeDetector, IndexedDB, Service Worker, Wake Lock, Vibration), Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-25-gate-operations-completion-design.md`

## Global Constraints

- Never store or log raw QR secrets, token hashes, raw device credentials, guest phones, or authentication details outside their purpose-built secret boundary.
- Offline operation never returns ALLOW and never fabricates an access event.
- Existing visitor invitations, gates, access state, and access events remain canonical.
- Every new public-schema table has RLS enabled and explicit grants; client mutations use narrow RPCs.
- SECURITY DEFINER functions use `set search_path = ''`, fully qualified names, internal authorization, and explicit revoke/grant statements.
- Existing `operations.gates.scan` user permission remains mandatory; device trust supplements it.
- Hardware dispatch stays disabled unless an organization, endpoint, and approved adapter are all enabled.
- No new production dependency unless existing browser and platform APIs cannot satisfy the requirement.
- Read the relevant Next.js 16 guide under `node_modules/next/dist/docs/` before editing route handlers, manifests, metadata, or caching behavior.
- Create every migration with the exact `supabase migration new` command named in its task; do not invent migration timestamps.

## Review Focus

- Two tabs or two devices redeem the same enrollment code: exactly one succeeds and the other receives a generic expired/used result (Task 1 runtime test).
- A guard changes gate/direction in the browser or replays an old device credential: the server rejects it before pass validation (Task 3 runtime test).
- The browser loses connectivity after decoding a valid QR: UI shows unverified/offline, emits no ALLOW feedback, and persists no raw payload (Task 5 unit/browser tests).
- Two concurrent scans and a hardware retry: one access transition, one notification, and one hardware command exist (Tasks 3, 8, and 9 concurrency tests).
- A supervisor reconciles stale occupancy while another scan arrives: row locking produces a valid ordered timeline without counter corruption (Task 6 runtime test).

---

## Slice A — Device trust and server contract

### Task 1: Device enrollment database contract

**Files:**
- Create via CLI: `supabase migration new gate_device_trust`
- Create: `tests/gate-device-trust-migration.test.ts`
- Create: `tests/gate-device-trust-rls.integration.test.ts`
- Modify: `lib/supabase/types.ts`
- Modify: `tests/migration-directory-guard.test.ts`
- Modify: `tests/security-function-grants.integration.test.ts`

**Interfaces:**
- Consumes: existing `gates`, `organization_is_active`, `gate_operations_enabled`, and `gate_staff_can_manage`.
- Produces: `create_gate_device_enrollment(p_gate_id, p_direction, p_code_hash, p_expires_at) -> uuid`, `redeem_gate_device_enrollment(p_enrollment_id, p_code, p_installation_id_hash, p_credential_hash, p_display_name) -> gate_devices row`, `revoke_gate_device(p_device_id, p_reason)`, and `verify_gate_device_binding(p_device_id, p_credential_hash, p_gate_id, p_direction) -> boolean`.

- [ ] **Step 1: Write migration guard tests**

```ts
expect(migration).toContain("create table public.gate_device_enrollments");
expect(migration).toContain("create table public.gate_devices");
expect(migration).toContain("enable row level security");
expect(migration).not.toMatch(/grant\s+.+gate_devices.+to\s+anon/i);
expect(migration).toContain("unique (organization_id, installation_id_hash)");
```

- [ ] **Step 2: Run the migration guard and confirm RED**

Run: `npx vitest run tests/gate-device-trust-migration.test.ts`
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the migration with the Supabase CLI**

Run: `supabase migration new gate_device_trust`

Implement two hashed-secret tables, 15-minute single-use enrollment, device lifecycle checks, indexes, audit rows, RLS, explicit grants, and the four RPCs above. Compare enrollment and credential hashes inside PostgreSQL with `cryptographic` equality on fixed-length SHA-256 hex strings; never return either stored hash.

- [ ] **Step 4: Add concurrent redemption and authorization runtime tests**

```ts
const [first, second] = await Promise.all([
  guardA.rpc("redeem_gate_device_enrollment", paramsA),
  guardB.rpc("redeem_gate_device_enrollment", paramsB),
]);
expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
expect([first.data, second.data].filter(Boolean)).toHaveLength(1);
```

Also prove tenant isolation, expiry, replay denial, direction binding, revocation, manager-only enrollment, and no table writes by authenticated clients.

- [ ] **Step 5: Reset and verify the database**

Run: `supabase db reset --local --yes`
Run: `npx vitest run tests/gate-device-trust-migration.test.ts tests/gate-device-trust-rls.integration.test.ts tests/security-function-grants.integration.test.ts tests/migration-directory-guard.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations lib/supabase/types.ts tests/gate-device-trust-*.ts tests/migration-directory-guard.test.ts tests/security-function-grants.integration.test.ts
git commit -m "feat(gates): add trusted scanner devices"
```

### Task 2: Enrollment and device-management surfaces

**Files:**
- Create: `lib/gates/device-credentials.ts`
- Create: `lib/actions/gate-devices.ts`
- Create: `app/[locale]/(app)/operations/gates/device-enrollment-dialog.tsx`
- Create: `app/[locale]/(app)/operations/gates/gate-devices-panel.tsx`
- Modify: `app/[locale]/(app)/operations/gates/page.tsx`
- Modify: `app/[locale]/(app)/operations/gates/gates-client.tsx`
- Create: `tests/gate-device-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: `generateDeviceSecret(): { raw: string; sha256: string; hint: string }`, `createGateDeviceEnrollmentAction`, `redeemGateDeviceEnrollmentAction`, and `revokeGateDeviceAction`.

- [ ] **Step 1: Write secret-boundary and action tests**

```ts
const secret = generateDeviceSecret();
expect(secret.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
expect(secret.sha256).toMatch(/^[a-f0-9]{64}$/);
expect(JSON.stringify(mockRpc.mock.calls)).not.toContain(secret.raw);
```

Test invalid gate ids, direction, 15-minute expiry, generic RPC error mapping, and cache revalidation.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-device-actions.test.ts`
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement server actions and UI**

Use Web Crypto/Node crypto for 32 random bytes and SHA-256. Show the enrollment code exactly once. The devices panel displays safe metadata, last seen, binding, status, and revoke action; it never receives hashes.

- [ ] **Step 4: Run tests and lint**

Run: `npx vitest run tests/gate-device-actions.test.ts`
Run: `npx eslint lib/gates/device-credentials.ts lib/actions/gate-devices.ts "app/[locale]/(app)/operations/gates/*.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gates lib/actions/gate-devices.ts "app/[locale]/(app)/operations/gates" tests/gate-device-actions.test.ts
git commit -m "feat(gates): enroll and revoke scanner devices"
```

### Task 3: Bind scan decisions to trusted devices

**Files:**
- Create via CLI: `supabase migration new gate_scan_device_binding`
- Modify: `lib/actions/gates.ts`
- Create: `lib/gates/scanner-contract.ts`
- Modify: `app/[locale]/(app)/operations/gate/page.tsx`
- Modify: `app/[locale]/(app)/operations/gate/gate-scanner-client.tsx`
- Create: `tests/gate-scanner-contract.test.ts`
- Modify: `tests/gate-operations-rls.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 `verify_gate_device_binding`.
- Produces: extended `process_visitor_gate_scan(p_device_id uuid, p_device_credential text, ...)` and `parseGateScanRequest(input): GateScanRequest`.

- [ ] **Step 1: Write failing contract tests**

```ts
expect(parseGateScanRequest({
  deviceId, deviceCredential, gateId, direction: "ENTRY", qrPayload, clientScanId,
})).toEqual(expect.objectContaining({ deviceId, gateId, direction: "ENTRY" }));
```

Add runtime cases for wrong gate, wrong direction, revoked device, wrong credential, and cross-tenant device id. Confirm no access event or state transition is created.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-scanner-contract.test.ts tests/gate-operations-rls.integration.test.ts --maxWorkers=1`
Expected: FAIL because device parameters are not required.

- [ ] **Step 3: Extend the RPC atomically**

Validate signed-in user permission and device binding before reading the invitation secret. Update `last_seen_at` only after successful device authentication. Preserve `client_scan_id` replay behavior and existing row locks.

- [ ] **Step 4: Update action and scanner props**

Remove arbitrary gate selection after enrollment. The page resolves the stored device id, and the server remains authoritative about its bound gate and direction.

- [ ] **Step 5: Verify legacy and new gates**

Run: `supabase db reset --local --yes`
Run: `npx vitest run tests/gate-scanner-contract.test.ts tests/gate-operations-migration.test.ts tests/gate-operations-rls.integration.test.ts --maxWorkers=1`
Expected: PASS, including concurrent single-use scans.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations lib/actions/gates.ts lib/gates/scanner-contract.ts "app/[locale]/(app)/operations/gate" tests/gate-scanner-contract.test.ts tests/gate-operations-rls.integration.test.ts
git commit -m "feat(gates): bind scans to enrolled devices"
```

---

## Slice B — Installable fail-closed scanner

### Task 4: PWA shell and safe local storage

**Files:**
- Create: `public/gate-scanner-sw.js`
- Create: `app/gate-scanner.webmanifest/route.ts`
- Create: `lib/gates/device-store.ts`
- Create: `lib/gates/service-worker.ts`
- Modify: `app/[locale]/(app)/operations/gate/page.tsx`
- Create: `tests/gate-device-store.test.ts`
- Create: `tests/gate-service-worker.test.ts`

**Interfaces:**
- Consumes: Task 2 redeemed raw device credential.
- Produces: `readGateDevice()`, `saveGateDevice()`, `clearGateDevice()`, `registerGateScannerServiceWorker()`, and a network-only policy for auth/API responses.

- [ ] **Step 1: Read Next.js manifest and route-handler docs**

Read: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

- [ ] **Step 2: Write failing cache and storage tests**

```ts
expect(scannerWorkerSource).toContain("CACHE_VERSION");
expect(scannerWorkerSource).not.toMatch(/\/rest\/v1|\/auth\/v1|\/api\//);
await saveGateDevice(device);
expect(await readGateDevice()).toEqual(device);
await clearGateDevice();
expect(await readGateDevice()).toBeNull();
```

- [ ] **Step 3: Implement minimal PWA**

Cache only scanner HTML shell, icons, CSS, and JS chunks using stale-while-revalidate. Use network-only for navigation while authenticated and for every non-GET or `/api/`, `/auth/`, `/rest/`, `/rpc/` request. Version and purge caches on activation.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/gate-device-store.test.ts tests/gate-service-worker.test.ts`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/gate-scanner-sw.js app/gate-scanner.webmanifest lib/gates/device-store.ts lib/gates/service-worker.ts "app/[locale]/(app)/operations/gate/page.tsx" tests/gate-device-store.test.ts tests/gate-service-worker.test.ts
git commit -m "feat(gates): make scanner installable and fail closed"
```

### Task 5: Scanner state machine, feedback, and offline incidents

**Files:**
- Create: `lib/gates/scanner-machine.ts`
- Create: `lib/gates/scanner-feedback.ts`
- Create: `app/[locale]/(app)/operations/gate/use-gate-scanner.ts`
- Modify: `app/[locale]/(app)/operations/gate/gate-scanner-client.tsx`
- Create via CLI: `supabase migration new gate_connectivity_incidents`
- Create: `lib/actions/gate-connectivity.ts`
- Create: `tests/gate-scanner-machine.test.ts`
- Create: `tests/gate-connectivity-rls.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 scan action and Task 4 device store.
- Produces: `reduceScannerState`, `feedbackForDecision`, `fingerprintQrPayload`, and `recordGateConnectivityIncidentAction`.

- [ ] **Step 1: Write state-machine tests**

```ts
expect(reduceScannerState(ready, { type: "DECODED", fingerprint: "abc" }).status).toBe("SUBMITTING");
expect(reduceScannerState(submitting, { type: "DECODED", fingerprint: "abc" })).toBe(submitting);
expect(feedbackForDecision("UNVERIFIED_OFFLINE").tone).toBe("AMBER");
expect(feedbackForDecision("UNVERIFIED_OFFLINE").allowSignal).toBe(false);
```

Cover cooldown expiry, different QR during cooldown, abort, timeout, duplicate response, reduced motion, muted audio, and offline transition.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-scanner-machine.test.ts`
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement the state machine and hook**

Keep exactly one request in flight. Fingerprint locally with SHA-256 and discard the raw payload immediately after request completion. Use Web Audio, `navigator.vibrate`, and Wake Lock behind capability checks. Never map network errors to an ALLOW state.

- [ ] **Step 4: Add connectivity incident persistence**

Store only tenant/gate/device/direction/client-scan-id/timestamp/payload fingerprint/error code. RPC authorization requires the bound device and scan permission. No invitation lookup occurs during incident recording.

- [ ] **Step 5: Verify unit, runtime, and browser behavior**

Run: `npx vitest run tests/gate-scanner-machine.test.ts tests/gate-connectivity-rls.integration.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/gates lib/actions/gate-connectivity.ts "app/[locale]/(app)/operations/gate" supabase/migrations tests/gate-scanner-machine.test.ts tests/gate-connectivity-rls.integration.test.ts
git commit -m "feat(gates): harden field scanning and offline evidence"
```

---

## Slice C — Supervision, evidence, and owner notifications

### Task 6: Manual exceptions and occupancy reconciliation

**Files:**
- Create via CLI: `supabase migration new gate_supervision_evidence`
- Create: `lib/actions/gate-supervision.ts`
- Create: `tests/gate-supervision-migration.test.ts`
- Create: `tests/gate-supervision-rls.integration.test.ts`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Consumes: gates, invitations, access state, access events, device identity.
- Produces: `create_gate_manual_exception`, `approve_gate_manual_exception`, and `reconcile_visitor_access_state`.

- [ ] **Step 1: Write failing schema and runtime tests**

```ts
expect(migration).toContain("create table public.gate_manual_exceptions");
expect(migration).toContain("create table public.gate_access_reconciliations");
expect(migration).toContain("reason text not null");
```

Test separate create/approve permissions, mandatory reason/category, append-only records, tenant isolation, and a reconciliation racing a scan.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-supervision-migration.test.ts tests/gate-supervision-rls.integration.test.ts --maxWorkers=1`
Expected: FAIL because tables/RPCs are absent.

- [ ] **Step 3: Implement immutable evidence and locked reconciliation**

`reconcile_visitor_access_state` must lock the state and invitation, append a reconciliation row and a reason-coded access timeline row, then update counts so `exit_count <= entry_count` and `is_inside` consistency remain true.

- [ ] **Step 4: Implement actions and verify**

Run: `supabase db reset --local --yes`
Run: `npx vitest run tests/gate-supervision-migration.test.ts tests/gate-supervision-rls.integration.test.ts tests/security-function-grants.integration.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations lib/actions/gate-supervision.ts lib/supabase/types.ts tests/gate-supervision-*.ts tests/security-function-grants.integration.test.ts
git commit -m "feat(gates): add supervised exceptions and reconciliation"
```

### Task 7: Live occupancy, evidence search, and safe CSV export

**Files:**
- Create: `app/[locale]/(app)/operations/gate/occupancy/page.tsx`
- Create: `app/[locale]/(app)/operations/gate/occupancy/occupancy-client.tsx`
- Create: `app/[locale]/(app)/operations/gate/occupancy/supervision-dialogs.tsx`
- Modify: `app/[locale]/(app)/operations/access-events/page.tsx`
- Create: `app/[locale]/(app)/operations/access-events/access-event-filters.tsx`
- Create: `lib/actions/gate-evidence.ts`
- Create: `lib/gates/evidence-csv.ts`
- Create: `tests/gate-evidence.test.ts`

**Interfaces:**
- Consumes: Task 6 actions and existing RLS-selectable evidence.
- Produces: `listCurrentVisitors`, `listAccessEvidence`, and `exportAccessEvidenceCsvAction` with bounded filters and pagination.

- [ ] **Step 1: Write query-boundary and CSV tests**

```ts
expect(parseEvidenceFilters({ page: "1", pageSize: "100" }).pageSize).toBe(100);
expect(() => parseEvidenceFilters({ pageSize: "101" })).toThrow();
expect(csv).not.toMatch(/token|secret|phone|credential/i);
expect(csv).toContain("decision,reason_code,direction");
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-evidence.test.ts`
Expected: FAIL on missing exports.

- [ ] **Step 3: Implement server-side pagination and UI**

Limit page size to 100 and export range to 31 days/25,000 rows. Escape spreadsheet formulas by prefixing cells beginning with `=`, `+`, `-`, or `@`. Render long-stay and expired-while-inside warnings.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/gate-evidence.test.ts`
Run: `npx eslint "app/[locale]/(app)/operations/gate/occupancy/*.tsx" "app/[locale]/(app)/operations/access-events/*.tsx" lib/actions/gate-evidence.ts lib/gates/evidence-csv.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(app)/operations/gate/occupancy" "app/[locale]/(app)/operations/access-events" lib/actions/gate-evidence.ts lib/gates/evidence-csv.ts tests/gate-evidence.test.ts
git commit -m "feat(gates): add live occupancy and evidence tools"
```

### Task 8: Idempotent owner and security notifications

**Files:**
- Create via CLI: `supabase migration new gate_notifications`
- Create: `tests/gate-notifications.integration.test.ts`
- Modify: `app/[locale]/portal/(member)/notifications/portal-notifications-client.tsx`

**Interfaces:**
- Consumes: `create_notification_once`, access event ids, invitation owner, manual exceptions.
- Produces: notification types `VISITOR_ENTERED`, `VISITOR_SECURITY_ALERT`, and `VISITOR_MANUAL_EXCEPTION`.

- [ ] **Step 1: Write failing notification tests**

```ts
expect(await countNotifications(eventId, "VISITOR_ENTERED")).toBe(1);
expect(serializedNotification).not.toContain(rawQr);
expect(serializedNotification).not.toContain(guestPhone);
```

Test duplicate scan replay, notification failure independence, repeated denial deduplication, and manual exception alert.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-notifications.integration.test.ts --maxWorkers=1`
Expected: FAIL because gate notification producers do not exist.

- [ ] **Step 3: Add idempotent notification producers**

Use stable keys ``gate-entry:${eventId}``, ``gate-alert:${eventId}``, and ``gate-exception:${exceptionId}``. Include only guest display name, property/unit label, gate, safe reason code, timestamp, and action URL.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/gate-notifications.integration.test.ts tests/gate-operations-rls.integration.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/gate-notifications.integration.test.ts "app/[locale]/portal/(member)/notifications/portal-notifications-client.tsx"
git commit -m "feat(gates): notify owners of visitor access"
```

---

## Slice D — Hardware boundary, observability, and release

### Task 9: Durable hardware outbox and NOOP adapter

**Files:**
- Create via CLI: `supabase migration new gate_hardware_outbox`
- Create: `lib/gates/hardware/types.ts`
- Create: `lib/gates/hardware/noop-adapter.ts`
- Create: `lib/gates/hardware/registry.ts`
- Create: `lib/gates/hardware/process-command.ts`
- Create: `app/api/cron/gate-hardware/route.ts`
- Create: `.github/workflows/gate-hardware.yml`
- Create: `tests/gate-hardware-outbox-migration.test.ts`
- Create: `tests/gate-hardware-processor.test.ts`
- Create: `tests/gate-hardware-cron.test.ts`

**Interfaces:**
- Consumes: original ALLOW access-event id.
- Produces: `GateHardwareAdapter.dispatchOpen(command)`, `enqueue_gate_hardware_command`, `claim_gate_hardware_commands`, and `complete_gate_hardware_command`.

- [ ] **Step 1: Write outbox and adapter tests**

```ts
expect(await noop.dispatchOpen(command)).toEqual({ status: "NOT_CONFIGURED" });
expect(migration).toContain("unique (access_event_id, command_type)");
expect(migration).toMatch(/revoke all.+gate_hardware_endpoints.+authenticated/is);
```

Test service-role-only tables/RPCs, original-event idempotency, bounded exponential retry, stale claim recovery, dead-letter transition, disabled organization, manual exception exclusion, and payload redaction.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/gate-hardware-outbox-migration.test.ts tests/gate-hardware-processor.test.ts tests/gate-hardware-cron.test.ts`
Expected: FAIL on absent migration/modules.

- [ ] **Step 3: Implement outbox and NOOP registry**

Use statuses `PENDING`, `DISPATCHING`, `ACKNOWLEDGED`, `FAILED`, `DEAD`; cap at 10 attempts; recover `DISPATCHING` older than 10 minutes. The registry exposes only `NOOP` until a reviewed vendor adapter is added.

- [ ] **Step 4: Implement authenticated cron route**

Require `CRON_SECRET` with timing-safe comparison, cap batches at 50, return counts only, and schedule every minute. Reuse the established payment-events cron security pattern.

- [ ] **Step 5: Verify**

Run: `supabase db reset --local --yes`
Run: `npx vitest run tests/gate-hardware-outbox-migration.test.ts tests/gate-hardware-processor.test.ts tests/gate-hardware-cron.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations lib/gates/hardware app/api/cron/gate-hardware/route.ts .github/workflows/gate-hardware.yml tests/gate-hardware-*.test.ts
git commit -m "feat(gates): add durable hardware command boundary"
```

### Task 10: Operational metrics and runbook

**Files:**
- Create: `lib/gates/operations-summary.ts`
- Create: `app/[locale]/(app)/operations/gates/operations-summary.tsx`
- Modify: `app/[locale]/(app)/operations/gates/page.tsx`
- Create: `docs/runbooks/gate-operations-pilot.md`
- Create: `tests/gate-operations-summary.test.ts`

**Interfaces:**
- Consumes: safe aggregates from devices, incidents, exceptions, access state, and hardware commands.
- Produces: `getGateOperationsSummary(organizationId, propertyId?)` with counts/ages only.

- [ ] **Step 1: Write aggregate-boundary tests**

```ts
expect(summary).toEqual(expect.objectContaining({
  devicesOffline: expect.any(Number),
  visitorsInside: expect.any(Number),
  unresolvedExceptions: expect.any(Number),
  deadHardwareCommands: expect.any(Number),
}));
expect(JSON.stringify(summary)).not.toMatch(/guest|phone|secret|token/i);
```

- [ ] **Step 2: Implement bounded aggregate queries and UI**

Use count/head queries and oldest timestamps; never fetch event payload collections to calculate cards. Add status badges for device health, long stays, unresolved exceptions, and hardware backlog.

- [ ] **Step 3: Write the pilot runbook**

Document enrollment, camera permissions, online/offline probes, allow/deny/duplicate/exit cases, manual exception approval, reconciliation, device revocation, NOOP hardware evidence, alert thresholds, rollback, and evidence retention.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/gate-operations-summary.test.ts`
Run: `npx eslint lib/gates/operations-summary.ts "app/[locale]/(app)/operations/gates/*.tsx"`
Expected: PASS.

```bash
git add lib/gates/operations-summary.ts "app/[locale]/(app)/operations/gates" docs/runbooks/gate-operations-pilot.md tests/gate-operations-summary.test.ts
git commit -m "feat(gates): add operational readiness evidence"
```

### Task 11: Browser, accessibility, and end-to-end concurrency gates

**Files:**
- Create: `tests/e2e/gate-device-enrollment.spec.ts`
- Create: `tests/e2e/gate-scanner-field.spec.ts`
- Create: `tests/e2e/gate-supervision.spec.ts`
- Create: `tests/gate-completion-concurrency.integration.test.ts`

**Interfaces:**
- Consumes: all previous slices.
- Produces: release evidence only.

- [ ] **Step 1: Add enrollment and scanner browser scenarios**

Cover manager enrollment, one-time redemption, persisted binding, forbidden gate switch, camera/manual fallback, allow/deny announcements, vibration/audio capability fallback, cooldown, and device revocation.

- [ ] **Step 2: Add offline and supervision scenarios**

Use Playwright offline context after page load. Assert no ALLOW text/style/sound path, no access event, one safe connectivity incident after reconnection, supervisor manual exception, occupancy reconciliation, filters, CSV formula escaping, and Arabic RTL.

- [ ] **Step 3: Add concurrency integration scenario**

```ts
const results = await Promise.all([
  scannerA.rpc("process_visitor_gate_scan", scan),
  scannerB.rpc("process_visitor_gate_scan", scan),
]);
expect(new Set(results.map((r) => r.data?.[0]?.event_id)).size).toBe(1);
expect(await countHardwareCommands(eventId)).toBe(1);
expect(await countOwnerNotifications(eventId)).toBe(1);
```

- [ ] **Step 4: Run release browser gates**

Run: `npx playwright test tests/e2e/gate-device-enrollment.spec.ts tests/e2e/gate-scanner-field.spec.ts tests/e2e/gate-supervision.spec.ts`
Run: `npx vitest run tests/gate-completion-concurrency.integration.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/gate-*.spec.ts tests/gate-completion-concurrency.integration.test.ts
git commit -m "test(gates): prove field operations end to end"
```

### Task 12: Final verification, review, and controlled delivery

**Files:**
- No product files expected; any verified failure is fixed in its owning file and re-run through that task's focused gate before the final suite is repeated.

**Interfaces:**
- Consumes: completed branch.
- Produces: merge-ready PR and pilot evidence; does not enable a real hardware adapter.

- [ ] **Step 1: Run complete database gates**

Run: `supabase db reset --local --yes`
Run: `npx vitest run tests/visitor-passes-migration.test.ts tests/visitor-passes-rls.integration.test.ts tests/gate-operations-migration.test.ts tests/gate-operations-rls.integration.test.ts tests/gate-device-trust-migration.test.ts tests/gate-device-trust-rls.integration.test.ts tests/gate-connectivity-rls.integration.test.ts tests/gate-supervision-migration.test.ts tests/gate-supervision-rls.integration.test.ts tests/gate-notifications.integration.test.ts tests/gate-completion-concurrency.integration.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 2: Run application gates**

Run: `npx vitest run tests/gate-*.test.ts tests/gate-*.integration.test.ts --maxWorkers=1`
Run: `npx playwright test tests/e2e/gate-device-enrollment.spec.ts tests/e2e/gate-scanner-field.spec.ts tests/e2e/gate-supervision.spec.ts`
Run: `npx tsc --noEmit`
Run: `npx eslint app lib tests --max-warnings=0`
Run: `npm run build:next`
Run: `git diff --check origin/master...HEAD`
Expected: PASS. The only acceptable build warning is the repository's pre-existing Next.js middleware/proxy deprecation warning.

- [ ] **Step 3: Run security review**

Run: `supabase db advisors --local --type security --level error --fail-on error`
Review the full diff for secret exposure, missing RLS/grants, authorization fallbacks, unbounded queries, offline allow paths, and hardware claims without acknowledgement.

- [ ] **Step 4: Push and open a draft PR**

```bash
git push -u origin codex/gates-completion
gh pr create --draft --base master --head codex/gates-completion --title "feat(gates): complete visitor access operations" --body "Completes trusted gate devices, fail-closed field scanning, supervisor evidence, owner notifications, and a disabled-by-default NOOP hardware outbox. Verification commands and rollout evidence are recorded in the PR checks and gate-operations pilot runbook."
```

- [ ] **Step 5: Merge only after green remote checks**

Mark Ready after review findings are resolved. Merge using the repository's established merge-commit strategy. Watch the Cloudflare deployment through its production smoke check.

- [ ] **Step 6: Apply migrations and verify alignment**

Run `supabase db push --linked --dry-run --skip-vault` from the linked main checkout first. Confirm only this plan's migrations are pending, then run `supabase db push --linked --skip-vault --yes`. Re-run `supabase migration list --linked` and remote security advisors.

- [ ] **Step 7: Execute controlled NOOP pilot**

Enroll one test device and run every scenario in `docs/runbooks/gate-operations-pilot.md`. Keep automatic hardware dispatch disabled or bound to `NOOP`. Record evidence and rollback the completion feature flag if any invariant fails.
