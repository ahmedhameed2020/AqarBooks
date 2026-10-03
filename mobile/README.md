# AqarBooks Mobile V1

Flutter 3.47.5 / Dart 3.13.4 mobile companion for resident and maintenance workflows.

## Safe configuration

The app never contains a Supabase service key. Provide the public Supabase URL and publishable/anon client key at runtime:

```bash
flutter run --dart-define=SUPABASE_URL=https://your-project.supabase.co --dart-define=SUPABASE_ANON_KEY=your_publishable_key
```

Do not commit production keys. Supabase Auth persists the signed-in session using the SDK. All reads and writes use the authenticated public client and existing RLS/RPC authorization. Capability routing is based on active membership, assigned roles, and permission keys; a role name alone is not trusted.

## V1 workflows

Implemented backed flows: email/password auth and reset, Arabic RTL / English LTR switching, capability-specific navigation (resident Home/Units/Payments/Maintenance/More, staff Home/Work Orders/History/More, manager Overview/Operations/Maintenance/Alerts/More), resident home/units with lease status and dates, dues, payment history/details, visitor invitation creation with server-compatible token hashing and revoke, immediate one-time QR pass display after creation (the raw payload is kept only in that transient view), vehicle creation/deactivation, notification list and mark-read actions, maintenance request creation/detail/timeline/cancel, signed maintenance evidence upload through `begin_maintenance_attachment_upload` and `finalize_maintenance_attachment_upload`, explicit resident Request maintenance and Invite visitor actions, assigned staff work-order detail/timeline/notes with active assignments separated from completed/cancelled History, capability-gated status/completion/evidence actions, non-resident staff operations summary without owner balances, and bounded manager collections, occupancy, visitor activity, maintenance/work-order/alert counts.

The web documents page does have a signed-link server action, but it deliberately uses `createAdminClient()` because current RLS/storage policies do not permit the portal owner/member projection. Flutter cannot call that server action and must not receive the service-role credential; no public authenticated RPC or member-safe signed-link contract was found, so documents remain deferred until backend policies/RPC are added. Gate hardware activity has the same boundary and is shown as unavailable rather than fabricated. Online payment checkout uses a fixed allowlisted HTTPS handoff to the production web dues route (`https://app.aqarbooks.com/<locale>/portal/dues`) in the external browser. The web server action keeps provider credentials server-side; mobile passes no Supabase session, provider credential, payment data, or user-controlled URL, and browser re-authentication may be required. Native payments remain read-only. The mobile client does not bypass RLS or call admin/service-role APIs.

## Checks

Run from `mobile/`: `flutter analyze`, `flutter test`, and `flutter build apk --debug`. iOS builds require macOS/Xcode; the Windows Flutter installation does not expose `flutter build ios --no-codesign`, so final iOS/App Store verification must run on macOS.
