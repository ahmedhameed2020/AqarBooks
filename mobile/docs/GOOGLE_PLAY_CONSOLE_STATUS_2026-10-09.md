# AqarBooks — Google Play Console status, 9 October 2026

## V1 decision after user clarification

The user confirms no active Fawry commercial agreement and requires V1 without electronic payment initiation. The existing uploaded AAB, Fawry screenshot, listing text and release notes are **drafts requiring replacement/reconciliation**, not approved V1 assets. No code/configuration/database/deployment/AAB rebuild was performed after this instruction. Read-only audit and concrete change plans are in `GOOGLE_PLAY_FAWRY_V1_PLAN_2026-10-09.md`, `GOOGLE_PLAY_V1_STORE_CHANGE_PLAN_2026-10-09.md`, `GOOGLE_PLAY_DATA_CODE_AUDIT_2026-10-09.md` and `GOOGLE_PLAY_DATA_PROVIDER_REVIEW_2026-10-09.md`.

## Completed

- Selected developer account: **FlowTech Solutions**, developer ID `5463557177498768888`.
- App: **AqarBooks**, Console app ID `4976208059312728968`. Console Protected with Play confirms package `com.aqarbooks.app`.
- Saved privacy policy: `https://aqarbooks.com/ar/privacy`; publicly accessible and explicitly covers the mobile application.
- Saved category **Business**, support email `support@aqarbooks.com`, website `https://aqarbooks.com`.
- Saved Arabic default listing and English (United States) translation. App name remains **AqarBooks**. English short description is a faithful translation of the supplied Arabic short description.
- Uploaded official store icon, Feature Graphic, and the eight marketing PNGs in `mobile/store-assets/screenshots/marketing/ar/`. No contact sheet or AI preview uploaded.
- Verified icon and Feature Graphic pixels match the existing deterministic Pillow generator using official logo/fonts. All eight marketing image hashes match their manifest. User confirmed these final screenshots do not use image-model generation or editing; saved **Don't label assets** under that explicit approval.
- Store listing status: **Ready to send for review**.
- Pricing verified: **Free**.
- Created and saved **Production draft 1.0.0 (1)** with AAB and release notes in both languages.
- Selected **Egypt only**, shown as **Targeted**, 1 country/region.
- **No submission for review and no public release.** Publishing overview shows Changes not yet submitted for review, with Send app for review disabled.

## AAB verification

- File: `mobile/build/app/outputs/bundle/release/app-release.aab`, 68,405,967 bytes.
- SHA-256: `DB5FD519CFFA5A0A045255C5DAD9C5E5989C667BD55297E556AB17942315418A`.
- `bundletool dump manifest`: package `com.aqarbooks.app`, version name `1.0.0`, version code `1`, target SDK `36`.
- `bundletool validate` completed with exit code 0.
- Android Studio JBR `jarsigner -verify` completed with exit code 0 and `jar verified`. Self-signed certificate/no timestamp warnings remain; certificate expires in 2056. The earlier system Java JarInputStream inconsistency warning did not reproduce with Android Studio's JBR. Console accepted and processed the artifact.
- Upload certificate SHA-256 matches Console: `1D:18:BB:D7:7A:D7:AE:C9:59:28:D2:D2:4F:5C:5A:D6:E1:06:1D:AF:86:49:D9:9C:78:85:F4:43:F6:6E:0E:BA`.
- Console Digital Asset Links snippet provides Play signing SHA-256: `9F:44:72:26:0E:05:FE:FE:8B:F2:6E:F9:1F:33:D7:C4:34:8E:8E:C0:97:7D:A0:8A:04:DA:62:2B:ED:0A:23:03`.
- No signing-key change/reset was performed. Website deployment to add the Play signing fingerprint alongside the upload fingerprint remains pending.

## Remaining requirements and approvals

Dashboard after listing save initially showed **3 of 11 setup tasks complete**. Government, Ads and Health have since been saved; Advertising ID is an additional declaration outside those eleven. Latest Publishing overview independently confirms Ads/Health changes plus Advertising ID and Government declarations updated. The final Dashboard count was not re-read after Health; no inferred count is reported as observed.

| Requirement | Evidence/status | Next step |
|---|---|---|
| Ads | No saved under explicit user approval; source/dependencies/AAB SDK check supports it | Re-check replacement artifact; not a no-telemetry claim |
| Advertising ID | No saved under explicit user approval; no AD_ID plus SDK/source/AAB checks | Re-check replacement artifact |
| Government apps | No saved under explicit user approval | Change saved, not submitted |
| Health | No health features saved under explicit user approval | Console says no regional requirements; saved, not submitted |
| Financial features | No answer saved | No active Fawry agreement; disable electronic initiation first. Administrative financial functions remain; final category intentionally open |
| Content rating | Category/terms form inspected; terms checkbox not accepted | Await explicit IARC terms approval, then complete and review actual questionnaire |
| Target audience | Console requires Ads and Sign in details first | Proposed 18+ based on published privacy policy; not entered or approved |
| Data safety | No form saved. Code/native/AAB and public provider document audits prepared | ML Kit telemetry identified. Resolve effective contracts, recipient scope, tracking, runtime and deletion; approve final matrix before saving |
| Sign in details | Restricted-access form inspected, exploratory selection discarded | Verify five isolated QA roles, real Play-installed login, then final approval before saving credentials |

