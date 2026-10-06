# AqarBooks Mobile V1

Flutter 3.47.5 / Dart 3.13.4 companion app for Egyptian property communities. Source of truth for the UX is [docs/UX_BLUEPRINT_EGYPT_V1.md](docs/UX_BLUEPRINT_EGYPT_V1.md); the final design file and per-screen implementation notes are referenced there and in [docs/FIGMA_HANDOFF.md](docs/FIGMA_HANDOFF.md).

## Safe configuration

The app never contains a Supabase service key. Provide the public Supabase URL and publishable/anon client key at runtime:

```bash
flutter run --dart-define=SUPABASE_URL=https://your-project.supabase.co --dart-define=SUPABASE_ANON_KEY=your_publishable_key
```

Do not commit production keys. Supabase Auth persists the signed-in session using the SDK. All reads and writes use the authenticated public client and existing RLS/RPC authorization. Capability routing is based on active membership, assigned roles, and permission keys; a role name alone is never trusted.

## Personas and navigation

Five permission-driven experiences, resolved in precedence order manager → collector/cashier → technician → gate → resident (a user who is both staff and a member gets a "my resident account" entry under More):

| Persona | Gate (permission keys) | Tabs |
|---|---|---|
| Resident/Owner | `members.user_id` record | الرئيسية · وحداتي · المدفوعات · الصيانة · المزيد |
| Operations manager | `operations.maintenance.manage` / `work_orders.assign` / `visitors.manage` | الرئيسية (يحتاج انتباهك) · التحصيلات · الصيانة · التشغيل · المزيد |
| Collector / Cashier | `receivables.payments.create` (session card only with `cashier.sessions.open`) | اليوم · بحث · تحصيل · إيصالات · المزيد |
| Technician | `operations.work_orders.view` / `.complete` | اليوم · مهامي · السجل · التنبيهات · حسابي |
| Gate operator | `operations.gates.scan` + trusted device | المسح · الزوار · الموجودون الآن · الأحداث · المزيد |

## V1 workflows

- **Resident:** home summary (balance from `members_with_financials`, overdue computed from `due_date`, not the stale `OVERDUE` status), dues and payment history, **native Fawry reference-code checkout** via `create_online_payment_checkout_transaction` (the pay CTA renders only when the organization has Fawry enabled; bank transfer is never offered as a self-serve option), maintenance create/detail/timeline/cancel with signed attachment upload, visitor passes with server-compatible token hashing, local pass storage and WhatsApp share, vehicles, notifications. Lessee members without an active ownership see the owner-only sections hidden (backend `is_current_member_unit_owner` restriction).
- **Manager:** "needs your attention" feed (overdue dues, pending cheques, SLA-breached work orders, expiring leases, pending gate exceptions), four tappable operational stats, work-order assign/schedule/review, gate exception approval (self-approval blocked server-side).
- **Collector/Cashier:** search → outstanding dues → collect (cash / bank-transfer record / other; cheque only with `banking.cheques.manage`) → numbered receipt; `record_payment` carries an `idempotency_key` and the open `cashier_session_id`; cashier session open/close with expected-vs-actual variance.
- **Technician:** my assigned work orders only, ordered SLA-breach → urgent → oldest; start/wait/resume require `.manage`, complete requires `.complete` plus a written completion summary and AFTER photo; transitions mirror the DB state machine exactly (no cancel from IN_PROGRESS/WAITING).
- **Gate:** trusted-device activation (43-char base64url code + enrollment UUID, 15-minute validity) then live camera scanning — see [docs/GATE_CAMERA_SCANNER.md](docs/GATE_CAMERA_SCANNER.md) for the scan pipeline, duplicate-scan protection, and the device checklist.

Deferred by backend boundaries (not fabricated in the app): member documents (web uses an admin-client signed-link action with no member-safe RPC) and gate hardware activity. The mobile client never bypasses RLS or calls admin/service-role APIs.

Attachments are picked through the system picker (SAF / Android Photo Picker) — no media permissions are declared or requested.

## Checks

Run from `mobile/`: `flutter analyze`, `flutter test`, and `flutter build apk --debug`. A visual QA gallery of all 16 screens lives at `lib/preview_main.dart` (`flutter run -t lib/preview_main.dart -d web-server`, or the `figma-preview-gallery` entry in `.claude/launch.json`). iOS builds require macOS/Xcode.

## Release (Google Play)

Play `applicationId` is **`com.aqarbooks.app`** (immutable after first upload; the Gradle namespace keeps its original value). Release signing reads `android/key.properties` (gitignored) and falls back to the debug key when the file is absent so `flutter run --release` still works on any machine:

```bash
flutter build appbundle --release --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
```

Store listing, Data-safety answers, permissions rationale, and the publish checklist: [docs/GOOGLE_PLAY_RELEASE.md](docs/GOOGLE_PLAY_RELEASE.md). Real-device test plan: [docs/DEVICE_TEST_PLAN.md](docs/DEVICE_TEST_PLAN.md). Privacy-policy draft: [docs/PRIVACY_POLICY_DRAFT.md](docs/PRIVACY_POLICY_DRAFT.md).
