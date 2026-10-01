# Gate Operations Completion Design

**Status:** Written design awaiting user review
**Date:** 2026-09-25
**Scope:** Complete the existing visitor QR and gate-operations feature for safe field operation. Physical barrier vendors remain pluggable; automatic opening is disabled until a vendor adapter is configured and approved.

## 1. Outcome and completion criteria

AqarBooks already issues opaque, hashed visitor QR passes and records server-authoritative entry/exit decisions. This phase completes the operational product around that core.

The feature is complete when:

1. An authorized guard can install or open the scanner on a phone or tablet, bind that browser installation to one gate and an allowed direction, and resume that assignment safely.
2. A scan produces one idempotent, server-authoritative decision with clear visual, audio, and haptic feedback and cannot loop repeatedly while the same QR remains in frame.
3. Loss of connectivity never becomes an offline allow. The operator receives an explicit `UNVERIFIED_OFFLINE` outcome and can record a supervised manual exception without altering or fabricating a QR validation result.
4. Supervisors can see who is currently inside, search and export access evidence, resolve occupancy discrepancies, and review manual exceptions.
5. Owners receive an in-product notification for allowed visitor entry and security-relevant denials without leaking the QR secret or excessive visitor data.
6. Every device assignment, scan, decision, exception, discrepancy correction, and hardware dispatch is tenant-scoped and auditable.
7. A vendor-neutral hardware outbox can dispatch an allow decision to a configured adapter. With no adapter configured, scanning remains fully usable and never implies that a barrier opened.
8. Database, RLS, concurrency, unit, browser, build, and production smoke gates pass.

## 2. Non-goals

- No facial recognition, ANPR, biometric processing, or visitor identity verification.
- No client-side decision authority and no offline cryptographic allowlist.
- No direct integration with an unspecified physical controller protocol.
- No deletion or rewriting of access evidence.
- No general workforce attendance system.
- No WhatsApp/SMS delivery in this phase; existing in-product notifications are the supported channel.

## 3. Existing foundation retained

The following remain canonical and are extended rather than replaced:

- `visitor_invitations` and `visitor_invitation_secrets` for pass lifecycle and hashed bearer secrets.
- `gates` for property-scoped gate configuration.
- `visitor_access_state` for current inside/outside state.
- `access_events` for immutable decisions and `client_scan_id` idempotency.
- `process_visitor_gate_scan` for server-authoritative validation and state transition.
- Existing permission families under `operations.visitors.*`, `operations.gates.*`, and `operations.access_events.*`.

Raw QR secrets remain transient. They may be presented to the validation RPC but must never enter event, device, exception, notification, analytics, or hardware tables or logs.

## 4. Operational model

### 4.1 Device enrollment and gate binding

Add `gate_devices` with:

- tenant, property, and gate identifiers;
- opaque installation identifier hash (the raw browser installation secret is shown once);
- display name and optional device notes;
- allowed direction: `ENTRY`, `EXIT`, or `BOTH`;
- status: `ACTIVE`, `SUSPENDED`, or `REVOKED`;
- enrolled and last-seen timestamps;
- enrolled-by, revoked-by, and revocation reason.

A supervisor with `operations.gates.manage` creates an enrollment code. The guard opens the scanner on the target device and redeems it once. The browser stores the resulting opaque device credential in IndexedDB. The server stores only its hash.

Every scan sends the installation id and selected direction. The server verifies that the active device is bound to the requested gate and direction before validating the pass. A guard cannot switch to another gate unless a supervisor rebinds the device.

Enrollment codes are single-use, expire after 15 minutes, and are stored hashed. Device credentials are revocable and rotate on re-enrollment.

### 4.2 Scanner experience

The scanner becomes an installable PWA surface with:

- camera permission preparation and a compatibility fallback;
- a large gate identity banner and direction indicator;
- a single active decode at a time;
- a cooldown keyed by QR payload hash, preventing repeated requests while the code stays in frame;
- green/short-high feedback for allow, red/long-low feedback for deny, and amber feedback for unavailable verification;
- audio, vibration, and reduced-motion/accessibility toggles;
- wake lock where supported;
- clear Arabic and English reason text;
- recent decisions loaded from the server, never reconstructed from local data.

