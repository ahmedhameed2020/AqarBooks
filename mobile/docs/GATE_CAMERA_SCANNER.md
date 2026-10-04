# Gate camera scanner

Camera QR scanning for the gate operator persona (Figma screen 15). The
camera feeds the **same** pipeline as the manual field, so every scan — camera
or manual — goes through one lock, one validation step and one backend call.

## Flow

```
camera frame → QR detected → ScanCoordinator.tryBegin (sync lock + debounce)
  → trusted-device re-check (secure store)
  → parsePassPayload  (AQP1.<invitation uuid>.<secret>; junk QR denied locally)
  → process_visitor_gate_scan (8-arg trusted-device RPC, idempotent client_scan_id)
  → result screen: ALLOW (green) · DENY (red) · needs attention (amber)
  → lock released when the result screen closes
```

Package: `mobile_scanner ^7.4.2` (Android + iOS). Device credential storage:
`flutter_secure_storage ^11` (Keystore / Keychain).

## Trusted-device contract (unchanged backend)

* A device is enrolled once with the **activation code** (43-char base64url)
  and **enrollment ID** (UUID) the web console shows to the manager
  (`create_gate_device_enrollment` → `redeem_gate_device_enrollment`).
* The redeemed device is bound to **one gate** and an allowed direction
  (`ENTRY` / `EXIT` / `BOTH`). The app stores `device id`, `gate id`,
  `allowed direction` and the **raw device credential** in the platform
  secure store (iOS: `first_unlock_this_device`, so it cannot be restored onto
  another phone).
* Every scan sends device id + credential; the server verifies the SHA-256,
  gate, direction, status and operator permission. Direction values are the DB
  vocabulary `ENTRY` / `EXIT` (not `IN` / `OUT`).
* `process_visitor_gate_scan` is sent **without** `p_scanner_version`
  (recorded as `unknown`); `2026-10-01` identifies the web scanner build and is
  intentionally not claimed by mobile.
* Without an enrolled device the shell shows the activation screen and the
  scan screen itself refuses to render the camera or the manual field.

## Duplicate-scan protection

| Layer | Behaviour |
|---|---|
| In-flight lock | Taken synchronously in the detection callback; nothing else starts until the result screen is closed. |
| Min gap (500 ms) | Rapid back-to-back detections are dropped. |
| Repeat window (3 s) | The same pass still in frame is not re-sent after the result closes. Only a SHA-256 fingerprint is remembered. |
| Idempotent retry | After a transport failure the same `client_scan_id` is reused for that pass+direction (2 min), so a lost response replays server-side instead of creating a second event. |
| Backend | `client_scan_id` idempotency + pass state (`PASS_ALREADY_USED`, `ALREADY_INSIDE`) remain the source of truth. |

## Camera behaviour

* Runs only while the tab is visible, nothing is pushed over it, and the app is
  foregrounded (the shell keeps tabs alive in an `IndexedStack`).
* Returning from system Settings restarts the camera automatically.
* Flash toggle appears only when the hardware reports a torch.
* Permission denied / no camera / failure → a dark panel with platform-specific
  Settings guidance, a retry button, and a pointer to manual entry. Raw plugin
  errors are never shown.
* Disabled on web/desktop (idle placeholder, manual entry only).

## Security notes

* QR secrets are held only for the duration of the RPC call; never persisted,
  logged, or printed (`ParsedPass.toString` is redacted). The manual field is
  cleared on submit.
* Backend errors are mapped to operator-safe copy (`gateErrorMessage`).
* No privileged keys in platform config.

## Platform configuration

* **Android** — `CAMERA` permission; camera and autofocus declared
  `required="false"` so the app still installs on camera-less devices.
* **iOS** — `NSCameraUsageDescription` updated to cover gate scanning. There is
  no checked-in `ios/Podfile`; Flutter generates it on the first build on macOS.
  `mobile_scanner`'s pod minimum (iOS 12) is below the project target (15.0).

## Verification status

Verified on this Windows machine: `flutter analyze`, `flutter test`,
`flutter build apk --debug`, Flutter Web preview of the scan/denied states.

**Not verifiable here** (needs hardware):

1. Real camera frames, torch, and the native permission prompt on a physical
   Android device or emulator with a camera.
2. Anything iOS. Building, running and validating on iPhone requires **macOS +
   Xcode** (`flutter build ios`, `pod install`, signing, physical-device camera
   test). Nothing in this change has been compiled for iOS.

Device checklist (Android and iOS):

- [ ] First launch → permission prompt → preview appears.
- [ ] Deny → denied panel; enable in Settings, return → camera starts by itself.
- [ ] Scan a valid pass → green; same QR held in view does not re-fire.
- [ ] Scan an expired/used pass → red with the translated reason.
- [ ] Scan while inside / exit without entry → amber.
- [ ] Switch tabs / lock the phone → camera light goes off.
- [ ] Flash toggle works on the back camera.
- [ ] Airplane mode scan → safe error; re-scan after reconnect replays the same
      `client_scan_id` (no duplicate event in `access_events`).
- [ ] Revoke the device in the web console → scan shows the "not activated" copy.
