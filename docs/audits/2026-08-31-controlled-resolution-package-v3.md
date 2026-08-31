# Controlled Resolution Package V3 — Bagosh Legacy Financial Migration

**Environment:** AqarBooks Bagosh Staging only  
**Supabase project:** `mlaayjrrscnxomkxgqwm`  
**Organization:** `7ae0f08d-b15c-4af7-95df-c08931a400e2`  
**Audit run:** `00e25c79-f16a-4804-a241-b600b5fd5013`  
**Audit timestamp:** 2026-08-31 20:23:09 UTC / 23:23:09 Qatar  
**Production status:** **HOLD**

This V3 supersedes the current blocker counts in V2 after management approval of the receivable financial-only scope.

## Executive status

- Journal entries: **16,555**
- Posted debit: **916,553,340.3850 EGP**
- Posted credit: **916,553,340.3850 EGP**
- Ledger difference: **0.0000 EGP**
- Source-to-Staging count difference: **0**
- Audit stale: **No**
- Open blockers: **9**
  - HIGH: **8**
  - MEDIUM: **0**
  - LOW: **1**
- Documentary findings: **13 total** — 10 resolved, 3 open
- Master-data findings: **32 total** — 26 resolved, 6 open
- Production touched: **No**
- Historical journal amounts changed: **0**

## Management-approved receivable scope — 23 findings resolved

Management approved the five receivable groups **ق م / V / A / B / VU** as **Financial-only scope**.

Controlled classification:

`ACTIVE_RECEIVABLE_OUTSIDE_PROPERTY_MASTER`

Approved handling:

`KEEP_FINANCIAL_ACCOUNT_ACTIVE_OUTSIDE_PROPERTY_MASTER`

Resolution facts:

- Findings resolved: **23**
- Absolute preserved balance: **3,233,722.00 EGP**
- Units created: **0**
- Owner/member links created: **0**
- Ledger changes: **0**
- Journal corrections: **0**

The accounts remain valid financial receivables in the ledger and may continue to be reported and collected without being represented as current AqarBooks Property/Member Master records. Any future onboarding of these groups into Property Master requires separate approved property/ownership master data.

## Remaining 9 blockers

### A. Documentary review — 3 open

| Priority | JE | Date | Description amount | Posted amount | Difference | Required evidence |
|---|---:|---|---:|---:|---:|---|
| HIGH | **11607** | 2022-04-14 | 239,770.10 | 23,977.10 | **-215,793.00** | April 2022 electricity invoice or approved journal support |
| HIGH | **7344** | 2017-09-27 | 44,521.45 | 104,522.40 | **+60,000.95** | July/August 2017 electricity invoices and bank statement |
| LOW | **3722** | 2012-12-18 | 2,074.50 | 1,957.50 | **-117.00** | 2012 stocktake/stores reconciliation or approved memo |

Open documentary difference: **275,910.95 EGP**.

### B. Active bank accounts — 2 open

| GL | Account | Balance | Last activity | Requirement |
|---|---|---:|---|---|
| **1515001** | جاري بنك مصر | **2,454,249.83** | 2026-08-24 | Official account number/IBAN, currency and status |
| **1514000** | جاري بنك قناة السويس بعائد | **313,608.08** | 2026-08-11 | Official account number/IBAN, currency and status |

Three zero-balance historical bank GL findings were already resolved as `HISTORICAL_GL_ONLY_BANK_ACCOUNT`; no operational Bank Account or identifier was fabricated.

### C. Active payables outside Supplier Master — 3 open

| GL | Counterparty | Balance | Last activity |
|---|---|---:|---|
| **2150002** | محطة تحلية مياه البحر | **1,123,790.00** | 2026-07-19 |
| **2110001** | مستحقات هيئة التنمية السياحية — إسكان سياحي | **622,142.00** | 2026-06-29 |
| **2160001** | شركة كهرباء البحيرة لتوزيع الكهرباء | **417,995.00** | 2026-08-24 |

Classification: `ACTIVE_PAYABLE_OUTSIDE_SUPPLIER_MASTER`.

Policy: `NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME`.

### D. Fixed Asset Register — 1 open

The supplied Access/Excel evidence does not contain an approved per-asset operational register. Aggregate GL and accumulated depreciation balances are not sufficient to synthesize individual assets, acquisition dates, useful lives or depreciation schedules.

Policy: `NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES`.

## Release gate

Production remains **HOLD** until the remaining nine blockers are resolved and a final Financial Integrity Audit is rerun.

Non-negotiable controls:

- No historical journal evidence is overwritten.
- No Unit, Owner, Bank Account, IBAN, Supplier or Fixed Asset is fabricated from a GL name or balance.
- Financial-only receivables remain outside Property/Member Master unless separately approved master data is supplied.
- Any genuine financial correction requires documentary evidence and a separately approved corrective journal.
- Final promotion requires ledger balance, structural checks, current audit freshness, TypeScript, Financial Integrity ESLint, build, Staging deploy and smoke checks to remain green.