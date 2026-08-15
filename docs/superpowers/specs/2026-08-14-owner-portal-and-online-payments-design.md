# Owner Portal & Online Payments — Design Spec

**Date:** 2026-08-14 (revised after review)
**Area:** New route group `app/[locale]/(portal)/`, new `lib/payments/` provider layer, new webhook routes, schema additions
**Type:** New feature (P0 gap from system review)
**Status:** Approved (design, v2), pending implementation plan

## Revision note

This is a revision of the original 2026-08-14 draft after a security/accounting
review. The overall direction (separate `(portal)` route group, provider
abstraction, webhook-confirmed payments) is unchanged. What changed: the invite
mechanism now uses Supabase's server-side admin invite APIs instead of open
`signUp`; the transaction table gained integrity fields and a separate
allocations table; `record_online_payment` is specified as an atomic,
lock-ordered, idempotent-replay function that shares accounting logic with
`record_payment` instead of duplicating it; webhook handling gained explicit
replay/timing/logging rules; and the work is now split into five independently
shippable phases, with **no online payment shipping until phases 1–2 are done
and tested**.

## Goal

Give resort/compound owners (`members`) a self-service portal to view their account
and pay outstanding dues online, without touching the existing staff-facing `(app)`
route group, its RLS policies, or `record_payment`'s permission model. Members
currently have no login at all — this spec adds one, scoped tightly to their own
data.

## Scope

**In scope**

- `members.user_id` link + invitation flow (email via Supabase's server-side admin
  invite APIs, and a manual WhatsApp share link built from the same one-time token).
- New `(portal)` route group: dashboard, statement, dues (with selection), payment
  history, owned units — read access to the owner's own data only.
- Online payment: owner selects one or more open dues, pays via Paymob or Fawry
  (both, behind a provider abstraction), confirmed via webhook only.
- New tables: `member_invitations`, `online_payment_transactions`,
  `online_payment_transaction_allocations`.
- New SQL function `record_online_payment` (separate from `record_payment`'s
  permission gate, but sharing its accounting logic via an internal helper).
- New RLS policies scoped to `members.user_id = auth.uid()`, via a
  `current_member_id()` helper — no client-supplied `organization_id`/`resort_id`
  is ever trusted; both are derived server-side from the authenticated member.
- Provider abstraction (`lib/payments/provider.ts`) with `paymob.ts` and `fawry.ts`
  adapters, each with its own signature-verification logic and payload fixtures,
  built against placeholder/sandbox env vars (no real merchant credentials
  available yet).

**Out of scope**

- Any change to existing staff RLS policies, `record_payment`'s permission model,
  or the `(app)` route group.
- WhatsApp Business API / automated messaging (this spec only adds a manual
  `wa.me` deep-link the staff member clicks and sends themselves).
- Real Paymob/Fawry merchant onboarding — env vars are placeholders until the user
  supplies real credentials; the exact Paymob integration path (there are several)
  and the exact Fawry product/API are pinned in Phase 4, not assumed here.
- Partial/custom-amount payment. Payment is all-or-nothing against the owner's
  selected dues — see "Settlement race policy" below.
- Bank reconciliation, WhatsApp reminders, lease management — tracked separately
  in the system-review roadmap.

## Decisions (locked during brainstorming, reconfirmed in review)

1. **V1 includes online payment**, but ships in phases — read-only portal first
   (Phase 1), payment only after RLS/schema are built and isolation-tested
   (Phases 2–5).
2. **Both Paymob and Fawry**, via a shared provider interface, each with its own
   adapter and independently verified signature logic.
3. **Sandbox/placeholder credentials** — build the full flow, read keys from env,
   real keys added later without code changes. Base URLs and API versions are
   also env-driven (`PAYMOB_BASE_URL`, `FAWRY_BASE_URL`, `PAYMOB_API_VERSION`,
   `FAWRY_API_VERSION`) so pinning the real integration path later doesn't
   require a redeploy of application code.
4. **Login model:** invite created and delivered server-side via Supabase's admin
   invite APIs, not client-side `signUp`. **Plus:** a manual WhatsApp share option
   carrying the same one-time link.
5. **Payment selection UX:** owner checks specific open dues; total is computed
   from the selection. All-or-nothing settlement (see below) — no silent partial
   payment.

## Identity & Invitation Flow

### Why not client-side `signUp`