Manual raw-payload entry remains available only behind an explicit fallback control and uses the same RPC and device authorization as camera scans.

### 4.3 Connectivity loss and manual exceptions

The service worker caches only the scanner shell, static assets, translations, and non-sensitive gate display metadata. It must not cache pass secrets, access-event responses, member data, guest phones, or authorization responses.

When the server cannot be reached:

- the UI displays `UNVERIFIED_OFFLINE` and does not show ALLOW;
- no access-event row is fabricated because no validation decision occurred;
- the failed attempt may be kept in an encrypted-at-rest browser queue only as a request envelope containing client scan id, device id, gate id, direction, timestamp, and a one-way payload fingerprint—never the raw QR secret;
- once online, the queue records an operational connectivity incident, not a retroactive access decision.

If a supervisor chooses to admit or reject the visitor manually, they create a `gate_manual_exceptions` record with gate, direction, outcome, category, reason, operator, supervisor, and timestamp. A manual exception is separate from `access_events`; it never changes a QR event from DENY to ALLOW. If the visitor identity is known, the invitation id may be attached after a fresh server lookup.

### 4.4 Live occupancy and reconciliation

Add a supervisor page showing:

- active visitors currently inside, grouped by property and gate;
- elapsed time inside and pass expiry;
- missing-exit and long-stay indicators;
- current invitation, unit, guest, entry gate, and entry timestamp;
- filters and CSV export;
- a discrepancy workflow.

`visitor_access_state` remains derived from valid access transitions. A supervisor correction does not update it directly. Instead, a `reconcile_visitor_access_state` RPC locks the state row, writes an immutable reconciliation event with a required reason, and moves the counters/state through a valid transition. Corrections are visible in the access timeline and audit log.

### 4.5 Notifications

On a first allowed entry for a visit cycle, create an idempotent notification for the inviting owner containing guest display name, property/unit label, gate, and timestamp. Do not include phone numbers or QR material.

Security notifications are created for:

- a revoked or expired pass presented repeatedly;
- property mismatch;
- a manual allow exception;
- a long-stay threshold configured per organization.

Notification deduplication uses stable event ids. Failed notification creation must not roll back an otherwise valid gate decision; it is retried through the existing notification mechanism or a bounded outbox.

### 4.6 Search, export, and evidence

The access-events page gains server-side filters for property, gate, decision, reason, direction, invitation number, guest name, operator, and date range. Pagination is mandatory. CSV export runs server-side under `operations.access_events.view` and includes safe display fields only.

Raw QR values, token hashes, device credential hashes, guest phone numbers, and internal authentication details never appear in export data.

## 5. Hardware integration boundary

Add `gate_hardware_endpoints` and `gate_hardware_commands` as a service-role-only integration boundary.

An allowed access event may enqueue one `OPEN` command only when:

- the gate has an active endpoint;
- the organization explicitly enables automatic dispatch;
- the endpoint adapter is approved;
- the access event is an original `ALLOW`, not a retry response or manual exception unless policy explicitly permits manual dispatch.

The command uses the access-event id as its idempotency key. Statuses are `PENDING`, `DISPATCHING`, `ACKNOWLEDGED`, `FAILED`, and `DEAD`. Payloads contain only the minimum gate command and vendor reference; no QR or guest data.

Adapters implement a server-only interface:

```ts
interface GateHardwareAdapter {
  dispatchOpen(command: GateOpenCommand): Promise<GateDispatchResult>;
}
```

Ship a `NOOP` adapter and the outbox processor in this phase. It proves boundaries and observability without claiming a physical barrier opened. A real vendor adapter is a separate, configuration-gated addition once the controller make, protocol, network topology, and acknowledgement contract are known.

## 6. Data and authorization

New tables:

- `gate_device_enrollments` — short-lived, hashed one-time enrollment codes;
- `gate_devices` — installed scanner identities and gate bindings;
- `gate_connectivity_incidents` — non-decision evidence for failed online validation;
- `gate_manual_exceptions` — supervised manual outcomes;
- `gate_access_reconciliations` — immutable state corrections;
- `gate_hardware_endpoints` — encrypted/config-reference metadata, service role only;
- `gate_hardware_commands` — durable, idempotent hardware outbox.

