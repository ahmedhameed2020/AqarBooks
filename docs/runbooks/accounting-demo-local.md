# Running the accounting demo and its browser tests locally

Everything here runs on your machine only. The stack is a **separate, clean** Supabase project
(`aqarbooks_clean`, API `127.0.0.1:55321`, DB `127.0.0.1:55322`) that is independent of the development stack
(`aqarbooks`, `:54321`) and never touches the hosted project in `.env.local`.

## What protects against external connections
| Layer | How |
|---|---|
| Supabase | the clean stack has no SMTP, no analytics, no realtime, no edge runtime, sign-up disabled (`scripts/demo-local/supabase/config.toml`) |
| App process | `scripts/demo-local/app.mjs` overrides **every** variable named in `.env.local` / `.env.production` / `.env` with a blank, then sets the local stack's URL/keys. Production URLs, keys and provider credentials never reach Next.js. AI provider keys are blank, so no AI route can call a provider; the AI entry points are hidden (`lib/ai/availability.ts`) |
| Playwright config | `playwright.config.ts` refuses to start unless the Supabase URL is a known local API (`tests/helpers/local-target.ts`, port 55321 only via `LOCAL_SUPABASE_API_PORTS`) and the app host is loopback |
| Browser | `tests/e2e/helpers/local-only.ts` aborts any request whose host is not `localhost` / `127.0.0.1` and fails the test if one was attempted |
| Vitest | `tests/setup/local-only-guard.ts` (Supabase client constructor guard) |

## Steps
Requires Docker Desktop running, the Supabase CLI, Node, and the Playwright browsers (`npx playwright install chromium`).

```bash
# 1. clean stack: applies supabase/migrations through `supabase start`
npm run demo:stack-up
npm run demo:stack-verify        # ledger == files, and `db diff` finds no drift
# (after you add a migration:  npm run demo:stack-migrate)

# 2. the app on http://localhost:3100, isolated environment
#    production build (small, fast, writes almost nothing - preferred; the dev server's cache can fill a small disk):
node scripts/demo-local/build.mjs --next-only
node scripts/demo-local/start-prod.mjs     # leave running
#    or the dev server:
# npm run demo:app

# 3. the connected journey, as an accountant, through the UI (new organization each run, ~8 min the first time)
npm run demo:e2e -- tests/e2e/accounting-journey.spec.ts
npm run demo:e2e -- tests/e2e/accounting-bank-reconciliation.spec.ts
npm run demo:e2e -- tests/e2e/accounting-receivable-default.spec.ts tests/e2e/accounting-void-permission.spec.ts tests/e2e/re-prior-year-boundary.spec.ts

# re-run single verification steps against the organization the last run built
JOURNEY_REUSE=1 npm run demo:e2e -- tests/e2e/accounting-journey.spec.ts -g "V5"

# stop and delete the clean stack (data is disposable)
npm run demo:stack-down
```

After a journey run, browse the same data yourself: sign in at `http://localhost:3100/en/login` as
`accountant-<tag>@demo.local` (or `auditor-<tag>@demo.local`); `<tag>` and the organization name are written to
`test-results/demo-org.json`. The local-only fixture password is the constant `PASSWORD` in
`tests/e2e/helpers/accounting-fixture.ts`.

## What the journey proves (see `docs/audits/Phase2-Accounting-Journey-Acceptance-Report-2026-10-10.md`)
Opening balance 10,000 (dated 2025-12-31) → new due 2,000 → receipts 1,500 and 500 → full reversal of the second →
net collected 1,500, outstanding 10,500, shown identically in the dues list, receipts, owner statement, general
ledger, trial balance (opening + movement = closing), income statement, balance sheet, cash flow, aging and the
audit trail.

## Notes
* The first visit to each page compiles it (dev server), so the first run is slow.
* Roles: the journey's accountant is the shipped ACCOUNTANT template **plus** `finance.payments.void`, created by the
  fixture, so the same session can reverse a receipt. The shipped ACCOUNTANT template cannot void.
* `BANK_TRANSFER` is selectable in the receipt dialog (round 2c); the receipts list, filter and bank-collections KPI classify it.
* The organization's **approved receivable account** (`organization_finance_settings.receivable_account_id`) is set by the owner
  (`set_default_receivable_account`, or the checkbox in the issue-due dialog). Without it the dialog is empty and asks for a choice.