The original draft had the owner's password-set step call `supabase.auth.signUp`
directly. That path lets any caller create/claim an auth user for an arbitrary
email with no server-side control over which `members` row it attaches to. The
revised flow moves both invite creation *and* invite delivery server-side, using
Supabase's admin APIs (`auth.admin.generateLink` / `inviteUserByEmail`), and
performs the `members.user_id` link inside a single transaction that re-verifies
the token server-side — the client never gets to assert "I am member X."

### Schema

```sql
alter table public.members
  add column user_id uuid references auth.users (id) unique;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  email text not null,
  token_hash text not null,        -- sha256 of the raw token; raw token never stored or logged
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users (id),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_member_invitations_pending_per_member
  on public.member_invitations (member_id) where status = 'pending';
```

- Invitation validity: 72 hours from creation, enforced both at accept-time and
  by a periodic sweep that flips expired `pending` rows to `expired`.
- One pending invitation per member at a time — creating a new one first sets any
  existing `pending` row for that member to `revoked` (same transaction).
- The raw token is a cryptographically random value generated server-side; only
  its SHA-256 hash is persisted. It is never written to logs, analytics, or
  `platform_audit_logs`'s `safe_change_summary` — only a redacted marker
  (`invitation_id`) is.

### Flow

1. Staff with a new `members.portal.invite` permission opens a member's profile
   and clicks **"دعوة للبوابة"**.
2. Server action (`lib/actions/member-portal.ts`, using `createAdminClient()`)
   revokes any existing pending invitation for this member, creates a new
   `member_invitations` row, and generates the invite link via Supabase's admin
   API against `member.email` (the invited email is fixed to what's on file —
   staff cannot redirect the invite to an arbitrary address from the UI).
3. A dialog then offers two independent send actions, both carrying the same link:
   - **Email:** delivered directly by Supabase's admin invite call (same
     delivery path already used for staff account emails) — no separate SMTP
     integration needed.
   - **WhatsApp (manual):** opens `https://wa.me/<member.phone>?text=<encoded
     message with the link>` in a new tab; staff reviews and sends it themselves.
     Requires a phone number on file; falls back to email-only otherwise. The
     token in the URL is one-time and 72h-lived exactly as the email link is —
     no separate, looser token is minted for this path.
4. Owner opens the link and lands on `/portal/accept-invite`. **This step spans
   two systems that do not share a transaction** — Supabase's Auth admin API
   (creates/confirms the `auth.users` row and the session) and Postgres (links
   `members.user_id`) — so the design does not claim a single atomic operation
   across both. Instead:
   - The Admin API call that creates/confirms the invited auth user happens
     first. At this point the auth user exists but is **not yet usable** — no
     `members` row points at it.
   - The handler then calls a dedicated Postgres RPC,
     `accept_member_invitation(p_token uuid)`, run as the now-authenticated
     invitee (`auth.uid()` is this new user). This RPC, in one Postgres
     transaction: hashes the token, looks up a `pending`, non-expired
     `member_invitations` row by hash, confirms the invitation's `email`
     matches `auth.jwt() ->> 'email'` (server-verified, not a client-supplied
     value), sets `members.user_id = auth.uid()` **only if `members.user_id`
     is currently null**, and marks the invitation `accepted` with
     `accepted_user_id = auth.uid()`.
   - Any mismatch (wrong email, member already linked to a different user,
     token not found/expired/revoked) makes the RPC raise, and the Postgres
     side changes nothing.
   - **Compensating policy for the gap between the two calls:** until the RPC
     succeeds, the auth user is linked to no `members` row and therefore fails
     the `(portal)` layout's guard on every route — it is inert, not merely
     "linked but powerless." If the RPC fails or the owner abandons the flow
     before calling it, the auth user is left in this inert state; a periodic
     sweep (same job that expires stale invitations) also disables
     (`auth.admin.updateUserById({ ban_duration: ... })`, or deletes if never
     used) any auth user whose invite expired without a successful RPC call.
     This is a best-effort cleanup, not a correctness requirement — the guard
     alone is what keeps an unlinked auth user from doing anything, in every
     case, immediately.
5. `members.user_id` is immutable through this flow once set — changing it after
   the fact (e.g. re-assigning portal access) is an explicit admin-only action,
   not implemented in this feature; out of scope for V1.

## Portal Route Group

`app/[locale]/(portal)/` — fully separate from `(app)`:

- `layout.tsx`: resolves the current user, looks up `members` by `user_id`; if
  none, redirect to `/portal/login` (a portal-specific login page, separate from
  staff `/auth/login`). Renders a lightweight sidebar (no admin/finance/platform
  nav).