All public-schema tables have RLS enabled. Client writes occur only through narrow RPCs. `SECURITY DEFINER` functions use an empty `search_path`, fully qualified names, explicit validation, and explicit revoke/grant statements. Device credentials authorize only scanner RPCs; they do not create a Supabase user session or inherit staff permissions.

New permissions:

- `operations.gates.devices.manage`
- `operations.gates.exceptions.create`
- `operations.gates.exceptions.approve`
- `operations.gates.occupancy.reconcile`
- `operations.gates.hardware.manage`

Existing `operations.gates.scan` remains required for the signed-in guard. Device binding supplements user authorization; it never replaces it.

## 7. Server flow

For an online scan:

1. Client parses the QR envelope only enough to reject malformed input.
2. Server validates the user session, scan permission, device credential, device-to-gate binding, direction, organization status, and entitlement.
3. The existing pass validation and state transition run under row locks.
4. The access event is inserted once by organization and `client_scan_id`.
5. Notification and optional hardware commands are enqueued idempotently in the same transaction where practical. Dispatch failures never change the access decision.
6. The response returns safe display data and a hardware status of `NOT_CONFIGURED`, `QUEUED`, or `NOT_ELIGIBLE`; it never claims the barrier opened until an adapter acknowledgement exists.

## 8. Failure behavior

- Invalid device credential: fail closed, generic scanner error, security audit entry.
- Suspended/revoked device: fail closed and require re-enrollment.
- Duplicate client scan id: return the original immutable decision.
- Same QR continuously visible: client cooldown plus server idempotency.
- Database conflict: serialize on invitation/access-state rows and return the committed decision.
- Notification failure: retain decision, retry notification.
- Hardware failure: retain decision, retry command with bounded exponential backoff, then `DEAD`; visibly show “access approved—barrier not confirmed.”
- Offline: no decision and no automatic allow.
- Stale inside state: flag for reconciliation; never silently flip it.

## 9. PWA and privacy

The manifest provides scanner-specific name, icons, theme, display mode, and start URL. The service worker version is build-scoped and clears obsolete caches. Authentication pages and API/RPC responses use network-only behavior.

IndexedDB may store only device credential material, local preferences, and non-sensitive connectivity envelopes. Sign-out, device revocation, or organization change clears device-local operational state. Browser logs and telemetry use stable codes, not payloads or personal data.

## 10. Observability

Structured operational metrics:

- scan decisions by gate/reason/direction;
- validation latency percentiles;
- device last-seen and scanner version;
- offline/unavailable attempts;
- manual exception count and approval lag;
- current inside count and long-stay count;
- hardware command queue age, retries, and dead-letter count.

Alerting thresholds are documented in a runbook. Metrics use tenant-safe dimensions and never include QR, token hash, phone, or free-text exception reasons.

## 11. Verification gates

### Database and security

- Fresh local database reset.
- Migration guards and generated types updated.
- Runtime RLS tests for cross-tenant isolation, device binding, enrollment expiry/replay, permission separation, exceptions, reconciliations, and service-only hardware data.
- Concurrent scans prove one state transition and one hardware command.
- Security grant inventory remains exact.
- Supabase security advisor has no new errors.

### Application

- Unit tests for scanner cooldown, offline state, feedback mapping, device storage clearing, notification payload redaction, adapter registry, and bounded retry.
- Browser tests for enrollment, gate-locked scanner, allow/deny feedback, camera fallback, offline failure, supervisor exception, occupancy reconciliation, filters/export, and RTL/LTR.
- Accessibility check for keyboard operation, announcements, contrast, motion, and touch targets.
- TypeScript, ESLint, production build, and `git diff --check` pass.

### Pilot

- One test organization and one gate device.
- Entry, duplicate scan, exit, revoked pass, offline attempt, manual exception, and reconciliation evidence retained.
- Hardware remains `NOOP` unless a separate vendor-specific approval is recorded.

## 12. Rollout and rollback

Rollout is feature-flagged per organization. Schema ships first, then supervisor pages, then device enrollment, then scanner PWA, then notifications and reporting, then the `NOOP` hardware outbox. Existing scanner behavior remains available during migration until a device is enrolled.

Rollback disables the completion flag and hardware dispatch while preserving all evidence. Device credentials may be revoked globally. Access events, exceptions, reconciliations, and commands are never deleted as rollback behavior.
