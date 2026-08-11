# RESORTOS — Phase 1: Repository Audit & Architecture Plan

Status: **PLANNING ONLY — no implementation files written yet.**
Scope: response to the Master Specification's "أول أمر" (repository audit + architecture plan).

---

## 1. Repository Audit

The repository is **greenfield** — confirmed empty of any application code.

```
d:\Web\ResortOS
├── .agents/           ← installed agent-skills (tooling, not app code)
├── .claude/            ← Claude Code skills/config
├── .git/               ← initialized, remote origin = git@github.com:ahmedhameed2020/ResortOS.git
└── skills-lock.json
```

Findings:

| Item | Status |
|---|---|
| `package.json` | Absent — no Node project yet |
| Next.js app | Absent |
| Supabase config (`supabase/`) | Absent |
| Auth | Absent |
| Migrations | Absent |
| i18n | Absent |
| Tailwind / theme | Absent |
| Reusable components | Absent |
| Tests | Absent |
| Build status | N/A (no build) |
| Env var conventions | None established |
| Git history | Empty — no commits yet |

**Conclusion:** No existing code to preserve or migrate. We build the full stack from scratch per Section 2 of the master spec. This removes all "inspect before modifying" risk — every decision below is a fresh choice, not a compatibility constraint.

---

## 2. Proposed Tech Stack (concrete versions)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript, `strict: true` |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Backend/DB | Supabase (Postgres 15+, Auth, RLS) |
| Validation | Zod (shared client/server schemas) |
| Forms | React Hook Form + `@hookform/resolvers/zod` |
| Charts | Recharts (dashboard/reports only) |
| i18n | `next-intl` (App Router–native, RSC-friendly) — routing via `/[locale]` |
| Package manager | npm (no existing convention to inherit) |
| Testing | Vitest (unit/integration) + Playwright (RLS/route smoke tests) |

Open decision flagged in §8.

---

## 3. Database Schema Plan

All tenant-owned tables carry `organization_id uuid not null references organizations(id)`. All resort-scoped tables additionally carry `resort_id uuid not null references resorts(id)`. Every table gets `created_at`, `updated_at`, `created_by`, `updated_by` audit columns unless noted.

### 3.1 Platform & SaaS
```
profiles                 -- 1:1 with auth.users, no organization_id (spans tenants)
organizations             -- name, slug, status(TRIAL/ACTIVE/SUSPENDED/ARCHIVED), default_currency
organization_memberships  -- user_id, organization_id, status
resorts                   -- organization_id, name, code, timezone
resort_memberships        -- user_id, resort_id, organization_id
roles                     -- organization_id nullable (null = platform-level system role)
permissions                -- static catalog, e.g. finance.entries.post
role_permissions           -- role_id, permission_id
user_role_assignments      -- user_id, role_id, organization_id, resort_id nullable
plans                      -- STARTER/PROFESSIONAL/ENTERPRISE
plan_entitlements          -- plan_id, key, limit/boolean value
subscriptions               -- organization_id, plan_id, status, period
tenant_feature_flags        -- organization_id, flag_key, enabled
usage_counters               -- organization_id, metric, value, period
tenant_branding               -- organization_id, logo_url, colors
platform_audit_logs           -- see §7 audit schema, platform scope
```

### 3.2 Property & Members
```
zones, buildings, floors, units   -- hierarchical, resort_id on all
members                            -- organization_id (a member can span resorts within an org)
unit_ownerships                    -- unit_id, member_id, start_date, end_date, share_pct
residents, vehicles, member_documents
```

### 3.3 Accounting Core
```
currencies                 -- code, decimal_precision
fiscal_years, fiscal_periods -- organization_id, status(PLANNED/OPEN/CLOSED/LOCKED)
chart_of_accounts           -- organization_id, code, name_ar, name_en, parent_id, category, normal_balance, is_group, is_active
journal_entries              -- header, status(DRAFT/UNDER_REVIEW/POSTED/REVERSED), idempotency_key unique(organization_id, idempotency_key)
journal_entry_lines           -- debit NUMERIC(19,4), credit NUMERIC(19,4), CHECK (debit=0 OR credit=0) AND NOT(debit=0 AND credit=0)
document_sequences             -- organization_id, resort_id nullable, sequence_type, next_value (row-locked increment)
cost_centers, projects
financial_audit_logs
```