- `page.tsx` (dashboard): current balance, last 5 movements, quick links.
- `statement/page.tsx`: reuses `getMemberStatementData` (already exists, already
  does the tenant + member check), scoped to the owner's own `member.id`, with
  the existing PDF export.
- `dues/page.tsx`: list of open dues (`status in ('PENDING','PARTIALLY_PAID')`)
  with checkboxes, running total, and a "ادفع الآن" button.
- `payments/page.tsx`: payment history (only `payments` rows that are POSTED —
  see "when a payment appears" below) with receipt PDF links (reuses
  `payment-receipt-pdf.ts`).
- `units/page.tsx`: owned units (from `unit_ownerships`).

All portal queries resolve `organization_id`/`resort_id`/`member_id` **server-side
from the authenticated `members` row**, never from a client-supplied parameter —
this is enforced both in the RLS policies (below) and in the server actions
themselves (defense in depth), since a bug in one layer must not be enough to
cross a tenant boundary.

## RLS Design

A single helper centralizes the identity lookup so every policy is written the
same, testable way:

```sql
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid();
$$;
```

`current_member_id()` takes **no parameters** — it derives everything from
`auth.uid()` and nothing else, so there is no argument shape that would let a
caller ask "what if I were member X." Its contract:

- `stable`, `security definer`, `set search_path = public` (pinned, not
  inherited from the caller's session, so it can't be redirected by a hostile
  `search_path`).
- `members.user_id` already has a `unique` constraint (added above), so the
  underlying query structurally cannot return more than one row regardless of
  data state.
- An unlinked/staff-only user (`auth.uid()` matches no `members.user_id`)
  returns `NULL`, not an error — every policy that calls it therefore denies
  access via `NULL = <anything>` evaluating to unknown/false, rather than the
  policy needing its own special-case.
- Every RLS policy below calls this and only this to resolve identity — none
  of them accept or trust an `organization_id`, `resort_id`, or `member_id`
  read from the row/request being evaluated as an *alternate* path to
  authorization; those columns are used only to join, never to authorize.
- Phase 1 pgTAP coverage: called as a linked owner (returns their id), called
  as a staff user with no `members.user_id` (returns `NULL`), called as an
  unauthenticated role (returns `NULL`), and one test per policy confirming no
  policy has a fallback branch that authorizes via a client-supplied id when
  `current_member_id()` is `NULL`.

Policies (additive only — nothing existing on these tables is modified):

- `members`: owner can `select` where `id = current_member_id()`.
- `unit_ownerships`: owner can `select` where `member_id = current_member_id()`.
- `units`: owner can `select` where `id in (select unit_id from unit_ownerships
  where member_id = current_member_id())`.
- `dues`: owner can `select` where `member_id = current_member_id()` **or**
  `unit_id in (owner's units)` — matching however `dues` already associates to a
  member/unit today; confirmed against the existing `dues` schema during Phase 2
  implementation, not assumed here.
- `payments`, `payment_allocations`: owner can `select` their own via the same
  `member_id`/`unit_id` → `current_member_id()` chain, restricted to `payments`
  rows with `status = 'POSTED'`.
- `online_payment_transactions`: owner can `select` own; `insert` own (with
  `member_id` forced to `current_member_id()` at the RLS level via `with check`,
  not merely trusted from the insert payload); no owner-facing `update` policy —
  updates happen only via the service-role webhook path, which bypasses RLS
  after signature verification.
- `online_payment_transaction_allocations`: owner can `select` via join to their
  own transactions.
- `member_invitations`: no owner-facing policy at all — staff-only via existing
  organization-membership RLS; the accept-invite handler itself runs through
  `createAdminClient()` (service role) since the invitee isn't linked yet at that
  point.

Every new policy gets a pgTAP test in Phase 1/2 proving: (a) the intended access
works, (b) a different owner (or a plain staff member with no `members.user_id`)
is denied, and (c) denial holds even when the other owner's UUIDs are known and
passed explicitly — RLS, not obscurity, is what's being tested.

## Online Payment Flow

### Schema

