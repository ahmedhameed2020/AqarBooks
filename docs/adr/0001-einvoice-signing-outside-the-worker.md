# ADR 0001 — ETA/ZATCA signing happens outside the Cloudflare Worker

- **Status:** Accepted
- **Date:** 2026-08-18
- **Supersedes:** nothing
- **Related:** `lib/einvoice/types.ts`, `supabase/migrations/20260908000001_einvoice_core.sql`

## Context

AqarBooks must file statutory e-invoices with the Egyptian Tax Authority (ETA),
and later with Saudi Arabia's ZATCA. Both require the taxpayer to sign each
document with a certificate before submission — ETA with a CAdES-BES signature,
ZATCA with an XML digital signature and cryptographic stamp.

The application deploys to **Cloudflare Workers** (`opennextjs-cloudflare
deploy`). That runtime has no access to host hardware and offers only Web Crypto.
In Egypt the signing certificate is normally held on a **USB e-signature token
or an HSM**, and the private key is not exportable by design.

So the constraint is not a preference. A Worker cannot reach a USB token, cannot
host an HSM client, and must not be handed a raw private key as a substitute for
either. Discovering this after an ETA adapter is written would mean rebuilding
it.

## Decision

**Signing is performed by a dedicated server-side Signing Service, never inside
the Worker.**

```text
Cloudflare Worker
        │  authenticated internal HTTPS
        ▼
Signing Service
        │
        ▼
USB token / cloud HSM / Egyptian signing provider
        │
        ▼
ETA preprod → ETA production
```

The Worker sends a **digest** to be signed and receives a **signature**. It never
receives, stores, or derives the private key, and it does not assume any
particular hardware exists behind the service.

The Signing Service exposes one stable internal interface, so its implementation
can be swapped without touching the application:

```text
POST /v1/sign
{ tenantId, certificateAlias, digest, algorithm }

200
{ signature, certificateReference, keyId }
```

Three implementations are anticipated behind that one contract: a machine or
container with a USB token attached, a cloud HSM, and a commercial Egyptian
signing provider. The choice between them is a deployment decision, not an
application one, and is deliberately left open.

### Constraints that travel with this decision

- The private key never reaches the Worker, the application database, or any
  environment variable in either.
- Neither document payloads nor produced signatures are written to logs. The
  existing rule for authority exchanges applies unchanged: only redacted
  summaries reach `einvoice_submission_attempts`.
- The signing step stays behind `EInvoiceAdapter.sign()`, so this decision
  changes no schema and no service-layer code. `lib/einvoice/service.ts` already
  treats signing as an opaque adapter call.

## Consequences

**Accepted:** an additional deployed component, with its own availability and
authentication story. A signing outage blocks filing — which is correct, since
filing unsigned documents is not an option.

**Gained:** the runtime constraint stops being a blocker. Work that does not
depend on credentials or certificates proceeds now, and the adapter becomes a
single file once credentials arrive.

**Explicitly deferred until credentials and a certificate exist:** a live ETA
adapter, real document signing, any migration that stores certificates or
secrets, ETA production enablement, and ZATCA entirely — the last until Saudi
Arabia is a confirmed near-term market with its own requirements gathered.

## Why not the alternatives

**Sign inside the Worker with a key in an environment variable.** Requires
exporting a private key that is deliberately non-exportable, and puts statutory
signing material in the same blast radius as the web tier. Rejected on both
counts.

**Move the whole application off Workers.** Solves signing by discarding a
deployment model that works well for everything else. Disproportionate.

**Use a signing provider directly from the Worker.** Viable for one provider,
but hard-codes that provider's API into the application and forecloses the USB
token and HSM options. The internal interface above keeps all three open at the
cost of one indirection.
