# Owner portal access — provisioning and first activation

Staff give an owner access from the member page (**بوابة المالك / Owner portal**).
Two ways in, one identity per person.

| | Email activation | Client ID + temporary password |
|---|---|---|
| For | owners with a usable email | owners without one (or when staff prefer) |
| Staff action | تفعيل بوابة المالك | إصدار بيانات دخول مؤقتة |
| Owner receives | `https://aqarbooks.com/activate/<token>` (email, or copied) | `MB-10482` + temporary password (copied; no WhatsApp API) |
| First step | open link → choose password | sign in → forced "أكمل إعداد حسابك" |
| Token / secret | one-time, 72 h, member- and org-bound, revocable, stored as sha256 | password lives only in Supabase Auth; DB keeps a hash fingerprint |

## States
`غير مفعلة` (no row) → `بانتظار التفعيل` → `مفعلة` ⇄ `موقوفة`. Owners linked by the
older passwordless invitation show as `مفعلة` and can be suspended here.

## Rules enforced in the database (migration `20261004120000_owner_portal_access.sql`)
- Every staff function checks `has_permission(auth.uid(), <member's org>, …)` itself;
  another tenant, a nonexistent member and a missing permission give the same error.
- `members.portal.invite` issues access; the new `members.portal.manage` suspends,
  reactivates and signs out (granted to every role that already holds `invite`).
- `current_member_id()` returns NULL while a member is suspended or has a pending forced
  password change, so both states are authoritative in RLS, not just in the app.
- Eligibility = at least one active `unit_ownerships` row.
- Suspension of a shared staff+owner identity never bans it; it only closes the owner side.
- Audit (`platform_audit_logs`, action `member_portal.*`): activation_created, invitation_sent
  (and _failed), activation_completed, temp_access_issued / _regenerated, suspended,
  reactivated, sessions_revoked, activation_revoked. No passwords or raw tokens.

## Email delivery
Uses Resend (`RESEND_API_KEY`, `RESEND_FROM`). If it is unset or the provider rejects the
message, staff see "تم إنشاء رابط التفعيل — لم يتم إرسال البريد" with a copy button; the
outcome is recorded on the token. The raw link is shown once (only its hash is stored); a
new link replaces the old one.

## Activation page and API
`/activate/<token>` (outside `/[locale]`, so it can be an App Link), backed by
`POST /api/portal-activation/inspect` and `/complete`. States: valid, expired, used,
revoked, not found. An email that already has an identity (staff who are also owners) must
sign in with its own password and is linked — no second identity is created.

## App / Universal links (deployment configuration)
`/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` are generated
from environment variables and are empty until set:
`ANDROID_APP_SHA256_FINGERPRINTS` (comma-separated, debug/upload/Play keys),
`ANDROID_APP_ID` (default `com.aqarbooks.aqarbooks_mobile`), `IOS_TEAM_ID`,
`IOS_BUNDLE_ID` (default `com.aqarbooks.aqarbooksMobile`). Without them links open in the
browser, where the web activation page works on its own. See
`mobile/docs/OWNER_ACTIVATION_LINKS.md`.

## Password reset
Email accounts reset by email. Client-ID-only accounts have no electronic recovery: the app
says so, and staff issue new temporary credentials.

## Known limits
- "Sign out of all devices" deletes Auth sessions; access tokens already issued live until
  they expire. For a suspension `current_member_id()` closes that window for portal data.
- The forced password change proves the password hash changed, not that the new password
  differs from the temporary one; the app blocks reuse client-side.
- Client-ID accounts cannot use the web portal's emailed-code sign-in (no mailbox).
- Needs applying to the hosted project deliberately, then the Supabase security advisor, and
  one check that the migration's `delete from auth.sessions` is permitted for the function owner.