```sql
create table public.online_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  client_request_id text not null,     -- generated once client-side, forwarded unchanged on retry
  provider text not null check (provider in ('PAYMOB', 'FAWRY')),
  provider_reference text,             -- set once the provider returns a session/order id
  provider_payload jsonb,              -- last raw provider response/event, for audit (redacted of secrets)
  amount numeric(19,4) not null check (amount > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  failure_code text,
  failure_message text,
  payment_id uuid references public.payments (id),
  webhook_event_id text,               -- provider's event/notification id, for replay dedup
  webhook_received_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null,     -- checkout session TTL; stale PENDING rows past this are swept to EXPIRED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_online_txn_client_request
  on public.online_payment_transactions (organization_id, client_request_id);

create unique index idx_online_txn_provider_ref
  on public.online_payment_transactions (provider, provider_reference)
  where provider_reference is not null;

create unique index idx_online_txn_webhook_event
  on public.online_payment_transactions (provider, webhook_event_id)
  where webhook_event_id is not null;

-- amount/allocations/provider/member/org are immutable once the transaction
-- leaves PENDING (checkout already created against the original amount).
create or replace function public.forbid_online_txn_mutation_after_pending()
returns trigger language plpgsql as $$
begin
  if old.status <> 'PENDING' and (
    new.amount <> old.amount or
    new.organization_id <> old.organization_id or
    new.member_id <> old.member_id or
    new.provider <> old.provider
  ) then
    raise exception 'ONLINE_TXN_IMMUTABLE: cannot modify a settled transaction' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger trg_online_txn_immutable
  before update on public.online_payment_transactions
  for each row execute function public.forbid_online_txn_mutation_after_pending();

create table public.online_payment_transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.online_payment_transactions (id) on delete cascade,
  due_id uuid not null references public.dues (id),
  amount numeric(19,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, due_id)
);
```

`allocations` moved out of `jsonb` and into a proper child table for reporting
and audit; the transaction row keeps `amount` as the sum, checked against the
allocation rows at creation time (application-level check, mirrored by a pgTAP
test — a DB-level `CHECK` across tables isn't expressible directly, so this is
enforced at the point of insert inside the same server action/transaction that
creates both rows).

### Steps

1. Owner selects dues on `/portal/dues`, picks a provider, clicks pay. The client
   generates a `client_request_id` (random UUID) once and keeps it fixed across
   any retry of the same submit (network drop, double-click) — mirrors the
   existing `idempotency_key` pattern already used by `record_payment` callers.
2. Server action validates the dues belong to `current_member_id()` and are
   still open (re-checked against live `dues` state, not client-cached data),
   inserts a `PENDING` `online_payment_transactions` row (`organization_id`/
   `resort_id`/`member_id` all derived server-side, never taken from the
   client) plus its `online_payment_transaction_allocations`, then calls
   `lib/payments/provider.ts`'s `createCheckoutSession(provider, transaction)`.
   If a row with the same `(organization_id, client_request_id)` already exists,
   that existing row is reused instead of creating a duplicate checkout.
3. Owner is redirected to the provider's hosted payment page (or shown Fawry's
   reference code) and pays there — card data never touches ResortOS. **The
   redirect-back page is informational only** — it never marks anything paid; it
   polls `online_payment_transactions.status` and shows "بانتظار تأكيد الدفع"
   until the webhook lands, or the final state once it has.
4. Provider calls back to `app/api/webhooks/paymob/route.ts` or
   `.../fawry/route.ts`. Each handler, in order:
   - Reads the **raw** request body (required for signature verification —
     framework body-parsing must not run first).
   - Verifies the provider's signature using a constant-time comparison
     (`crypto.timingSafeEqual` or equivalent) against secrets from env. A
     failed check returns `401` immediately, changes no state, and logs the
     failure without the raw payload.
   - Rejects a structurally invalid payload with `400` before any lookup.
   - Deduplicates on `(provider, webhook_event_id)`: if already recorded, `200`
     no-op — protects against provider retries and event replay.
   - Looks up the transaction by `provider_reference`. **Never reveals via
     status code or timing whether a given reference exists** — an unmatched
     reference and an internal error both return a generic `200` to the
     provider (providers commonly retry on non-2xx, so this also prevents a
     misconfigured/attacker-guessed reference from becoming a retry
     amplifier). Internally, an unmatched reference is still logged — just not
     leaked in the response — with a structured record containing
     `event = 'unknown_reference'`, `provider`, `webhook_event_id`, and
     `signature_verified = true` (this log entry only fires *after* signature
     verification passed, so it's meaningful evidence rather than attacker
     noise). A signature failure keeps returning `401` and is logged
     separately with `event = 'signature_invalid'`, `provider`, and a hash of
     the payload rather than the raw payload — never the full body if it may
     carry cardholder or otherwise sensitive data.
   - On a verified success event, calls `record_online_payment(p_transaction_id,
     p_webhook_event_id, p_provider_payload)` via the **service-role** client.
   - On a verified failure/expiry event, updates the transaction to
     `FAILED`/`EXPIRED` with `failure_code`/`failure_message` from the payload.
   - Uses an HTTP timeout on any outbound call the handler itself makes (e.g. a
     confirmatory GET back to the provider, if the integration path requires
     one) and treats provider-side timeouts as "unconfirmed," never as success.
