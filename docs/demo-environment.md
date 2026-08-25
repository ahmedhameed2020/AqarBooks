# The public demo environment

An operator's document. It covers what the demo is, how it is made safe, how to
provision it, and what must be verified before it is made public.

The commercial argument is elsewhere. This is the part that has to be right.

---

## 1. What it is

`/[locale]/demo` is a public entry page. Clicking through signs the visitor into
a curated, fully populated, **read-only** organization inside the production
database, and drops them on the real product's dashboard.

It is not a trial. No tenant is created, no account is registered, and nothing
the visitor does persists.

The lead-capture form that used to live at `/demo` now lives at
`/demo/request` and is unchanged.

---

## 2. Why the visitor is a real account and not an anonymous session

The Phase 1 security work revoked `EXECUTE` on every function in `public` from
the `anon` role, and `supabase/baseline/baseline_03_security_postamble.sql`
refuses to complete unless `anon` holds zero function privileges.

An anonymous Supabase session therefore cannot call a single application RPC.
Making the demo anonymous would mean granting `anon` back exactly the rights
that hardening removed — weakening production authorization to serve a
marketing surface.

So the demo signs in as a **real, pre-provisioned, permission-starved account**.
Its credentials live in server-only environment variables, are read inside a
Server Action, and are handed straight to Supabase. They never reach the
browser, a prop, or the HTML.

---

## 3. How it is made read-only

Three layers. Only the third is load-bearing; the other two exist so the
experience is coherent rather than merely safe.

### Layer 1 — the interface

The demo account's role grants no `*.manage` / `*.create` permission, and the
sidebar is already pruned server-side by permission
(`lib/auth/nav-permissions.ts`). Management screens are therefore absent from
the navigation rather than hidden with CSS, and page guards refuse the ones
reached by typing a URL.

### Layer 2 — the server

`lib/demo/guard.ts`. Every mutating server action calls `denyIfDemo()` before
touching anything, and every AI route passes through `demoAiGate()`.

`tests/demo-environment.test.ts` fails the build if a server action ships
without a guard and is not on the small, explicit sanctioned list. That test is
the reason this layer will still be true a year from now.

This layer exists for two things layer 3 cannot do: it returns a deliberate,
translated "this is a demo" refusal instead of a raw Postgres permission error,
and it covers the handful of write RLS policies that are not permission-keyed.
An audit of the baseline found nine such policies; all but one are
platform-admin-only or own-row, and the exception is
`property_import_logs_insert_member`, which any org member may insert.

### Layer 3 — the database

**This is the one that holds.**

The demo account is assigned the demo tenant's clone of the **`AUDITOR`** role
template. That template grants `.view` and `.read` keys and two others that
are not reads but are not writes either:

- `finance.audit.verify` — runs the SHA-256 audit-chain integrity check. It
  computes and compares; it writes nothing, and it is one of the better things
  in the demo to show a buyer.
- `finance.reports.export` — permits CSV/XLSX/PDF export. Kept deliberately, and
  the reason every export carries a `DEMO-` prefix and a fictional-data notice
  (§9).

It grants no `.manage`, `.create`, `.issue`, `.post`, `.approve` or `.void` key
of any kind.

`has_permission()` resolves `user_role_assignments → role_permissions →
permissions.key`. There are 222 `has_permission` call sites in the baseline:
every write RPC guards itself, and the write RLS policies are permission-keyed.
So the database refuses independently of every line of application code.

Nothing in this design required a schema change, a new permission, or a
relaxation of any existing policy.

### The one configuration that would defeat all three

`has_permission()` short-circuits to `true` for a platform admin. If the demo
account were ever made one, it would hold every write permission in the
product.

This is checked explicitly in two places rather than assumed: `startDemoSession()`
refuses entry and signs the account back out, and the Playwright gate asserts
`is_platform_admin` is false.

---

## 4. Configuration

