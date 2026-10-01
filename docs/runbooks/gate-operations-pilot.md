# Gate operations pilot runbook

## Purpose and go-live gates

This runbook covers a supervised pilot of scanner enrollment, online gate decisions, immutable exception/reconciliation evidence, owner notifications, and the best-effort hardware outbox. The operational dashboard exposes tenant-scoped counts and ages only. Do not copy QR payloads, guest identity, phone numbers, device credentials, enrollment codes, free-text reasons, or vendor responses into monitoring systems or pilot evidence.

The pilot must not start until all of the following are true:

- A per-organization long-stay threshold and its business owner have been approved. The application currently uses a fixed 12-hour display threshold and has no per-organization setting. This is a pilot blocker, not permission to treat 12 hours as the organization's policy.
- `CRON_SECRET` is configured in the application and GitHub Actions secrets, the `Gate notifications` workflow is enabled, and an authenticated production notification-drain probe has succeeded. The checked-in scheduler uses a best-effort five-minute cadence, not a delivery SLA.
- `CRON_SECRET` is configured in both the application environment and the `Gate hardware commands` GitHub Actions environment, and the scheduled hardware workflow has completed successfully in production.
- Named operators and supervisors have the minimum required permissions, the evidence-retention owner has approved a retention period, and an incident/on-call channel is staffed for the pilot window.

## Roles and access

Use separate accounts for the operator and approving supervisor.

| Responsibility | Permission |
| --- | --- |
| View gates/readiness | `operations.gates.view` |
| Configure gates, enroll, or revoke devices | `operations.gates.manage` |
| Scan at an assigned gate | `operations.gates.scan` |
| View occupancy and immutable access evidence | `operations.access_events.view` |
| Record a manual exception | `operations.gates.exceptions.create` |
| Approve a manual exception | `operations.gates.exceptions.approve` |
| Reconcile occupancy | `operations.gates.occupancy.reconcile` |

Never put the Supabase service-role key or `CRON_SECRET` on a scanner device, in a browser, in screenshots, or in command output. Only a server-side production job may run the service-only notification drain.

## Preflight

1. Confirm the organization has visitor management enabled and the intended property, gate, direction, and operator roles are correct.
2. Open **Operations → Gate Management**. Confirm the operational summary loads and the device, long-stay, exception, and hardware badges are visible.
3. Record only the aggregate preflight values: active/stale-activity device counts, connectivity incidents in 24 hours, visitors inside, long stays, unresolved exceptions and oldest age, hardware backlog and oldest age, and dead hardware count.
4. Investigate devices with stale authenticated activity, pending exceptions, hardware backlog, or dead commands. A stale-activity count alone does not prove that a quiet device is offline.
5. Confirm the notification drain and hardware workflow monitoring described below are green.

## Device enrollment and camera check

1. From **Gate Management**, create or select an active gate with the correct property and direction. Choose **Enroll device**.
2. Generate an enrollment, then transfer the enrollment ID and one-time code directly to the intended device. The enrollment expires after 15 minutes and can be redeemed once. Do not retain the code in chat, tickets, photos, or a password manager after redemption.
3. On **Operations → Gate Scanner**, enter the enrollment ID, code, and a recognizable device display name, then redeem the enrollment.
4. After redemption, verify the displayed gate, property, and allowed direction. Confirm the device appears as active in Gate Management. The device credential is stored locally on that device; do not extract or copy it.
5. Serve the scanner over HTTPS. Grant camera access only to the expected AqarBooks origin, select the rear camera, and verify a QR code can be detected. If `BarcodeDetector` or camera access is unavailable, verify the manual payload field works; do not relax browser or operating-system camera security.
6. Denying or revoking camera permission must leave the scanner in the camera-unavailable/manual-fallback state. It must not produce an access decision by itself.

## Acceptance probes

Use dedicated test invitations and verify each result in both the scanner and **Operations → Access Event Ledger**. Compare counts and reason codes; avoid screenshots containing guest details.