5. `record_online_payment` (new SQL function, `security definer`) is atomic and
   safely re-playable:
   ```text
   select transaction FOR UPDATE
   if status = 'PAID': return existing payment_id (idempotent replay, not an error)
   if status not in ('PENDING'): raise (can't post a FAILED/EXPIRED transaction)
   lock the target dues FOR UPDATE, in a fixed order (e.g. by due_id) to avoid
     deadlocking against concurrent staff-side record_payment calls
   re-check each due's remaining balance against its allocation amount
   if ANY allocation no longer fits (see "Settlement race policy" below):
     mark transaction FAILED with failure_code = 'DUE_SETTLED_ELSEWHERE', return error
   else:
     call the SAME internal accounting helper record_payment uses (extracted in
       this phase so both call it — no duplicated journal/allocation logic)
     set payments.idempotency_key from a column, not string concatenation, e.g.
       a UNIQUE (organization_id, source, source_id) shape shared with the
       existing idempotency_key column, guaranteed at the DB level by a unique
       index — not merely a code convention
     insert online_payment_transaction rows' due status updates
     set online_payment_transactions.status = 'PAID', payment_id, paid_at,
       webhook_event_id, webhook_received_at = now()
     write platform_audit_logs entry
     return payment_id
   ```
   The `record_payment`/`record_online_payment` shared accounting core is a new
   internal function, `public.post_payment_internal(...)`, that is **not a
   callable API** — it is an implementation detail shared by the two RPCs that
   already did their own authorization:
   ```sql
   revoke execute on function public.post_payment_internal from public;
   revoke execute on function public.post_payment_internal from authenticated;
   revoke execute on function public.post_payment_internal from anon;
   -- left executable only by the function owner / other security definer
   -- functions that call it directly (record_payment, record_online_payment).
   ```
   It takes **already-validated** inputs only — org, resort, member, unit,
   amount, method, date, deposit account, fiscal period, allocations,
   idempotency key, cashier session or null — and trusts none of them as an
   authorization signal itself; by the time it's called, `record_payment` has
   already checked `has_permission` and `record_online_payment` has already
   confirmed the transaction's webhook-verified `PENDING` state, so
   `post_payment_internal` only does the accounting work: journal-entry
   creation/posting, the `payments` insert, `payment_allocations` inserts, and
   due-status updates — locking the target dues `FOR UPDATE` in a fixed order
   (e.g. sorted by `due_id`) so concurrent callers (a staff cashier posting
   against the same due at the same moment as a webhook) serialize instead of
   deadlocking. It returns a single structured result both callers can rely on:
   ```sql
   -- returns:
   --   payment_id        uuid
   --   allocated_amount  numeric(19,4)  -- sum actually allocated
   --   unallocated_amount numeric(19,4) -- always 0 today (full allocation is
   --                                       required by both callers), kept as
   --                                       an explicit field rather than an
   --                                       implicit assumption, so a future
   --                                       partial-allocation caller doesn't
   --                                       have to guess the contract
   --   affected_due_ids  uuid[]
   ```
   `record_payment` keeps its `has_permission` check and then calls the
   internal helper; `record_online_payment` does its own transaction/webhook-
   specific checks (including the settlement-race check below) and then calls
   the same helper. Neither duplicates the accounting logic, and neither is
   the security boundary that matters — `post_payment_internal`'s `revoke`s are
   what make it impossible to reach the accounting core by any path that
   skips both callers' checks.
6. Owner's `/portal/payments` page only ever shows `payments` rows with
   `status = 'POSTED'` — i.e. a payment becomes visible in the portal at exactly
   the same moment it's real, never earlier (no "pending" payment rows are
   surfaced as if they were postings).

### Settlement race policy

Scenario: owner selects dues A and B; before the webhook lands, someone else
(staff, or another payment) settles A first.