Server-only. None of these are `NEXT_PUBLIC_*`, and none may become so.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DEMO_ORGANIZATION_ID` | yes | The demo tenant's UUID. The single canonical marker — everything else is downstream of it. |
| `DEMO_USER_EMAIL` | yes | The read-only account the public signs into. |
| `DEMO_USER_PASSWORD` | yes | Its password. |
| `DEMO_ORGANIZATION_SLUG` | no (defaults `aqarbooks-demo`) | Second safeguard, consulted by the seed only. |
| `DEMO_OWNER_EMAIL` | seeding only | The TENANT_OWNER account that performs the seed's financial postings. |
| `DEMO_OWNER_PASSWORD` | seeding only | Its password. |

**Unconfigured is the safe default.** With no `DEMO_ORGANIZATION_ID`,
`isDemoOrganization()` returns false for every organization — so no real tenant
can be mistaken for the demo and the guards are inert — and the entry page
refuses to start a session rather than signing someone into whatever account
the other variables happen to name.

A UUID rather than a slug is the marker because a slug is editable by anyone
holding `tenant.settings.manage` in a normal tenant. `organizations.id` is
editable by no one.

---

## 5. Provisioning

Nothing here is automated end to end, on purpose: each step is a decision.

0. **Review the offline plan first.** It needs no database and no
   credentials, and it is the only artefact that can be reviewed before the
   first write:

   ```
   npm run test:demo
   cat test-results/demo-seed-plan.txt
   ```

   Do not proceed unless it reports `Structural integrity   PASS`.

1. **Create the demo organization.** Through the platform admin screens, as
   `AqarBooks Demo Holdings`, slug `aqarbooks-demo`, `FACILITY_MANAGEMENT`,
   `EGP`. The name and slug must match `lib/demo/story.ts` exactly — the seed
   guard compares both and refuses on any mismatch.

   Set its status to **ACTIVE**, not TRIAL: `create_unit_lease` calls
   `organization_is_active()` and refuses otherwise, so the lease stage would
   fail against a TRIAL organization.

   Then set `is_demo = true`. This is a separate fact from `status` and both
   are needed. `status` answers "may this tenant operate?"; `is_demo` answers
   "is this a customer?". Overloading `status` with a DEMO value was
   considered and rejected — `organization_is_active()` reads `status`, so a
   DEMO status would make the demo inoperable and break the RPCs the seed
   depends on.

   **The column does not exist yet.** It is prepared, unapplied, in
   [`scripts/demo/pending-migration-is-demo.sql`](../scripts/demo/pending-migration-is-demo.sql),
   with its own apply instructions. Until it is applied the tenant cannot be
   designated, and the demo organization must not be created — an unmarked
   organization in the production database is indistinguishable from a paying
   customer, which is the outcome this whole design exists to avoid.

   Assign **no subscription**. Plans live in a separate `subscriptions` table,
   so an organization with no subscription row is already outside any metric
   that counts subscriptions; `is_demo` covers the metrics that count
   organizations.

2. **Create the two accounts.** An owner account (TENANT_OWNER of the demo org)
   and the public demo account. Neither may be a platform admin.

3. **Assign the demo account the AUDITOR role** — the demo tenant's clone,
   created by `clone_tenant_role_templates()` at onboarding. Assign nothing
   else.

4. **Set the environment variables** on the deployment and in `.env.local`.

5. **Dry-run the seed** and read the report:

   ```
   npx vitest run tests/demo-seed.manual.test.ts
   cat test-results/demo-seed-report.txt
   ```

   It resolves every reference, runs every guard, and writes nothing.

6. **Apply the seed** only once that report is what you expect:

   ```
   DEMO_SEED_APPLY=1 npx vitest run tests/demo-seed.manual.test.ts
   ```

   `DEMO_SEED_APPLY` is not read from `.env.local`, so it cannot be left on.

7. **Run the security gate** (§7 below) before the demo is linked publicly.

---

## 6. The seed

`scripts/demo/`. Deterministic, idempotent, and refuses to run anywhere but the
demo tenant.

**Four independent guards**, all of which must pass
(`scripts/demo/demo-guard.ts`):

1. `DEMO_ORGANIZATION_ID` is set and equals the target.
2. The target organization's slug equals the expected demo slug.
3. Its name equals `AqarBooks Demo Holdings`.
4. It holds no membership belonging to anyone but the two demo accounts.

Guards 2 and 3 exist because guard 1 only protects against the wrong id being
passed, not against the variable holding a customer's id. Guard 4 is the one
that would catch a careless re-pointing, because it asks a question about the
**data** rather than about configuration.

**Two verifications, not one.** They answer different questions and both are
required, in this order:

| | Touches the database | Proves |
| --- | --- | --- |
| Offline plan (`scripts/demo/demo-plan.ts`) | no | the fixture graph is internally coherent — every occupied unit is explained by an ownership link or a lease, no lease points at nothing |
| Database dry run (`seedDemoTenant({ dryRun: true })`) | reads only | the plan survives contact with the real schema and real ids |

The dry run cannot come first: its guard reads the demo organization's row and
refuses without it, and creating that row is itself a write. That is why the
offline plan exists rather than the guard being worked around.

The plan's integrity gate refuses `PASS` on any of
`occupied_without_owner_or_lease`, `lease_without_resident`,
`lease_without_unit`, `archived_unit_with_active_lease`,
`vacant_unit_with_active_lease` or `orphan_members`. Eight tests feed it
deliberately broken graphs and assert it reports `FAIL` — a gate that no input
could fail would be decoration.

**Leases.** `unit_leases` is RPC-only (its generated `Insert` type is `never`),
so the seed goes through `create_unit_lease` then `activate_unit_lease`. Those
validate that unit, member, due type and receivable account all belong to the
same organization, write the audit-log row, and enforce the exclusion
constraint against overlapping active leases at activation. Every term is
constructed to span the operating month, because a unit shown as occupied in
August 2026 whose lease expired in June is the contradiction the stage exists
to remove. Owner-resident units keep their ownership link and never receive a
lease — the two are different relationships and the ledger treats their
receivables differently.

**How it writes.** Structure is inserted with the service role. Money is not —
every due, payment, levy and expense goes through the same SECURITY DEFINER
RPCs the product calls, under an authenticated owner session. That is why the
dataset balances by construction rather than by inspection, and it is the
difference between a demo and a fixture.

**Determinism.** `Math.random()` is not used anywhere in the fixtures; a seeded
PRNG makes `demo-seed-v1` mean one specific dataset. Re-running produces the
same environment and creates nothing.

**Reset.** Because the public cannot mutate the dataset, there is no scheduled
reset. To restore, re-run the seed: it is idempotent. Do not edit demo
financial data by hand — a posted entry is immutable by design, and a manual
correction would leave the dataset unreproducible from `demo-seed-v1`.

---

## 7. Security gate

Run before the demo is linked from anywhere public.

```
npx playwright test tests/e2e/public-demo.spec.ts
```

The suite skips itself if the demo is not configured, which is deliberate — a
red suite on an unconfigured machine teaches people to ignore red suites.

What it proves, in order of what actually matters:

- **The demo account cannot write, straight against the database.** It signs in
  with the public anon key — exactly what a visitor's browser holds — and
  attempts table inserts, an organization update, and a mutating RPC. This
  bypasses every guard the application has. If these are refused, they are
  refused by the database.
- `is_platform_admin` is false for the demo account.
- The account holds none of twelve named write permissions.
- The four denied AI routes return 403.
- The allowed AI routes are rate limited rather than unlimited.
- Both locales render, at desktop and at 375px, with no horizontal overflow and
  no console errors.
- Every walkthrough destination opens without hitting a permission panel.
- The conversion routes go where they claim.
- `/robots.txt` excludes the demo.

A disabled button is not evidence. Nothing in this suite asserts that a control
is missing.

---

## 8. AI in the demo

`lib/demo/ai-gate.ts` holds the policy in one place.

**Allowed** — all read-only, all rate limited:
`ask_aqarbooks`, `financial_insights`, `reconcile_match`.

**Denied** — 403 with a stable slug:

| Feature | Why |
| --- | --- |
| `invoice_ocr` | Takes an upload. A public endpoint running a vision model over anything a stranger sends is the most expensive thing here, and arbitrary uploads are out of scope. |
| `import_mapping` | The front half of a write flow whose back half the demo cannot perform. |
| `journal_copilot` | Proposing entries that can never be posted is a dead end, and showing it risks implying AI posts to the ledger. |
| `smart_dunning` | Drafts outbound messages to members. Nothing addressed to a person should originate from a public demo, even in draft. |

The principle the demo must not contradict: **AI proposes and explains; the
accounting core validates and authorises.**

Note also that `lib/ai/kill-switch.ts` still reports
`PRE_PRODUCTION_CERTIFIED`. Until that says otherwise, the demo must not be
extended to suggest certified AI capability.

### Rate limiting, and what it honestly buys

`lib/demo/rate-limit.ts` is **per-isolate and in-memory**. The repository has no
KV namespace, no Durable Object and no rate-limiting binding; `wrangler.jsonc`
declares only `ASSETS`.

- It **does** stop the realistic abuse case — a script hammering the endpoint
  from one client, capped within seconds.
- It **does** bound casual over-use.
- It **does not** enforce a global budget. Traffic spread across colos gets a
  separate allowance per isolate, and an evicted isolate forgets its counters.

The durable fix is a Cloudflare Rate Limiting binding, which needs no KV and
slots in behind the same function signature. **This is an open item, not a
solved one.**

---

## 9. Exports

Anything exported from the demo carries a visible label and a `DEMO-` filename
prefix (`lib/demo/export-notice.ts`).

The risk is not that the demo leaks customer data — it holds none. It is that a
spreadsheet outlives the tab it came from, and its contents are deliberately
built to look like a real portfolio. A fictional figure that gets forwarded,
quoted, or filed as real is the failure being prevented.

The CSV and XLSX notices are appended rather than prepended: the header row is
what a spreadsheet and any importer key on, and pushing it down would corrupt
the file in order to make it legible.

---

## 10. Open items

Recorded rather than assumed solved.

- **Rate limiting is per-isolate.** See §8. A Cloudflare Rate Limiting binding
  is the durable fix and has not been added.
- **The `is_demo` marker is not applied.** The seed guard therefore has four
  checks, not five: it verifies the configured id, the slug, the name and the
  absence of stranger memberships. The fifth — target must have
  `is_demo = true` — lands with the migration.
- **The seed has never been executed.** It typechecks against the generated
  database types — which caught several real schema errors — but no stage has
  run against a database. The dry run exists precisely for this, and must be
  read before the first apply.
- **The seed covers structure, not yet the financial narrative.** Chart of
  accounts, fiscal period, properties, zones, buildings, units, members,
  ownership links, due types, treasury accounts and **leases** are implemented,
  and the offline plan reports the structure coherent. Dues, payments, CAM
  levies, cheques, supplier invoices and the bank statement / reconciliation
  fixtures are **not yet written**, so the dashboard KPIs will be empty until
  they are. The financial stages must go through the RPCs, exactly as the
  structural ones do.
- **`RESORT_STANDARD` has no rental-income account**, so the Unit Rent due type
  points at `4300 Other Revenue`. A real operator would add a dedicated one; it
  was not invented here so the demo's chart of accounts stays identical to what
  a customer receives at onboarding.
- **`journal-propose` and `reconcile-match` accept `organizationId` from the
  request body.** RLS confines the rows regardless, so this is not a leak, but
  it contradicts "never trust a tenant identifier from the browser" and should
  be resolved from the session like every other route.
