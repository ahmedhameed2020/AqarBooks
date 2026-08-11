# RESORTOS — Phase 3 Implementation Report

**Scope:** Chart of accounts, fiscal years/periods, the double-entry journal engine, posting, reversal, database integrity tests.
**Verdict: CONTROLLED PILOT READY** — the full invariant suite (spec §38 "Journal Integrity") ran live against the real database and passed, including two real bugs that testing caught and that are now fixed.

---

## 1. What was built

### Database (7 migrations + 1 fix, applied)
| File | Contents |
|---|---|
| `20260810000015_accounting_core_tables.sql` | `document_sequences` + `next_sequence_value()`, `cost_centers`, `projects`, `chart_of_accounts` (with no-loop and lock-after-use triggers), `fiscal_years`, `fiscal_periods` |
| `20260810000016_journal_tables.sql` | `journal_entries`, `journal_entry_lines` — **no INSERT/UPDATE/DELETE RLS policy for the authenticated role at all** |
| `20260810000017_journal_engine.sql` | `create_journal_entry`, `submit_journal_entry_for_review`, `post_journal_entry`, `reverse_journal_entry` |
| `20260810000018_accounting_rls.sql` | RLS for all Phase 3 tables, default-deny |
| `20260810000019_coa_template.sql` | `coa_templates`/`coa_template_accounts` + `clone_chart_of_accounts_template()`, seeded with a 22-account `RESORT_STANDARD` template |
| `20260810000020_fiscal_year_functions.sql` | `create_fiscal_year()` (auto-generates monthly periods atomically), `set_fiscal_period_status()` |
| `20260810000021_fix_organization_is_active.sql` | **Bug fix** (see §3) |
| `20260810000022_fix_sequence_null_resort.sql` | **Bug fix** (see §3) |

### The journal engine, precisely
Nothing writes to `journal_entries`/`journal_entry_lines` except the four `SECURITY DEFINER` functions above — this is enforced at the RLS layer, not by convention. Each function re-validates its own authorization (`has_permission()`), since `SECURITY DEFINER` bypasses RLS on the tables it touches.

- **`create_journal_entry`** — makes a `DRAFT`. Deliberately permissive: a draft can be incomplete or unbalanced (spec §13's invariant list is phrased as "Posted entry ...", so drafts are legitimately work-in-progress). Idempotent via `(organization_id, idempotency_key)`.
- **`submit_journal_entry_for_review`** — `DRAFT → UNDER_REVIEW`.
- **`post_journal_entry`** — the enforcement point. Re-checks, in order: permission, org active, entry status, period is `OPEN`, entry date falls inside the period, ≥2 lines, debit total = credit total, no line posts to a group/inactive/cross-tenant account, required cost centers are present. Only then assigns the entry number (via `next_sequence_value`, organization-wide) and flips to `POSTED`.
- **`reverse_journal_entry`** — only from `POSTED`. Creates a new `POSTED` entry with every line's debit/credit swapped, links it via `reversed_entry_id`, and flips the original to `REVERSED`. Never mutates the original's lines.

### Chart of accounts
Hierarchical, bilingual, category + normal-balance enforced by CHECK constraints. A `BEFORE INSERT/UPDATE` trigger rejects hierarchy loops. Two triggers implement spec §11's post-use restrictions: `lock_coa_after_use` blocks changing `category`/`is_group` once an account has been posted to, and `prevent_delete_used_coa` blocks deleting it outright. An optional 22-account starter template (`RESORT_STANDARD`) can be cloned per org — never forced.

### UI
- `/admin/finance/periods` — create a fiscal year (auto-generates 12 monthly periods), open/close/lock periods with a reason
- `/finance/accounts` — chart of accounts list (indented by hierarchy), create account form, "use template" prompt when empty
- `/finance/journals` — list, `/new` (dynamic multi-line entry builder with live balance check), `/[id]` detail with status-appropriate actions (submit for review / post / reverse)

## 2. Database integrity tests executed — all PASS

Wrote a self-contained SQL test suite (`supabase/tests/phase3_journal_integrity.sql`) that creates its own ephemeral organization, clones the COA template, sets up an open and a closed period, and runs through spec §38's "Journal Integrity" checklist. **You ran it live against the real database; all 9 checks passed:**

| # | Test | Result |
|---|---|---|
| 1 | Unbalanced entry rejected at post | PASS |
| 2 | Single-line entry rejected at post | PASS |
| 3 | Closed-period posting rejected | PASS |
| 4 | Group-account posting rejected | PASS |
| 5 | Valid balanced entry posts and receives a number | PASS |
| 6 | Posted entry immutable via direct client write (no RLS write policy) | PASS |
| 7a/7b | Reversal flips original to `REVERSED`, links a new `POSTED` correction | PASS |
| 8 | Idempotent retry returns the same entry, no duplicate | PASS |

The test org is archived (not deleted) at the end of the script, consistent with "do not hard-delete tenants."

## 3. Bugs found by testing and fixed (this is the point of writing the tests first)

1. **`organization_is_active()` excluded `TRIAL` orgs.** Every newly created organization defaults to `TRIAL`, but the function only treated `ACTIVE` as active — so a brand-new org couldn't create a fiscal year, chart of accounts, or resort at all until a platform admin manually flipped it to `ACTIVE`. That contradicts the spec's own intent (§9 singles out *suspended* orgs as blocked, not trial ones). Fixed in `20260810000021`.
2. **`document_sequences` allowed duplicate org-wide counters.** The `unique(organization_id, resort_id, sequence_type)` constraint doesn't treat two `NULL` resort_id rows as duplicates under standard SQL semantics, so `next_sequence_value()`'s `ON CONFLICT DO NOTHING` silently inserted a second counter row the second time an org-wide sequence was requested — and the following `UPDATE ... RETURNING` then errored with "query returned more than one row" because it matched both. Fixed with `UNIQUE NULLS NOT DISTINCT` (Postgres 15+) in `20260810000022`, after deduplicating any rows the bug had already created.

Both were caught by the integrity-test run before this phase shipped, not discovered later in production — exactly the value of writing spec §38's tests as part of the phase instead of deferring them.

## 4. Verification executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm run build` | ✅ Pass, 33 routes |
| Live database integrity suite | ✅ 9/9 PASS (after 2 fixes) |

## 5. Known limitations / explicit scope cuts

- **Vouchers are journal-only so far.** `RECEIPT_VOUCHER`/`PAYMENT_VOUCHER` `source_type` values exist on `journal_entries` but nothing produces them yet — they depend on cashboxes/banks/members, which are Phase 4/5. Only `JOURNAL_VOUCHER` (manual entry) is exercised in this phase, which is the correct dependency order.
- **Cost centers / projects have schema + RLS but no UI.** `requires_cost_center` on an account is enforced by `post_journal_entry`, but there's no page yet to create cost centers/projects or attach them from the entry form's per-line cost-center field, which exists in the DB but isn't wired into the journal entry builder UI. Follow-up.
- **No period-closing reconciliation report.** Closing a period is a permission-gated status flip with a reason; the spec's fuller "closing audit trail" (e.g., a summary of what changed) isn't built beyond the existing audit log rows.
- **RLS negative tests (cross-tenant) still not automated** — same standing gap as Phase 1/2. This phase's tests targeted *financial correctness*, not tenant isolation specifically; both matter and the isolation suite is still owed.

## 6. Next step (Phase 4 — not started)

Property & Receivables: zones/buildings/floors/units, members/ownership, dues and installments, payments and allocations (the layer that will finally produce `RECEIPT_VOUCHER` entries through this journal engine). **Waiting for your go-ahead before starting.**
