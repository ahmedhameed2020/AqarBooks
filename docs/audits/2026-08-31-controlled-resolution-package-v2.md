# Controlled Resolution Package V2 — Bagosh Legacy Financial Migration

**Environment:** AqarBooks Bagosh Staging only  
**Supabase project:** `mlaayjrrscnxomkxgqwm`  
**Audit run:** `3eaabe2d-ee8c-4385-9144-96a8ff32eeca`  
**Audit timestamp:** 2026-08-31 20:10:26 UTC / 23:10:26 Qatar  
**Production status:** **HOLD**

This V2 supersedes the earlier controlled-resolution counts for the current review state.

## Executive status

- Journal entries: **16,555**
- Posted debit: **916,553,340.3850 EGP**
- Posted credit: **916,553,340.3850 EGP**
- Ledger difference: **0.0000 EGP**
- Source-to-Staging count difference: **0**
- Audit stale: **No**
- Open blockers: **32**
  - HIGH: **31**
  - MEDIUM: **0**
  - LOW: **1**
- Documentary findings: **13 total**
  - Resolved internally: **10**
  - Open: **3**
- Master-data findings:
  - Resolved internally: **3** historical bank GL findings
  - Open: **29**

No historical journal amount was changed during this review.

---

## 1. Documentary review — 3 open only

| Priority | JE | Date | Description amount | Posted amount | Difference | Required evidence |
|---|---:|---|---:|---:|---:|---|
| HIGH | **11607** | 2022-04-14 | 239,770.10 | 23,977.10 | **-215,793.00** | April 2022 electricity invoice or approved journal support |
| HIGH | **7344** | 2017-09-27 | 44,521.45 | 104,522.40 | **+60,000.95** | July/August 2017 electricity invoices and bank statement |
| LOW | **3722** | 2012-12-18 | 2,074.50 | 1,957.50 | **-117.00** | 2012 stocktake / stores reconciliation or approved memo |

Open documentary difference: **275,910.95 EGP**.

Ten documentary findings are already `RESOLVED` from preserved source evidence plus Staging GL cross-check. Ledger corrections required for those ten: **0**.

---

## 2. Source-to-Staging population — fully reconciled

- Access/Excel source headers: **16,818**
- Headers without lines: **224**
- Zero-only headers: **31**
- Source identities with financial movement: **16,563**
- Direct imported identities: **16,524**
- Controlled exceptional identities: **39**
- Exceptional identities without resolution: **0**
- Unique Staging resolution targets: **31**
- Excluded cancelled identity: **1** (`8041`)
- Calculated Staging entries: **16,555**
- Actual Staging entries: **16,555**

**Count difference = 0.**

Reused source voucher numbers are preserved through date-qualified resolution keys where required. No source financial identity remains unexplained.

---

## 3. Receivables outside Property Master — 23 accounts, 5 decisions

The Excel/source review materially changed the interpretation of these findings.

These accounts are **not historical dormant balances**. All 23 have operational financial activity in 2025–2026. At the same time:

- the preserved source Member Master contains only C–Q and SH unit codes;
- the current AqarBooks Property Master contains C–Q and Shops only;
- A, B, V and VU are absent from both source Member Master and current Property Master;
- the financial account/sector master explicitly contains A, B, V, VU and the Armed Forces scope;
- no Unit or Owner is created automatically from the financial account name.

Therefore the controlled classification is:

**`ACTIVE_RECEIVABLE_OUTSIDE_PROPERTY_MASTER`**

### Decision groups

| Decision group | Description | Accounts | Absolute balance | Recommended handling |
|---|---|---:|---:|---|
| **ق م** | القوات المسلحة | 1 | **2,839,900.00** | Institutional receivable; no Unit/Owner link unless authoritative master data is supplied |
| **V** | فيلات استثمارية | 12 | **335,362.00** | Active external financial receivable outside Property Master |
| **A** | قطاع A | 7 | **38,260.00** | Active external financial receivable outside Property Master |
| **B** | قطاع B | 2 | **20,100.00** | Active external financial receivable outside Property Master |
| **VU** | فيلات قطاع B | 1 | **100.00** | Active external financial receivable outside Property Master |

The management burden is therefore reduced from **23 individual ownership decisions to 5 scope decisions**.

Recommended policy:

`KEEP_FINANCIAL_ACCOUNT_ACTIVE_OUTSIDE_PROPERTY_MASTER_UNTIL_EXPLICIT_SCOPE_APPROVAL`