| Probe | Expected result |
| --- | --- |
| Valid entry at the bound property/gate/direction | `ALLOW` / `VALID_ENTRY`; occupancy becomes inside once. |
| Invalid, expired, revoked, wrong-property, or wrong-direction pass | `DENY` with the corresponding stable reason; occupancy is unchanged. |
| Repeat entry while already inside | `DENY` / `ALREADY_INSIDE` (or the stricter pass-policy denial); no second occupancy transition. |
| Valid exit after an allowed entry | `ALLOW` / `VALID_EXIT`; occupancy becomes outside once. |
| Repeat exit without a current entry | `DENY` / `NOT_INSIDE`; occupancy remains outside. |
| Network removed before submission | `UNVERIFIED — OFFLINE`; no allow decision and no implied opening. |
| Network restored | The connectivity incident is submitted; a successful authenticated incident submission or later scan refreshes device activity. The original offline attempt is not converted into an allow. |

For the offline probe, keep the barrier under human control. Offline mode is evidence of uncertainty, never authorization to admit a visitor.

## Exceptions and reconciliation

1. In **Operations → Gate Scanner → Occupancy**, the operator records a manual exception with gate, direction, outcome, category, and a concise approved reason. Use an unidentified visitor only when operational policy permits it.
2. Confirm the request appears as pending and increases the unresolved-exception badge. The request itself must not change occupancy.
3. A different authorized supervisor reviews the underlying facts and records approval with a separate reason. Approval adds immutable evidence; it does not edit the request or an earlier scan.
4. Confirm the pending count decreases and that an approved identified entry creates the expected owner notification outbox item. Unknown visitors and denied/pending exceptions must not infer an owner notification.
5. If physical occupancy and recorded state differ, an authorized supervisor uses **Reconcile occupancy**, selects the intended inside/outside state, category, and reason, and confirms the reconciliation appears as a separate `RECONCILE` event. Never update or delete the original access event to make totals match.

## Device revocation

1. In Gate Management, revoke the exact device and enter a non-secret operational reason.
2. Confirm its status is revoked and it no longer contributes to the active-device total.
3. Attempt one test scan from that device. Authorization must fail, local device material must be cleared by the scanner, and no allow decision may be issued.
4. Re-enroll only after the loss/compromise review is closed. Enrollment creates a new credential; never restore an old credential.

## Notifications: production scheduling and monitoring

The notification outbox is private and `process_gate_notifications(limit)` is executable only by the service role. `.github/workflows/gate-notifications.yml` invokes `POST /api/cron/gate-notifications` every five minutes. The route authenticates `Authorization: Bearer <CRON_SECRET>` before creating the admin client and executes exactly one batch of at most 100 due rows. Request bodies and query parameters cannot increase the batch.

Production scheduling and monitoring contract:

- GitHub starts one invocation every five minutes with workflow concurrency of one. Scheduling can be delayed; the SQL row locks also protect overlapping drains. Each invocation attempts at most 100 due rows; the next invocation continues the backlog. Monitor capacity before increasing pilot volume.
- Configure the same `CRON_SECRET` in the application and GitHub Actions secret store; retain the service-role credential only in the server environment. Missing route configuration returns 503; invalid authorization returns 401.
- The workflow uses a 10-second connection timeout, 30-second request timeout, and two-minute job timeout. Transport errors or any non-200 response fail the job. The workflow discards response bodies and prints no secret or raw error data.
- The successful response contains only `processed`, the integer count of attempted rows, not delivered notifications. The database catches individual delivery failures and schedules bounded retries; unexpected database/transport failures return a redacted 500. A green workflow alone does not prove delivery.
- Record only start/end time, success/failure, duration, and aggregate counts. Alert after two consecutive failed invocations or when the oldest due row exceeds ten minutes. Page the on-call operator when any row reaches terminal `FAILED` (five attempts). These alerts require an independently configured service-side metrics monitor.

Monitor the private table from a secured service-side metrics job using aggregate queries only: counts by `status`, count of due `PENDING` rows, and age in minutes of the oldest due row. Do not export `recipient_user_id`, `recipient_member_id`, bodies, action URLs, source IDs, dedupe keys, or error text. The scheduler implementation is checked in; secret configuration, enabled production scheduling, alert wiring, and a successful production probe remain mandatory deployment evidence.

## Hardware workflow, NOOP evidence, and dead letters

Hardware dispatch is best effort and is not part of the access-decision transaction. `.github/workflows/gate-hardware.yml` starts every five minutes and makes five one-minute-spaced authenticated calls to `POST /api/cron/gate-hardware`. The route requires `Authorization: Bearer <CRON_SECRET>`, claims at most 50 commands, and returns counts only. GitHub scheduling delays mean this is not a one-minute SLA.

