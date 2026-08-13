# Owner Portal & Online Payments — Design Spec

**Date:** 2026-08-14
**Area:** New route group `app/[locale]/(portal)/`, new `lib/payments/` provider layer, new webhook routes, schema additions
**Type:** New feature (P0 gap from system review)
**Status:** Approved (design), pending implementation plan

## Goal

Give resort/compound owners (`members`) a self-service portal to view their account
and pay outstanding dues online, without touching the existing staff-facing `(app)`
route group, its RLS policies, or `record_payment`'s permission model. Members
currently have no login at all — this spec adds one, scoped tightly to their own
data.

## Scope

**In scope**

- `members.user_id` link + invitation flow (email via existing Supabase auth email
  system, and a manual WhatsApp share link using the same invite token).
- New `(portal)` route group: dashboard, statement, dues (with selection), payment
  history, owned units — read access to the owner's own data only.
- Online payment: owner selects one or more open dues, pays via Paymob or Fawry
  (both, behind a provider abstraction), confirmed via webhook.
- New tables: `member_invitations`, `online_payment_transactions`.
- New SQL function `record_online_payment` (separate from `record_payment`, no
  `has_permission` check — trusts a webhook-verified transaction instead).
- New RLS policies scoped to `members.user_id = auth.uid()`.
- Provider abstraction (`lib/payments/provider.ts`) with `paymob.ts` and `fawry.ts`
  implementations, built against placeholder/sandbox env vars (no real merchant
  credentials available yet).

**Out of scope**

- Any change to existing staff RLS policies, `record_payment`, or the `(app)` route
  group's permission model.
- WhatsApp Business API / automated messaging (this spec only adds a manual
  `wa.me` deep-link the staff member clicks and sends themselves).
- Real Paymob/Fawry merchant onboarding — env vars are placeholders until the user
  supplies real credentials.
- Partial/custom-amount payment (owner pays exactly the sum of the dues they
  select; no free-amount input).
- Bank reconciliation, WhatsApp reminders, lease management — tracked separately
  in the system-review roadmap.

## Decisions (locked during brainstorming)

1. **V1 includes online payment**, not view-only — user explicitly rejected the
   read-only-first option.
2. **Both Paymob and Fawry**, via a shared provider interface, built now.
3. **Sandbox/placeholder credentials** — build the full flow, read keys from env,
   real keys added later without code changes.
4. **Login model:** email invite + password (reuses existing Supabase Auth email
   flow already used for staff register/verify/reset — no new email infra).
   **Plus:** a manual WhatsApp share option using the same invite token, since no
   WhatsApp Business API integration exists yet.
5. **Payment selection UX:** owner checks specific open dues (not "pay full
   balance" and not a free-amount field); total is computed from the selection.

## Identity & Invitation Flow

### Schema

```sql
alter table public.members
  add column user_id uuid references auth.users (id) unique;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  email text not null,
  token_hash text not null,        -- sha256 of the raw token; raw token never stored
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index idx_member_invitations_pending_per_member
  on public.member_invitations (member_id) where status = 'pending';
```

- Invitation validity: 72 hours.
- One pending invitation per member at a time (re-inviting revokes the previous one).

### Flow

1. Staff with a new `members.portal.invite` permission opens a member's profile and
   clicks **"دعوة للبوابة"**.
2. Server action (`lib/actions/member-portal.ts`) creates a `member_invitations` row,
   generates a raw token, stores only its hash, and builds the accept-invite URL
   (`/portal/accept-invite?token=...`).
3. A dialog then offers two independent send actions, both using the same link:
   - **Email:** uses `createAdminClient()` (existing service-role client) to send via
     Supabase's configured email system (same delivery path as
     `signUpAction`/verify-email).
   - **WhatsApp (manual):** opens `https://wa.me/<member.phone>?text=<encoded message
     with the link>` in a new tab; staff reviews and sends it themselves from their
     own WhatsApp. Requires the member to already have a phone number on file (falls
     back to email-only if not).
4. Owner opens the link, sets a password (`supabase.auth.signUp` under the hood,
   or `updateUser` if already provisioned), the accept-invite handler verifies the
   token hash + expiry, marks the invitation `accepted`, and sets
   `members.user_id`.
5. Expired/used tokens show a clear error with a "request a new invite" path (staff
   re-triggers step 2).

## Portal Route Group

`app/[locale]/(portal)/` — fully separate from `(app)`:

- `layout.tsx`: resolves the current user, looks up `members` by `user_id`; if none,
  redirect to `/portal/login` (a portal-specific login page, separate from staff
  `/auth/login` but reusing the same `signInPassword` call). Renders a lightweight
  sidebar (no admin/finance/platform nav).
- `page.tsx` (dashboard): current balance, last 5 movements, quick links.
- `statement/page.tsx`: reuses `getMemberStatementData` (already exists, already
  does the tenant + member check) rendered for the owner's own `member.id`, with
  the existing PDF export.
- `dues/page.tsx`: list of open dues (`status in ('PENDING','PARTIALLY_PAID')`)
  with checkboxes, running total, and a "ادفع الآن" button.
- `payments/page.tsx`: payment history (POSTED + pending online transactions) with
  receipt PDF links (reuses `payment-receipt-pdf.ts`).
- `units/page.tsx`: owned units (from `unit_ownerships`).

## Online Payment Flow