Production preview initially showed 3 errors: no countries, financial declaration, health declaration. Egypt was subsequently saved; preview has not yet been rerun to claim that error cleared. No closed-testing gate appeared in the inspected Production creation flow; future actual requirements still apply.

## QA account readiness — read-only investigation

- `DEVICE_TEST_PLAN.md:15,26–34` prescribes isolated fictional organization and qa.owner, qa.manager, qa.collector, qa.tech, qa.gate. These instructions do **not** prove accounts exist.
- Connected Supabase account does not list the AqarBooks project identified by local project configuration. No database was queried, and no passwords, keys, tokens, customer rows, accounts, roles, or gate devices were retrieved or changed.
- Preview uses local fake data and no Supabase client (`GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md:62–74`). Screenshots cannot establish production login readiness.
- Native app uses email/password authentication (`mobile/lib/data/repository.dart:454–456`). First-login setup can change password/phone and must not be performed without approval. Biometric unlock is opt-in; do not bypass authentication.
- Gate setup requires device UUID and short-lived enrollment (`DEVICE_TEST_PLAN.md:34,98–100`). Review must use a verified fictional gate with no real hardware or operational integrations.

### Proposed validation/provisioning sequence

1. Reconnect Supabase to the account authorized for AqarBooks, or obtain sanitized admin evidence for the isolated QA organization. Query only verified QA identifiers; never print credentials or customer data.
2. Verify existing auth state, organization memberships, ownership, effective role permissions, and absence of real operational associations for all five roles.
3. If missing, present an exact provisioning proposal for approval: one fictional QA organization, fictional units/dues/maintenance/visitor records, five least-privilege role accounts, and a fictional gate without hardware connections. Do not create or modify anything before approval.
4. Verify build configuration privately and test real authenticated entry, activation/confirmation/MFA requirements, and role access using the same AAB. Validate on a Play-installed artifact before claiming Play login works. Internal testing may provide that artifact without optional closed testing, but release to testers needs a concrete authorized setup.
5. Produce English instructions from verified results for each role. Do not assert working access or stable gate enrollment before tests.
6. Use user-entered secure fields or an agreed secret-delivery method for passwords; do not put them in chat, reports, source, or command output. Obtain final approval before saving verified review credentials in Console.

## Console evidence

Screenshots are in `play-console-evidence/`:

- `privacy-saved-2026-10-09.png`
- `store-settings-2026-10-09.png`
- `ai-declaration-2026-10-09.png`
- `english-draft-2026-10-09.png`
- `store-ready-2026-10-09.png`
- `production-draft-2026-10-09.png`
- `release-errors-2026-10-09.png`
- `egypt-targeted-2026-10-09.png`
- `app-signing-2026-10-09.png`
- `app-free-2026-10-09.png`
- `iarc-terms-2026-10-09.png`
- `publishing-overview-2026-10-09.png`
- `publishing-overview-latest-2026-10-09.png` (after all four approved declarations)
- `government-saved-2026-10-09.png`
- `ads-saved-2026-10-09.png`
- `health-saved-2026-10-09.png`
- `ad-id-saved-2026-10-09.png`

Supporting local validation: `aab-signature-verification.txt`, `aab-manifest.xml`.

## Practical limits

Organization account type was supplied by the user; the selected account name/ID was independently verified, but legal organization verification status was not independently audited. Support email end-to-end delivery, exact release backend configuration, production login, role isolation, and Play-installed device tests are not yet verified. Final publication requires completed declarations, working reviewer access, and the user's explicit final approval.

## Review and next approval

Independent read-only source review found no global Fawry commercial-contract kill switch, and caught the need to block direct mobile RPC/replay/finalization while preserving historical settlement. Native audit identified ML Kit telemetry, preventing the provisional release document's “no analytics” assumption from being reused. Provider review distinguishes public documents from effective account agreements; no sharing exemption was approved.

Adversarial documentation review also required distinguishing read/download from outbound collection, role-dependent attachment requirements, and final-artifact screenshot capture from local proposals. The store plan now explicitly postpones final captures until approved build verification. Provider wording was narrowed from presumed technical activation status to the user's confirmed absence of an active commercial agreement.

The user chose **revise plans before implementation**. Revised plans now separate Flutter changes, web impact review, database design, tests before rebuild, and rollback. No implementation is approved yet. No further Play upload is authorized. Production migrations/configuration/deployment, push, AAB rebuild/upload replacement, final Data safety/Financial/IARC declarations, account provisioning and review/public release remain unapproved.