### 3.4 Receivables
```
due_types, dues, due_installments
payments, payment_allocations   -- CHECK sum(allocations) <= payment.amount at commit (trigger/function, not just app code)
receipts
member_account_adjustments
```

### 3.5 Treasury / Banks / Suppliers / Assets / Inventory
As enumerated in the master spec §5 verbatim — no renaming needed, names are already clean and normalized. Full DDL will be produced per-table during Phase 3–6, not upfront, to keep each migration reviewable (~100–300 lines per migration per the git-workflow skill).

### 3.6 Public Marketing
```
demo_leads, contact_requests   -- insert only via service-role server route, never client-writable
```

**Numbering strategy:** every `*_number` (entry_number, receipt_number, cheque_number, po_number) is generated by a `document_sequences` row locked with `SELECT ... FOR UPDATE` inside the same transaction as the insert — this is what makes numbering concurrency-safe (spec §13 rule 13, §17 rule "receipt numbering is concurrency-safe").

---

## 4. Route Map

```
/[locale]                          public marketing
/[locale]/demo
/[locale]/contact
/[locale]/login

/[locale]/dashboard                tenant app shell (auth required)
/[locale]/property
/[locale]/members
/[locale]/finance/accounts
/[locale]/finance/journals
/[locale]/finance/vouchers
/[locale]/finance/dues
/[locale]/finance/payments
/[locale]/finance/cashier
/[locale]/finance/banks
/[locale]/finance/cheques
/[locale]/finance/expenses
/[locale]/finance/suppliers
/[locale]/finance/assets
/[locale]/finance/inventory
/[locale]/finance/projects
/[locale]/finance/reports
/[locale]/admin                     tenant admin (TENANT_OWNER/TENANT_ADMIN)

/[locale]/platform                  platform super admin only
/[locale]/platform/organizations
/[locale]/platform/subscriptions
/[locale]/platform/leads
/[locale]/platform/audit
```

Enforcement: `middleware.ts` handles locale routing + coarse auth gate (redirect unauthenticated → `/login`). Fine-grained role/permission checks happen in each Server Component/Server Action/Route Handler via a shared `requirePermission()` helper backed by DB-verified session — never trusting a client-supplied role claim. `robots`/`noindex` meta applied to `/dashboard`, `/admin`, `/platform` subtrees.

---

## 5. RLS Strategy

Default-deny on every tenant-owned table (`ENABLE ROW LEVEL SECURITY`, no permissive default policy).

Pattern (per table):
```sql
create policy "org_isolation_select" on <table>
for select using (
  organization_id in (
    select organization_id from organization_memberships
    where user_id = auth.uid() and status = 'active'
  )
);
```

Layered on top for resort-scoped tables:
```sql
and resort_id in (
  select resort_id from resort_memberships
  where user_id = auth.uid() and organization_id = <table>.organization_id
)
```

Layered again for permission-gated writes (insert/update/delete), via a `has_permission(auth.uid(), organization_id, 'finance.entries.post')` SQL function checking `user_role_assignments → role_permissions`.

Suspended-organization writes blocked by including `organizations.status = 'active'` in the write policies for financial tables (spec §9 "suspended organizations cannot create new financial activity").

Service-role key: used only in server-only route handlers (e.g. `demo_leads` insert, platform-level cross-tenant queries for Super Admin). Never bundled to client. Platform Super Admin access itself is *also* RLS-checked via a `platform_admins` claim, not just "service role bypasses everything" — service role is reserved for the few operations that must legitimately cross tenant boundaries.

Negative tests (spec §38) become a Playwright/Vitest suite run against a seeded two-tenant fixture before Phase 3 is considered done.

