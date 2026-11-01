# Demo scenario — "from a leaking pipe to a visitor at the gate" (about 8 minutes)

Every claim below is backed by a test run in this review; say only what is on this page. Local demo data; run it with the steps in `docs/runbooks/accounting-demo-local.md` (production build, clean stack) and the specs named in brackets.

**Cast:** Mona (owner of unit R-101), the property manager, the gate guard, and a second owner (R-202) who stays in the background to prove isolation.

## The story
1. **Mona signs in without a password** (email → six-digit code). She lands on a portal that knows only her. *[J1]*
2. **"Only mine."** Her units list shows R-101; her statement shows her two charges (3,000 and 1,500), the 1,000 receipt and the running balance 3,500 — the other owner's 7,777 and another organization's 9,999 are nowhere. *[J2, J3, R1, R2]*
3. **She reports a water leak** from the portal: unit, category, priority, description. A request number appears and she can watch it. *[J4]*
4. **The manager triages it** with an internal note ("plumber needed") and then starts it with a note for the owner. Mona sees "In progress" and the owner-facing note — **never** the internal one, not even in her notification. Every status change is on the audit trail with who did it. *[J5, J6, audit-coverage]*
5. **Mona invites a guest**: a one-time QR pass, shown once. The system stores only its hash — the secret is nowhere in the database. *[V2]*
6. **At the gate the guard** (not the manager) scans from a device the manager enrolled with a one-time code: **entry allowed**, a second try refused ("already used"), **exit allowed**. Mona is notified of the entry and the exit. For a multi-use pass the gate also refuses "entry while already inside" and "exit while outside". *[V1–V3]*
7. **Control, not trust:** Mona revokes another pass in one click and the next scan is refused; an expired pass, a not-yet-valid pass and a forged QR are all refused, and the forged attempt is on record with the gate and the guard. *[V4, V5]*
8. **Walls between people:** the other owner cannot open, cancel or revoke Mona's request or pass; an owner has no way into staff screens or the scanner; another organization's guard and device cannot admit Mona's guest; a suspended or inactive account can create nothing. *[R1–R5, V6]*

## What to point at (evidence, not adjectives)
* **One platform, three audiences, one ledger:** the owner's request, the manager's update, the guard's scan and the owner's notification are the same records seen from three roles — and the amounts a customer sees come from the same ledger the accountant reconciles (see the Phase 2 accounting journey: 65 browser/database tests).
* **Privacy by construction:** QR secrets hashed; staff-only notes never reach the owner; tenants isolated even when unit codes collide.
* **Operational control:** device-bound scanning with a one-time enrollment code, an offline-safe scanner (no allow while offline), supervisor-approved manual exceptions, a live occupancy view and a CSV export — all covered by the existing gate specs (13/13 passing in this review).

## Say it honestly (do not claim these)
* **Not yet:** staff are **not** alerted when an owner files a request (they open the list); suspending an owner does **not** cancel passes already issued; amenity-booking decisions are **broken** on a freshly built database (a migration regression) — do not demo amenities; a foreign-organization pass produces a database error instead of a clean "invalid pass" (nobody is admitted).
* **Not tested here:** real email/SMS/WhatsApp delivery, a real camera reading a printed QR, vehicles, documents, leases and renewals screens.
* **Qatar:** the product has QAR, Arabic amounts-in-words and an Asia/Qatar time zone; it has **no** Qatari tax profile, e-invoicing or payment gateway, and new-property defaults still say Cairo/EGP. Present Qatar as "supported for operations, accounting set-up pending" — not as "compliant".

## Running it
`npm run demo:stack-up` → `node scripts/demo-local/build.mjs --next-only` → `node scripts/demo-local/start-prod.mjs` → `npm run demo:e2e -- tests/e2e/portal-journey.spec.ts tests/e2e/portal-visitor-gate-journey.spec.ts tests/e2e/portal-refusals.spec.ts` (screenshots in `docs/audits/portal-review-evidence/screens/`).