**Decision:** all-or-nothing. `record_online_payment` requires every allocation
in the transaction to still fit against its due's current remaining balance. If
even one no longer fits, **no payment is created at all** — the whole
transaction is marked `FAILED` with `failure_code = 'DUE_SETTLED_ELSEWHERE'` and
a message identifying which due. The owner sees a clear explanation on
`/portal/payments` ("تم سداد أحد الاستحقاقات المختارة من مصدر آخر قبل تأكيد
دفعتك — لم يُخصم أي مبلغ, يرجى إعادة المحاولة") and can re-select and retry.
Money was never actually captured by the provider until the owner completed
checkout, so this only rejects *recording* a payment whose allocations are now
stale — it does not touch already-settled provider funds; provider-side refund
handling for this edge case is a Phase 4 implementation detail to confirm
against each provider's actual settlement timing, not assumed here. Partial
settlement (posting whatever still fits) is explicitly rejected as a design —
it would silently pay less than the owner authorized and complicate refund
semantics; it can be revisited later as an explicit, opt-in policy if needed.

### Provider abstraction

```ts
// lib/payments/provider.ts
export interface PaymentProvider {
  createCheckoutSession(txn: OnlinePaymentTransaction): Promise<{
    providerReference: string;
    redirectUrl?: string;   // Paymob: iframe/checkout URL
    referenceCode?: string; // Fawry: pay-at-outlet / reference code
  }>;
  verifyWebhookSignature(rawBody: Buffer, headers: Headers): boolean; // constant-time compare
  parseWebhookEvent(rawBody: Buffer): {
    providerReference: string;
    webhookEventId: string;
    status: "PAID" | "FAILED";
    failureCode?: string;
    failureMessage?: string;
  };
}
```

`paymob.ts` and `fawry.ts` each implement this independently — **no shared
"generic HMAC" helper that both lean on**, since the two providers' signature
construction (field selection, ordering, hash algorithm) differ and don't share
implementation without risking a subtly-wrong verification for one of them.
Each adapter ships with its own recorded sample payload fixtures (success,
failure, tampered-signature) used in its Vitest suite. Env vars:
`PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_HMAC_SECRET`,
`PAYMOB_BASE_URL`, `PAYMOB_API_VERSION`, `FAWRY_MERCHANT_CODE`,
`FAWRY_SECURITY_KEY`, `FAWRY_BASE_URL`, `FAWRY_API_VERSION` — all placeholders
until real credentials exist; none of these are ever sent to the client bundle
(server-only module, enforced by the existing `server-only` package already used
elsewhere in `lib/`).

Which exact Paymob integration path (there are several: Intention API, the
older Auth/Order/Payment-Key flow, etc.) and which exact Fawry product
(Hosted Checkout vs. reference-code/pay-at-outlet) get used is **pinned during
Phase 4**, once sandbox access is available — this spec commits to the
interface shape above, not to a specific upstream endpoint set, since the two
differ enough in request/response shape that guessing now risks a rewrite.

## Error Handling

- Invite: expired/revoked/already-accepted/mismatched-email token → explicit
  Arabic error + "اطلب دعوة جديدة" path; no partial state (either the whole
  accept transaction commits or nothing changes).
- Payment creation: due already settled between page load and submit →
  re-validated server-side before a checkout session is even created, rejected
  with `DUE_ALREADY_SETTLED` (distinct from the post-webhook race case above,
  which is caught later in `record_online_payment`).
- Webhook signature failure → `401`, logged without raw payload, no state
  change.
- Webhook for unmatched `provider_reference` → generic `200` + internal warning
  log only (see "never reveals via status code or timing" above).
- Duplicate webhook delivery (retry or genuine replay) → deduped on
  `(provider, webhook_event_id)` before reaching `record_online_payment`;
  `record_online_payment` itself is additionally idempotent on transaction
  status as a second layer.
- Settlement race (allocations no longer fit) → `FAILED` with
  `failure_code = 'DUE_SETTLED_ELSEWHERE'`, no payment created; see policy
  above.
- Provider timeout / abandoned redirect → transaction stays `PENDING` until
  `expires_at`; a sweep (cron or lazy check on next portal visit) flips stale
  `PENDING` rows past `expires_at` to `EXPIRED`.

## Testing

- **pgTAP:**
  - RLS isolation for every new/extended policy: intended access works; a
    different owner is denied even when passing the other owner's real UUIDs;
    a staff member with no `members.user_id` is denied entirely.
  - `current_member_id()` returns null (not an error) for a non-member user.
  - `record_online_payment` idempotent replay: same transaction posted twice
    (simulating a duplicate webhook past the event-id dedup layer) returns the
    same `payment_id`, creates exactly one `payments` row, one journal entry.
  - `record_online_payment` settlement race: a due settled between transaction
    creation and webhook arrival causes `FAILED` + zero payments created, not a
    partial payment.
  - `online_payment_transactions` immutability trigger: mutating `amount` on a
    non-`PENDING` row raises.
  - Balance invariant: every journal entry `record_online_payment` produces is
    balanced (debits = credits) — reuse the existing financial-suite balance
    assertions already applied to `record_payment`.
- **Vitest:**
  - Provider adapters: signature verification (valid, tampered, wrong-secret)
    and event parsing for both Paymob and Fawry, against recorded fixtures.
  - Webhook route handlers: raw-body handling, 400 on malformed payload, 401 on
    bad signature, 200-no-op on duplicate event id, 200-generic on unmatched
    reference.
  - Invite server actions: token hashing, expiry, revoke-on-reinvite,
    email-mismatch rejection at accept time.
- **Playwright:**
  - Full path: staff invites an owner → owner accepts invite and sets password
    → owner logs into `/portal` → selects dues → completes a mocked provider
    checkout → webhook (simulated) → payment appears in history with a
    downloadable receipt.
  - Double-webhook-delivery scenario shows exactly one payment.
  - Settlement-race scenario (due paid by staff mid-flow) shows the owner a
    clear failure, not a wrong/partial payment.

## Acceptance Criteria

- An owner in Resort A cannot see Resort B's data even when the exact UUIDs are
  known and passed directly (query param tampering, devtools, etc.).
- A user with no `members.user_id` cannot reach any `/portal/*` page.
- An expired, already-used, or revoked invitation token does not work.
- Accepting an invitation can never link `members.user_id` to a different
  member than the one invited, and never re-links an already-claimed member.
- An unsigned or badly-signed webhook changes no database state.
- A duplicate webhook delivery (same event id) results in exactly one payment,
  not two, and returns the same `payment_id` both times.
- A provider "success" event for a `provider_reference` that doesn't exist in
  `online_payment_transactions` creates no payment.
- A transaction's `amount`/`allocations`/`provider`/`member_id`/`organization_id`
  cannot be changed once it has left `PENDING`.
- The online payment path never checks or uses staff `has_permission` grants —
  it is authorized purely by the owner's own identity and the transaction's
  webhook-verified state.
- Any failure between creating the `payments` row and finishing the rest of
  `record_online_payment`'s work rolls back completely (single DB transaction;
  no partially-posted payment).