* Reversing a receipt needs `finance.payments.void` (owner and finance-manager templates). The demo accountant has it added.
* Playwright artifacts go to the system temp folder (`PW_OUTPUT_DIR` to change it).
* The existing Playwright specs read `.env.local` through dotenv. With the new config guard they only start when you
  run them through `npm run demo:e2e` (clean stack). Pointing them by hand at the development stack (`54321`) is refused:
  the development port is rejected even if added to `LOCAL_SUPABASE_API_PORTS`, and every `createClient` URL must equal the
  isolated stack that was verified.
* **Bank reconciliation:** finalize needs a zero difference **and** every statement line matched to a booked entry; there is no
  "explain / defer" exception. Importing a bank fee does not book it: create the entry (accountant), submit it, have the
  owner post it, then match.
* **Dues and opening balances need an OPEN fiscal period** covering their date; otherwise they are refused with
  `FISCAL_PERIOD_MISSING` / `FISCAL_PERIOD_NOT_OPEN` and nothing is created. Opening balances cannot be future-dated.
* **Issue due:** an identical due that already exists is reported as "Due already exists", not "issued".
* **Issue due:** if only the optional "approve as default" step fails, the due is still issued; use the toast's *Retry saving*.
* Review bundle: `node scripts/demo-local/make-review-bundle.mjs` then `node scripts/demo-local/verify-review-bundle.mjs`.
* **Upgrading a database that applied the earlier Phase 2c text:** apply `20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql`
  (the normal `supabase migration up` does). It audit-retires any still-explained statement lines, removes the explanation
  mechanism and restores the strict finalize. Rehearsal: `node scripts/demo-local/run-vitest-local.mjs --no-file-parallelism tests/bank-reconciliation-upgrade.integration.test.ts`
  (puts the local clean database into the old state, upgrades it in place, and checks data, audit and behaviour).

## Tests only run against the isolated stack
Write-capable tests (`*.integration.test.ts`, `gate-*`, `maintenance-*`, Playwright) refuse to start unless launched through `node scripts/demo-local/run-vitest-local.mjs ...` / `npm run demo:e2e -- ...` against the clean stack (`tests/helpers/isolated-target.ts`). There is no fallback to the development database; a missing config, an API/SQL mismatch or a development target stops the run before the first write.

The hardware outbox file claims from a global queue and must not share a database with other suites: run it with
`node scripts/demo-local/hardware-stack.mjs up` (once), `... run tests/gate-hardware-outbox-migration.test.ts`, and `... down` when finished
(a separate stack `aqarbooks_hw`, API 55431). On the shared stack it refuses to start and changes nothing.

## Customer advances — running and checking them locally (2026-10-12)
Spec: `docs/superpowers/specs/2026-10-11-customer-advances-design.md` (§10 = what was actually built). Report: `docs/audits/Phase3-Customer-Advances-Closure-Report-2026-10-12.md`. **Local only; nothing here is a deployment procedure.**

```bash
# migrations (forward-only): 3a-3e advances, 3f portal statement history, 3g advance-account boolean, 3h owner statement settlement
npm run demo:stack-migrate           # applies the ones the stack has not got yet (never edit one that is applied)
node scripts/demo-local/stack.mjs verify   # ledger == files; db diff, conservative rule (exit 0 CLEAN = first two observations clean, 1 DRIFT_REPRODUCED, 2 UNSTABLE); see limit below

# production build + app (after every UI change the build must be redone and the server restarted)
node scripts/demo-local/build.mjs --next-only
node scripts/demo-local/start-prod.mjs

# DB / integration tests on the isolated stack (never the development port)
node scripts/demo-local/run-vitest-local.mjs tests/customer-advances.integration.test.ts tests/portal-statement-history.integration.test.ts \
  tests/owner-statement-settlement.integration.test.ts tests/legacy-receipt-compat.integration.test.ts tests/advance-account-configured.integration.test.ts

# browser: B1-B8, the advance screens and the owner statement
node scripts/demo-local/e2e.mjs customer-advances.spec.ts
node scripts/demo-local/e2e.mjs customer-advances-ui-screens.spec.ts portal-statement.spec.ts
```