If management approves these groups as financial-only scope, the 23 findings can be resolved without changing balances and without creating Units or Owners. If management wants any group onboarded into Property Master, an approved Property/Ownership Master is required.

---

## 4. Bank master — reduced from 5 open to 2 open

### Still open — operational/current

| GL | Account | Balance | Last activity | Requirement |
|---|---|---:|---|---|
| **1515001** | جاري بنك مصر | **2,454,249.83** | 2026-08-24 | Official account number/IBAN, currency and status |
| **1514000** | جاري بنك قناة السويس بعائد | **313,608.08** | 2026-08-11 | Official account number/IBAN, currency and status |

The Access/Excel Bank Factors and account master do **not** provide a trustworthy account number or IBAN for either account. No identifier is fabricated.

### Resolved internally — historical GL only

| GL | Account | Final balance | Evidence | Resolution |
|---|---|---:|---|---|
| **1511000** | جاري بنك قناة السويس | 0.00 | Closing/reconciliation entries; no activity after 2019-06-30 | `HISTORICAL_GL_ONLY_BANK_ACCOUNT` |
| **1515000** | جاري بنك قناة السويس دولار أمريكي | 0.00 | Explicit closing of USD accounts and transfer of the full USD balance to EGP on 2025-03-15 | `HISTORICAL_GL_ONLY_BANK_ACCOUNT` |
| **1515002** | جاري بنك قناة السويس بدون عائد | 0.00 | Explicit closing and transfer of balance to another current account in 2021 | `HISTORICAL_GL_ONLY_BANK_ACCOUNT` |

Operational bank accounts created from these three historical GLs: **0**.  
Fabricated identifiers: **0**.  
Ledger corrections: **0**.

---

## 5. Active payables outside Supplier Master — 3 open

The three counterparties remain operationally active in 2026 and therefore are **not historical dormant liabilities**:

| GL | Counterparty | Balance | Last activity |
|---|---|---:|---|
| **2150002** | محطة تحلية مياه البحر | **1,123,790.00** | 2026-07-19 |
| **2110001** | مستحقات هيئة التنمية السياحية — إسكان سياحي | **622,142.00** | 2026-06-29 |
| **2160001** | شركة كهرباء البحيرة لتوزيع الكهرباء | **417,995.00** | 2026-08-24 |

Controlled classification:

**`ACTIVE_PAYABLE_OUTSIDE_SUPPLIER_MASTER`**

The Access source provides GL hierarchy and account names only. It does not provide an approved Supplier Legal Master with sufficient legal identity, tax/contact data, or supplier record identifiers.

**Policy:** `NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME`.

Required decision: provide approved supplier/legal counterparty master data for operational AP onboarding, or explicitly approve keeping the payable GL-only.

---

## 6. Fixed Asset Register — still open

The three supplied Excel workbooks were reviewed for an operational fixed-asset register.

### Financial Reports workbook sheets

Cover, Annual Summary, Income Statement, Income Statement Detail, Balance Sheet, Balance Sheet Detail, Account Balances, Trial Balance, Methodology.

### Full Data Export workbook sheets

Index, Accounts, Journal Lines, Entry Headers, Members, Sectors, Voucher Types, Amount Types, Bank Factors, Months.

### Data Health Check

No fixed-asset register or per-asset schedule is present.

Conclusion:

**`NO_OPERATIONAL_FIXED_ASSET_REGISTER_FOUND_IN_EXPORTED_WORKBOOKS`**

Historical GL balances remain valid accounting evidence, including accumulated depreciation account `2240002`, but they are insufficient to synthesize individual assets, acquisition dates, useful lives or depreciation schedules.

**Policy:** `NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES`.

---

## 7. Current release gate

Production remains **HOLD** pending:

1. Resolution of the 3 documentary findings.
2. Approval of the 5 receivable scope groups or authoritative Property/Ownership Master data.
3. Verified identifiers for the 2 active bank accounts.
4. Approved disposition/legal master for the 3 active payable counterparties.
5. Approved Fixed Asset Register.
6. Final Financial Integrity Audit after the last finding update.
7. Debit = credit and all structural checks remain clean.
8. TypeScript, Financial Integrity ESLint, build, Staging deploy and smoke checks pass on the final promotion candidate.

## Non-negotiable controls

- Production is not touched during this phase.
- Historical journal evidence remains immutable.
- No Owner, Unit, Bank Account, IBAN, Supplier or Fixed Asset is fabricated from a GL name or balance.
- A finding may be resolved without a ledger correction when independent source evidence proves the posting or historical disposition.
- Any true financial correction must be a separately approved corrective journal with documentary evidence.