- A payment never appears on `/portal/payments` before it is `POSTED` — the
  portal never shows a `PENDING` transaction as if it were a completed payment.

## Phased Implementation Plan

Each phase ships and is tested independently. **Online payment (Phases 3–5)
does not start until Phases 1–2 are merged and their test suites pass** — Phase
2's exit gate specifically includes confirming isolation in an actual browser
session, not only via pgTAP.

### Phase 1–2 status: complete, Checkpoint 4 passed (2026-08-15)

Phases 1 and 2 (Tasks 1–15, plus a Checkpoint 2 security review after Phase 1)
are implemented, committed on `fix/units-excel-export`, and verified against
the live Supabase project (`ataslxkcflxuilpgyepm`). Checkpoint 4's full
verification suite passed:

- `npx tsc --noEmit` — clean.
- `npm run test:sql`, `test:financial`, `test:suppliers`,
  `test:payment-idempotency`, `test:member-portal` — all green.
- Full `npx playwright test` (90 specs) — 87 passed. The 3 failures are
  accounted for, none are portal regressions:
  - **`REG-011` (en/ar)** in `tests/e2e/finance-isolation-and-locale.spec.ts` —
    a pre-existing, unrelated Playwright strict-mode selector collision in the
    staff cashier UI test (`getByRole('option', {name: /656.00/})` matches two
    elements). Predates this feature; no code in this feature touches the
    cashier due-selection UI this test exercises. **Known, not fixed as part
    of this feature** — tracked here so it isn't mistaken for a portal
    regression in a future run.
  - The third failure (`owner-portal-invite.spec.ts`, `ERR_CONNECTION_REFUSED`)
    was an artifact of running the full suite on port 3100 to route around an
    unrelated local service occupying port 3000 — not a code defect. Fixed for
    portability (the test no longer hardcodes port 3000) and independently
    re-verified passing multiple times.