### Schema

```sql
create table public.online_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  provider text not null check (provider in ('PAYMOB', 'FAWRY')),
  provider_reference text,            -- set once the provider returns a session/order id
  amount numeric(19,4) not null check (amount > 0),
  allocations jsonb not null,         -- [{due_id, amount}, ...] chosen by the owner
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  payment_id uuid references public.payments (id), -- set on success
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_online_txn_provider_ref
  on public.online_payment_transactions (provider, provider_reference)
  where provider_reference is not null;
```

### Steps

1. Owner selects dues on `/portal/dues`, picks a provider, clicks pay.
2. Server action validates the dues belong to this member/org and are still open,
   inserts a `PENDING` `online_payment_transactions` row, then calls
   `lib/payments/provider.ts`'s `createCheckoutSession(provider, transaction)` —
   which dispatches to `paymob.ts` or `fawry.ts`. Each returns a redirect URL (or,
   for Fawry's reference-code flow, a payment code to display) and the
   `provider_reference`, which is written back onto the transaction row.
3. Owner is redirected to the provider's hosted payment page (or shown the Fawry
   reference code) and pays there — card data never touches ResortOS.
4. Provider calls back to `app/api/webhooks/paymob/route.ts` or
   `.../fawry/route.ts`. Each handler:
   - Verifies the provider's signature (Paymob HMAC, Fawry security-key hash) using
     placeholder secrets from env.
   - Looks up the transaction by `provider_reference`.
   - On success, calls `record_online_payment(p_transaction_id)` via the
     **service-role** client (webhook has no user session).
   - On failure/expiry, marks the transaction `FAILED`/`EXPIRED`.
5. `record_online_payment` (new SQL function, `security definer`) re-validates the
   transaction is `PENDING`, re-checks the dues still have remaining balance,
   builds the same journal-entry + payment_allocations + due-status-update logic
   `record_payment` already uses (factored so both call a shared internal helper
   rather than duplicating the accounting logic), sets `payments.idempotency_key =
   'online:' || transaction_id` so a re-delivered webhook is a no-op, and stamps
   `online_payment_transactions.status = 'PAID'` + `payment_id`.
6. Owner's `/portal/payments` page shows the new payment once posted; if they're
   still on the provider's redirect-back page, that page polls transaction status
   and shows success/failure.

### Provider abstraction

```ts
// lib/payments/provider.ts
export interface PaymentProvider {
  createCheckoutSession(txn: OnlinePaymentTransaction): Promise<{
    providerReference: string;
    redirectUrl?: string;   // Paymob: iframe/checkout URL
    referenceCode?: string; // Fawry: pay-at-outlet code
  }>;
  verifyWebhookSignature(payload: unknown, headers: Headers): boolean;
  parseWebhookEvent(payload: unknown): { providerReference: string; status: "PAID" | "FAILED" };
}
```

`paymob.ts` and `fawry.ts` each implement this against env vars
(`PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_HMAC_SECRET`,
`FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY`) — all placeholder values until real
credentials exist. No behavior depends on the values being real; the flow is
fully exercised with fake keys against each provider's sandbox base URL.

## Security (RLS)

New policies, additive only — nothing existing is modified:

- `members`: owner can `select` their own row (`user_id = auth.uid()`).
- `dues`, `payments`, `payment_allocations`, `units`, `unit_ownerships`: owner can
  `select` rows where `member_id`/`unit_id` resolve back to their own `members.id`.
- `online_payment_transactions`: owner can `select`/`insert` their own; `update`
  reserved for the service-role webhook path only (no owner-facing update policy).
- `member_invitations`: no owner-facing policy — staff-only via existing
  organization-membership RLS, service-role for the accept-invite handler.
- Webhook routes use `createAdminClient()` (service role, bypasses RLS) strictly
  after signature verification — never trust an unverified payload.

## Error Handling

- Invite: expired/revoked/already-accepted token → explicit Arabic error + "اطلب
  دعوة جديدة" messaging; no silent failures.
- Payment creation: due already paid by someone else between page load and
  submit → re-validate server-side, reject with `DUE_ALREADY_SETTLED` before
  calling the provider.
- Webhook signature failure → 401, logged, transaction untouched (prevents
  spoofed "paid" callbacks).
- Webhook for unknown `provider_reference` → 404, logged (defensive; shouldn't
  happen if step 2 always writes the reference first).
- Double webhook delivery → idempotency key makes the second call a no-op returning
  the same `payment_id`.
- Provider timeout/redirect abandoned → transaction stays `PENDING`; a scheduled
  cleanup (or lazy check on next portal visit) marks stale `PENDING` rows past a
  TTL as `EXPIRED` so owners aren't shown a payment stuck forever.

## Testing

- **pgTAP:** RLS isolation (owner A cannot see owner B's dues/payments/units);
  `record_online_payment` idempotency (same transaction id posted twice → one
  payment); `record_online_payment` rejects a transaction whose dues no longer
  have remaining balance.
- **Vitest:** provider abstraction unit tests (signature verification for both
  providers, event parsing) using recorded sample payloads; server actions for
  invite creation and accept-invite token validation.
- **Playwright:** full path — staff invites an owner → owner accepts invite and
  sets password → owner logs into `/portal` → selects dues → completes a mocked
  provider checkout → payment appears in history with a downloadable receipt.
