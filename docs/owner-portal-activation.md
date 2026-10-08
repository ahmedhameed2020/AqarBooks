# Owner portal access — provisioning and first activation

Staff give an owner access from the member page (**بوابة المالك / Owner portal**).
Two ways in, one identity per person.

| | Email activation | Client ID + temporary password |
|---|---|---|
| For | owners with a usable email | owners without one (or when staff prefer) |
| Staff action | تفعيل بوابة المالك | إصدار بيانات دخول مؤقتة |
| Owner receives | `https://aqarbooks.com/activate/<token>` **by email only** | `MB-10482` + temporary password (copied; no WhatsApp API) |
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

## Email ownership proof (why staff never see the link)
An activation link proves ownership of the mailbox only if it travelled to that mailbox and
nowhere else. So:
- The link is minted on the server (`mint_member_activation_token`, service role only) and sent
  with Resend. No staff-callable function and no screen ever returns it; there is no
  "copy activation link".
- `delivery_status = 'sent'`, recorded by the server only after Resend accepted the message, is
  required to use a token. If the email is not configured or is rejected, nothing is minted (or the
  token is revoked on the spot) and the owner stays `PENDING_EMAIL_VERIFICATION`. Staff are offered
  the client-ID + temporary-password fallback; nobody can mark the address verified.
- A token is bound to the address it was mailed to and to the member: changing the member's email
  afterwards, or presenting it with another identity, is refused.
- An address that already has a **verified** Auth identity is never duplicated: the identity must
  sign in with its own password and is linked. An **unverified** identity is never linked as-is; the
  mailbox holder who presents the delivered token replaces its password (unless it belongs to an
  organization, which is refused).
- One identity can serve one member only (`current_member_id()` assumes it).
- The retired staff action that returned a working sign-in link and code to the browser was removed.

## Activation page and API
`/activate/<token>` (outside `/[locale]`, so it can be an App Link), backed by
`POST /api/portal-activation/inspect` and `/complete`. States: valid, expired, used,
revoked, not found. An email that already has an identity (staff who are also owners) must
sign in with its own password and is linked — no second identity is created.

## App / Universal links (deployment configuration)
`/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` are generated
from environment variables and are empty until set:
`ANDROID_APP_SHA256_FINGERPRINTS` (comma-separated, debug/upload/Play keys),
`ANDROID_APP_ID` (default `com.aqarbooks.app`), `IOS_TEAM_ID`,
`IOS_BUNDLE_ID` (default `com.aqarbooks.aqarbooksMobile`). Without them links open in the
browser, where the web activation page works on its own. See
`mobile/docs/OWNER_ACTIVATION_LINKS.md`.

## Password reset
Email accounts reset by email. Client-ID-only accounts have no electronic recovery: the app
says so, and staff issue new temporary credentials.

## Known limits
- "Sign out of all devices" uses the supported Auth Admin API only (no managed-table writes):
  Supabase offers sign-out by a user's own JWT, so the server mints a one-off session through
  `generateLink` + `verifyOtp` and calls `admin.signOut(jwt, 'global')`. Side effect: the identity's
  `last_sign_in_at` moves. Access tokens already issued live until they expire; for a suspension
  `current_member_id()` closes that window for portal data. A banned identity cannot refresh anyway.
- Suspending the owner side of a staff+owner identity never bans it and never ends its sessions.
- The forced password change proves the password hash changed, not that the new password
  differs from the temporary one; the app blocks reuse client-side.
- Client-ID accounts cannot use the web portal's emailed-code sign-in (no mailbox).
- Needs applying to the hosted project deliberately, then the Supabase security advisor, and
  one check that the migration's `delete from auth.sessions` is permitted for the function owner.

## Verifying against a hosted project without changing it
`node scripts/hosted-verify/build.mjs > verify.sql` produces one script that applies the migration
and 26 acceptance checks (eligibility, organization isolation, token lifecycle, client ID,
suspension, staff+owner, grants/RLS/search_path) inside a single transaction that always ends in an
exception — nothing is committed. Run it in the SQL editor; success is an error message starting
`VERIFICATION_ROLLED_BACK` with `"failed": 0`. It has been run against the locally replayed schema
only. The Auth-API revocation sequence cannot be exercised that way (it needs real Auth sessions).