- `npm run build` — succeeds, all portal routes registered.

Two-owner, two-organization browser-level isolation is proven end-to-end
(`tests/e2e/owner-portal-isolation.spec.ts`), not only via pgTAP.

### Phase 1 — Identity, invites, login

- `members.user_id`, `member_invitations`.
- Invite creation/revoke-on-reinvite, `accept_member_invitation` RPC, email
  send + manual WhatsApp link, the auth-user/Postgres linking flow and its
  compensating cleanup sweep (see "Identity & Invitation Flow" above).
- `current_member_id()` helper.
- `(portal)` layout guard and login page (guard alone is what makes an
  inert/unlinked auth user powerless, per the compensating policy above).
- pgTAP: invitation token lifecycle (expiry, revoke, reuse rejection),
  `current_member_id()` contract tests, RLS on `members` itself.

**Exit gate:** RLS isolation tests and invite-token tests green.

### Phase 2 — Portal read-only pages

- Dashboard, statement (`getMemberStatementData` reused), dues (list only, no
  payment action yet), payments history (existing `POSTED` payments only),
  units pages.
- RLS for `unit_ownerships`, `units`, `dues`, `payments`, `payment_allocations`,
  all via `current_member_id()`.
- Receipt PDF access scoped to the owner's own payments only.
- pgTAP: isolation tests for every policy added this phase (own access works,
  a different owner is denied with real UUIDs, a non-member is denied).
- Playwright: log in as an owner in a real browser session and confirm only
  that owner's dues/payments/units/statement are visible — this is the
  "owner sees only own data in browser" check, not just an RLS unit test.

**Exit gate:** owner sees only their own data in an actual browser session
(Playwright), on top of green pgTAP isolation tests. No payment capability
exists through the end of this phase — there is nothing to exploit even if
work stopped here.

### Phase 3 — Transaction data model

- `online_payment_transactions`, `online_payment_transaction_allocations`.
- `client_request_id`, `provider_reference`, `webhook_event_id` unique
  constraints; immutable-after-`PENDING` trigger.
- RLS for both new tables.
- `expires_at` + sweep job for stale `PENDING` rows.
- pgTAP: constraint/uniqueness tests, immutability-trigger test (including an
  attempted allocation-tampering update being rejected), invalid state
  transition tests (e.g. `PAID` → `PENDING`), RLS tests.
- Still no live provider calls — transactions can be created and inspected but
  nothing sends money anywhere yet.

**Exit gate:** invalid state transitions and allocation-tampering attempts are
rejected by the schema/trigger layer, proven by pgTAP — not by application
code discipline alone.

### Phase 4 — Accounting core + provider adapters

- `post_payment_internal` extracted from `record_payment`'s existing logic
  (with the `revoke execute` lockdown), reused by both `record_payment` and
  the new `record_online_payment`.
- `record_online_payment`: locking (fixed due order), idempotent replay,
  settlement-race handling, audit logging.
- `PaymentProvider` interface, `paymob.ts`, `fawry.ts` adapters, pinned against
  actual sandbox behavior once accessible, each with its own recorded fixtures
  (success/failure/tampered-signature) and Vitest suite.
- pgTAP: idempotent replay, settlement race, balance invariant (every journal
  entry produced is debit = credit).

**Exit gate:** provider signature fixtures green for both adapters, and
`record_online_payment`'s RPC test suite (replay, settlement race, balance
invariant) green.

### Phase 5 — Webhooks + payment UI + end-to-end

- `app/api/webhooks/paymob/route.ts`, `.../fawry/route.ts`: raw-body signature
  verification, replay/dedup on `webhook_event_id`, generic responses for
  unmatched references with internal-only structured logging, no sensitive
  payload logging.
- Dues selection + "ادفع الآن" checkout initiation on `/portal/dues`.
- Redirect/reference-code display, polling for status.
- Receipt display once `POSTED`.
- Playwright: full happy path; double-webhook-delivery scenario shows exactly
  one payment; settlement-race scenario (due paid by staff mid-flow) shows a
  clear failure with no partial payment; a stale/expired transaction retried
  by the owner starts a fresh checkout cleanly.

**Exit gate:** double-webhook, stale-due, retry, and all-or-nothing settlement
tests all green — this is the gate for calling online payment done, not just
"the happy path works."