- Verify the application and GitHub environment hold the same rotated `CRON_SECRET`; a missing secret returns 503 and a mismatch returns 401. Never print the secret or response internals.
- Alert on a failed workflow run, any non-200 call, any backlog older than 10 minutes, or any `DEAD` command. `FAILED` commands retry with bounded exponential backoff; a stale `DISPATCHING` lease becomes claimable after 10 minutes.
- The only registered adapter is `NOOP`. Its `NOT_CONFIGURED` result becomes a dead command. It performs no network request or physical action, and a successful scan or completed workflow must never be presented as proof that a barrier opened.
- A dead command is immutable operational evidence. Investigate policy state, endpoint state, adapter configuration, workflow health, and the physical gate log. Do not rewrite the command to acknowledged and do not replay the original access event. After remediation, validate with a new authorized test event.

Monitor counts/ages only: nonterminal backlog (`PENDING`, `FAILED`, `DISPATCHING`), oldest backlog age, and `DEAD` count. Keep vendor payloads, credentials, endpoint identifiers, claim tokens, and raw failures out of logs and dashboards.

## Dashboard thresholds and response

| Signal | Dashboard threshold | Required response |
| --- | --- | --- |
| Device activity stale | Active device has no recorded authenticated activity, or its last authenticated scan/incident submission was more than 5 minutes ago | Check expected lane traffic, device custody, scanner UI, and the separate connectivity-incident signal. Quiet operation can be legitimate; do not infer offline status or move the lane solely from this badge. |
| Connectivity | Any recorded incident in the last 24 hours | Review the lane and complete the online/offline probe before relying on the scanner. |
| Long stay | Inside for more than the fixed 12-hour application threshold | Supervisor investigates; do not use for production escalation until the organization-specific threshold exists. |
| Unresolved exception | Any pending request | Supervisor reviews; escalate if the oldest age exceeds the pilot's agreed response time. |
| Hardware backlog | Any `PENDING`, `FAILED`, or `DISPATCHING` command | Confirm workflow health; escalate if oldest age exceeds 10 minutes. |
| Hardware dead letter | Any `DEAD` command | Stop claiming automated-opening readiness and investigate immediately. |

These are badge/triage thresholds, not automated paging except where the production monitors above are configured.

## Rollback and incident containment

1. Put affected lanes under staffed manual control; do not infer access from an offline scanner, queued notification, or queued hardware command.
2. Stop new hardware commands by disabling the organization's hardware setting and all affected endpoints through the approved service-side administration path. Then disable the `Gate hardware commands` workflow if calls themselves are unsafe. Preserve existing commands for investigation.
3. Revoke lost or suspect scanner devices. Stop creating enrollments and disable affected gates if gate configuration cannot be trusted.
4. If notification delivery is producing incorrect notifications, stop the external notification job. Preserve the outbox; do not grant authenticated users access or delete evidence to clear a backlog.
5. Roll back the application deployment through the normal release process. Do not reverse gate migrations or delete immutable access events, exception records, reconciliations, outbox rows, or hardware commands.
6. Record only safe aggregates and deployment/workflow identifiers in the incident ticket. Escalate any suspected credential or personal-data exposure through the security process.

## Evidence retention and pilot closeout

Access events, manual exceptions/approvals, reconciliations, connectivity incidents, notification outbox rows, device audit records, and hardware commands are operational evidence. This feature does not implement a gate-specific purge schedule. Before pilot start, the organization privacy/legal owner must approve and record a retention duration, access list, export location, and deletion procedure; absence of that decision is a pilot blocker.

Until that policy and an audited purge/export mechanism exist, preserve database evidence in place, restrict access through existing permissions/service-role boundaries, and do not perform ad hoc deletes. Keep pilot checklists, aggregate metric captures, release IDs, and workflow run IDs in the approved audit store. Do not retain enrollment codes, QR payloads, credentials, guest identity, phone numbers, free-text exception reasons, or raw error/vendor bodies in the pilot packet.

At closeout, confirm all test visitors are reconciled outside, all exceptions are resolved, devices not continuing to production are revoked, notification and hardware backlogs are reviewed, dead letters have owners, and the approved evidence disposition has been executed.
