# Owner activation links

Owners receive `https://aqarbooks.com/activate/<token>` (token: 20-128 chars of
`A-Za-z0-9_-`). The app also accepts `aqarbooks://activate/<token>`. A link opens
the in-app `ActivationScreen` over everything, signed in or not. The token is
never logged or persisted; it lives only in the pushed route.

## App identifiers

| Platform | Identifier |
| --- | --- |
| Android `applicationId` | `com.aqarbooks.app` (`android/app/build.gradle.kts`) |
| iOS bundle id | `com.aqarbooks.aqarbooksMobile` (`ios/Runner.xcodeproj/project.pbxproj`) |

## What the web team must serve (from `https://aqarbooks.com`)

### `/.well-known/assetlinks.json` (Android App Links, `autoVerify`)

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.aqarbooks.app",
    "sha256_cert_fingerprints": ["<SHA-256 of the release signing cert>"]
  }
}]
```

Serve with `Content-Type: application/json`, no redirects. Fingerprints come
from the environment (release keystore and, for internal testing, the debug or
Play App Signing certificate); list every certificate that signs a build.

### `/.well-known/apple-app-site-association` (iOS Universal Links)

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.com.aqarbooks.aqarbooksMobile"],
      "components": [{ "/": "/activate/*" }]
    }]
  }
}
```

No file extension, `Content-Type: application/json`, no redirects. `TEAM_ID`
comes from the Apple developer account.

## Client configuration (already in the repo)

- Android `AndroidManifest.xml`: intent filter with `android:autoVerify="true"`
  for `https://aqarbooks.com/activate*`, and a second one for
  `aqarbooks://activate`. `flutter_deeplinking_enabled=false` because links are
  handled by `app_links`, not Flutter's route handling.
- iOS: `ios/Runner/Runner.entitlements` declares `applinks:aqarbooks.com` and is
  referenced from `project.pbxproj` (`CODE_SIGN_ENTITLEMENTS`). Device builds
  need the **Associated Domains** capability enabled on the App ID and
  provisioning profile (simulator builds work without it). `Info.plist` already
  registers the `aqarbooks` URL scheme and sets `FlutterDeepLinkingEnabled` to
  false.
- The web base used by the app is `--dart-define=AQAR_WEB_BASE=https://...`
  (default `https://aqarbooks.com`).

## Verifying

- Android: `adb shell am start -a android.intent.action.VIEW -d "aqarbooks://activate/<token>"`
  and `adb shell pm get-app-links com.aqarbooks.app`.
- iOS: `xcrun simctl openurl booted "aqarbooks://activate/<token>"`.