---

## 6. Role & Permission Matrix (summary)

13 roles × permission groups (`platform.*`, `tenant.*`, `property.*`, `finance.*`, `receivables.*`, `cashier.*`, `banking.*`, `inventory.*`, `purchasing.*`) exactly as enumerated in master spec §8. Full matrix (role → permission grid) will be generated as a seed migration (`role_permissions` rows) in Phase 1, and rendered as a reviewable table in the Phase 1 implementation report rather than duplicated here.

Key rule carried into every layer (UI, Server Action, RLS): **UI visibility is never authorization.** Every mutating Server Action re-checks permission server-side even if the button was already hidden.

---

## 7. Financial Posting Architecture

Posting is **not** "insert header, then insert lines from the browser." It is a single server-side transaction, ideally a Postgres function (`post_journal_entry(entry jsonb) returns uuid`) so the invariants live in the database and can't be bypassed by any future API path:

1. Acquire the org's document-sequence row `FOR UPDATE` → assign `entry_number`.
2. Validate: ≥2 lines, `sum(debit) = sum(credit)`, no line has both debit and credit, no line targets a group account, target period is `OPEN`, all `account_id`/`cost_center_id`/etc. belong to the same `organization_id`.
3. Insert header (`status = 'POSTED'`, `posted_by`, `posted_at`).
4. Insert lines.
5. Write `financial_audit_logs` row.
6. All within one transaction — any failure rolls back the whole entry (no partial postings).

Idempotency: caller supplies `idempotency_key`; unique constraint `(organization_id, idempotency_key)` makes retried requests (network timeout + client retry) a no-op that returns the original entry rather than duplicating it.

Reversal: `reverse_journal_entry(entry_id)` inserts a new POSTED entry with swapped debit/credit and links `reversed_entry_id` — never mutates or deletes the original.

Vouchers (receipt/payment/journal) and payments/allocations are thin domain layers that ultimately call this same posting primitive, so every money-moving feature inherits the same integrity guarantees instead of re-implementing them.

---

## 8. Risks & Open Decisions

These need your decision before Phase 1 implementation starts:

1. **i18n library** — proposing `next-intl`. Alternative: hand-rolled dictionary + `[locale]` segment. `next-intl` is recommended (RSC support, plural/ICU messages, less custom code).
2. **Supabase project** — do you already have a Supabase project created (URL + keys), or should the plan assume local Supabase CLI dev (`supabase start`) until you provision one?
3. **Default currency** — spec suggests EGP default, configurable per org. Confirm EGP is correct as the seed default.
4. **Multi-currency now or later?** — spec says "avoid silently mixing currencies" but doesn't require FX conversion in v1. Proposing: single currency per organization at launch, schema leaves room for FX later, no conversion logic yet. Confirm.
5. **Seed chart-of-accounts template** — should Phase 3 ship one default Egyptian-resort COA template tenants can clone/customize, or start every tenant with an empty COA?
6. **Email infrastructure** — spec mentions "email branding where email infrastructure exists." None exists yet. Should Phase 2 include a transactional email provider (e.g. Resend) for invitations, or is that out of scope for now?
7. **Testing stack** — proposing Vitest + Playwright. Confirm, or state a preference.
8. **Package manager** — proposing npm since nothing is established. Confirm, or prefer pnpm.

---

## 9. Implementation Phases

Adopting the master spec's 9 phases verbatim (Foundation → SaaS Admin → Accounting Core → Property/Receivables → Treasury/Banking → Expenses/Operations → Reports/Dashboards → Public Marketing → Verification). Each phase ends with `tsc --noEmit`, lint, tests, build, and a written implementation report before the next phase begins — no phase starts until the previous one is reviewed and approved, per your own instructions.

**Next step:** on your approval of this plan, Phase 1 begins with: project scaffold, Supabase project wiring, auth, i18n shell, organizations/resorts/memberships schema + RLS, RBAC tables, audit log table, and the authenticated app shell — nothing decorative, no unrelated pages.