Rules the specs rely on
* **V1 refuses future dates**; periods are monthly; all reference dates are in the past (the B-specs use fixed 2026 dates).
* Idempotency keys are supplied by the caller (`OperationSubmitter`); a double click or a retry of the same content reuses the key.
* The advance account (`2250 Customer Advances` for new organizations) must be **approved** (receipts page card, `finance.accounts.manage`); the screen asks `customer_advance_account_configured`, a boolean, so a cashier is not told "not configured" when it is.
* The owner portal is passwordless (`portalLogin` reads the email code through the auth admin API); the statement is rebuilt as of the filter's end date from `own_statement_*` functions (they return only the signed-in owner's own rows).
* `payments` with no posted journal entry are not effective receipts anywhere (readers, as-of functions, owner statement). Fixtures must give a receipt its entry (see `tests/e2e/helpers/portal-fixture.ts`).

Known limits when you run it
* **`stack verify` schema-drift step: unstable tool, item OPEN (investigated 2026-10-13/14).** The ledger-vs-files check (82/82) only proves the registry equals the files. The `supabase db diff` step once (under CPU load; also twice on 2026-10-12) reported ~1,900 drop+create statements (193 policies, 91 triggers, 384 foreign keys, 11 functions, 6 views) although the same migrations were replayed; the pattern points at the TOOL (one side rendered with schema-qualified names), but the independent catalog check of that instance was not completed and the cause is not identified. Under heavy load the shadow container can also fail to start (tool error). `verify` takes up to 6 observations and applies a conservative rule: **`CLEAN` only when the first two observations are clean; any difference or tool error followed by clean results is `UNSTABLE` (exit 2), never success; the same difference twice is `DRIFT_REPRODUCED` (exit 1; the tool repeated its report, not an independent proof).** Every raw output is kept in a folder whose path is printed (`VERIFY_OUT_DIR` overrides). For required checks use `VERIFY_CAPTURE=1 node scripts/demo-local/stack.mjs verify` (needs python): every observation then also reads the live database and the CLI's shadow from the catalogs while the shadow is alive, so a recurring report is captured on both ends. To check an unstable or reproduced result independently, compare the live database with the shadow straight from the catalogs: `docs/audits/phase3-evidence/task9-drift/catalog_snapshot.sql` + `capture_run.py`. Run `verify` on an idle machine, never two at once, and do not kill it mid-run (an orphaned random-named postgres container stays behind). Evidence: `docs/audits/phase3-evidence/task9-drift/result.md`, `task7-stack-verify-runs.md`.
* The browser suite is **not** known to pass in one complete run. Flakes recorded: `accounting-duplicates` D1 (12 failures in 38 runs), `portal-journey` J2/J4. **Cause located (with limits):** statement timeouts (role limit 8 s, PostgREST 500) on `units_with_financials` / `members_with_financials` / `maintenance_categories`, shown by the pages as *empty data* (e.g. "Units owned 0" and a "link the client to a unit first" notice instead of the form); 7 of 8 failing D1 runs contained a timeout, 0 of 6 passing runs did. **Not established:** why queries of 0.4-1.5 s sometimes exceed 8 s (view shape vs Docker VM load). Earlier explanations ("cold server", "click on an un-hydrated button", "hasPermission fails closed") were tested and **retracted**. D1 and S1 now fail at once with a message naming this cause. **Update 2026-10-13:** the pages now throw on a failed read and show an error view with Retry (`lib/supabase/assert-read.ts`, `docs/audits/phase3-evidence/task7-error-states.md`), so these timeouts surface as an error page instead of wrong numbers; the review of the views themselves is still a separate approved task and the timeouts still happen (39 in one regression session, 32 of them on the portal home). Evidence: `docs/audits/phase3-evidence/task7-flake-analysis.md`. Run suites alone when investigating and read `task6-run-record.md` for the per-run table.
* The egress guard (`tests/e2e/helpers/local-only.ts`) fails any test whose browser reaches a non-loopback host; the receipt document loads web fonts from a public CDN, so B5 captures it instead of opening the window.
* `owner-portal-online-payment-fawry.spec.ts` needs FAWRY keys that the isolated stack does not have.
* Accsys (Bagoush village Access import): whether imported receipts are linked to their journal entries is **conditional on Bagoush deciding to migrate**, not a general deployment blocker; the legacy-receipt test does not mean their data migration was done.
* G-ADV-1 (stranded credit after an ownership transfer: no transfer/refund tool), cash refund and credit transfer are outside V1. The only accounting way to clear stranded credit is voiding the receipt, and only **after any applications in force have been reversed** (else `CREDIT_APPLICATIONS_ACTIVE`), by someone holding `finance.payments.void`, in an **open fiscal period**; the void reverses the entry and zeroes the liability, it does **not** prove the cash went back to the customer.
