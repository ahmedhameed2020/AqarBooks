# Controlled Resolution Package — Bagosh Legacy Financial Migration

**Environment:** AqarBooks Bagosh **Staging only**  
**Supabase project:** `mlaayjrrscnxomkxgqwm`  
**Audit snapshot:** 2026-08-31 19:06:37 UTC / 22:06:37 Qatar  
**Production status:** **HOLD**

## 1. Executive decision

The imported general ledger remains arithmetically and structurally intact. Internal source review has now resolved **6 of the original 13 documentary findings** without changing a single historical journal amount.

- Journal entries: **16,555**
- Posted debit: **916,553,340.3850 EGP**
- Posted credit: **916,553,340.3850 EGP**
- Ledger difference: **0.0000 EGP**
- Entries without lines: **0**
- Negative journal-line amounts: **0**
- Lines with both debit and credit positive: **0**
- Zero/zero lines: **0**
- Documentary findings: **13 total**
  - Resolved internally: **6**
  - Still open: **7**
- Financial master-data findings still open: **32**
- Total open blockers: **39**
  - HIGH: **32**
  - MEDIUM: **2**
  - LOW: **5**
- Open documentary difference under review: **2,787,775.31 EGP**
- Audit stale: **No**

**Policy:** `NO_PRODUCTION_PROMOTION_WHILE_OPEN_FINDINGS_REMAIN`.

No imported historical journal is rewritten to close a finding. Internal source evidence may resolve a finding only when preserved source headers/details or related source transactions independently establish the accounting treatment. Otherwise the finding remains OPEN pending approved external evidence.

---

## 2. Internally resolved documentary findings — no ledger correction

| JE | Date | Original finding | Internal source evidence | Resolution |
|---:|---|---|---|---|
| **11689** | 2022-05-18 | Header 50,179.95 vs posted 501,797.95 | Raw header itself states **500,000 + 1,797.95**; raw detail posts exactly those values | Header-description typo; **no ledger change** |
| **4205** | 2013-07-15 | Header 937.50 vs receipt 1,937.50 | Raw detail contains 937.50 plus a separate **1,000.00** component labelled **خط محطة التحلية** | Header omitted structured component; **no ledger change** |
| **2388** | 2010-09-01 | Narrative 633.50 + 116.50 vs journal 116.50 | Same narrative spans two migrated source documents: receipt `1167` = 633.50 and journal `1167ج` = 116.50 | Cross-document false positive; **no ledger change** |
| **2797** | 2011-06-14 | Header 2,376.30 vs journal 2,237.10 | Same-day sequential journal `1381` credits the same advance account by **139.20**; 2,237.10 + 139.20 = 2,376.30 | Split settlement across sequential journals; **no ledger change** |
| **12866** | 2023-04-27 | April electricity header 38,497.70 vs posted 69,657.90 | Subsequent source payment journal `5566` explicitly states **69,657.90 for April 2023** and settles the same payable | Copied/stale header amount; **no ledger change** |
| **11741** | 2022-06-05 | Header 192.83 vs transfer 129.83 | Originating interest journal `4309` recognized **129.83** and transfer journal `4700` moves the same **129.83** | Header transposition typo; **no ledger change** |

These six findings are recorded as `RESOLVED` with `resolution_basis = INTERNAL_SOURCE_EVIDENCE` and `ledger_correction_required = false`.

---

## 3. Remaining documentary findings requiring external evidence

### HIGH — immediate finance review

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **9112** | 2019-12-31 | 272,170.39 | 2,721,702.39 | **+2,449,532.00** | Approved journal/reconciliation memo confirming the correct state-share settlement amount |
| **11607** | 2022-04-14 | 239,770.10 | 23,977.10 | **-215,793.00** | April 2022 electricity invoice or approved journal support |
| **7344** | 2017-09-27 | 44,521.45 | 104,522.40 | **+60,000.95** | July/August 2017 electricity invoices and bank statement |

### MEDIUM

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **5132** | 2014-12-15 | 65,508.70 | 15,508.70 | **-50,000.00** | Disbursement voucher and rental-percentage statement |
| **2197** | 2010-06-24 | 14,303.36 | 2,000.00 | **-12,303.36** | Cheque copy, voucher 1030, and Ata El-Sayed advance reconciliation |

### LOW

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **3722** | 2012-12-18 | 2,074.50 | 1,957.50 | **-117.00** | 2012 inventory/stocktake reconciliation |
| **12125** | 2022-09-25 | 127,798.50 | 127,769.50 | **-29.00** | September 2022 electricity invoice and bank statement |

For all seven cases, preserved raw source headers and detail lines were re-examined. No sufficiently independent internal evidence was found to determine which conflicting amount is authoritative, so these cases remain OPEN.

---

## 4. Resolution ownership matrix

| Workstream | Open | Primary decision owner | Required input | Permitted outcome | Prohibited shortcut |
|---|---:|---|---|---|---|
| Documentary journal review | **7** | Finance / accounting approver | Original invoice, bank statement, voucher, journal memo, reconciliation | Confirm posted amount or approve corrective journal | Rewriting imported journal without evidence |
| Receivables outside Property Master | **23** | Property administration + Finance | Approved scope/ownership master | Explicit current link or historical/external receivable classification | Creating unit/owner from GL name |
| Bank account identifiers | **5** | Treasury / Finance | Official bank document | Verified bank-account setup | Inventing account number/IBAN |
| Supplier/AP counterparties | **3** | AP/Procurement + Finance | Approved legal counterparty decision | Supplier/AP setup or GL-only classification | Creating supplier from account name |
| Fixed-asset register | **1** | Finance + Asset custodian | Approved fixed-asset register | Controlled asset-register migration | Reconstructing assets from aggregate GL |

---

## 5. Receivables outside current Property/Member Master

There are **23** non-zero legacy receivable accounts outside the current Property/Member Master.

- Absolute exposure: **3,233,722.00 EGP**
- Signed net balance: **3,233,202.00 EGP**
- Source vs Supabase monetary difference: **0.00 EGP**
- Finding type: scope/linkage, **not migration amount integrity**.

Material examples include:

| GL | Legacy account | Legacy scope | Balance EGP |
|---|---|---|---:|
| 1420001 | إدارة نوادى وفنادق القوات المسلحة | القوات المسلحة | 2,839,900.00 |
| 1420002 | مينا بشرى زخارى فايز زخاري V01 | V01 | 93,498.00 |
| 1420440 | جودى محمد سامح على الهوارى V54 | V54 | 69,008.00 |
| 1420441 | حمزة محمد سامح الهوارى V55 | V55 | 68,398.00 |
| 1420442 | ياسين محمد سامح الهوارى V56 | V56 | 68,398.00 |

The remaining accounts are preserved in the controlled findings register with their exact legacy sector/unit references.

For each account management must approve one classification:

1. `CURRENT_SCOPE` — provide explicit current unit/member identity.
2. `HISTORICAL_RECEIVABLE` — preserve finance history without current ownership.
3. `EXTERNAL_RECEIVABLE` — keep the receivable outside the managed property/member hierarchy.

**Policy:** `NO_AUTOMATIC_UNIT_OR_OWNER_CREATION_FROM_FINANCIAL_ACCOUNT`.

---

## 6. Bank master data

Operational `bank_accounts` remain unconfigured where no verified account number/IBAN exists in the legacy source.

### Material active balances

| GL | Account | Balance EGP | Last activity |
|---|---|---:|---|
| **1515001** | جاري بنك مصر | **2,454,249.83** | 2026-08-24 |
| **1514000** | جاري بنك قناة السويس بعائد | **313,608.08** | 2026-08-11 |

Historical zero-balance findings remain for `1511000`, `1515000`, and `1515002`.

**Required:** official statement/account-opening confirmation with verified account number or IBAN, currency, and status.  
**Policy:** `DO_NOT_FABRICATE_BANK_ACCOUNT_IDENTIFIER`.

---

## 7. Supplier/AP counterparties

Three material external liabilities are present in the GL and verified against the legacy source with **zero monetary difference**, while operational Supplier/AP master data is not configured:

| GL | Counterparty | Balance EGP |
|---|---|---:|
| **2150002** | محطة تحلية مياه البحر | **1,123,790.00** |
| **2110001** | هيئة التنمية السياحية — إسكان سياحي | **622,142.00** |
| **2160001** | شركة كهرباء البحيرة لتوزيع الكهرباء | **417,995.00** |

Total: **2,163,927.00 EGP**.

Management must approve Supplier/AP setup or GL-only/historical classification.  
**Policy:** `NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME`.

---

## 8. Fixed assets

The operational fixed-asset register contains **0 migrated assets** while historical fixed-asset balances exist in the GL.

- Accumulated depreciation GL: `2240002`
- Balance: **4,022,011.68 EGP**
- Reporting presentation: `CONTRA_ASSET` only
- Historical GL postings remain unchanged

Required: approved fixed-asset register with code/name, acquisition date, historical cost, useful life, salvage value where applicable, status, GL mapping, and opening accumulated depreciation basis.

**Policy:** `NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES`.

---

## 9. Audit freshness control

The readiness function now treats **finding updates/resolutions** as audit-changing events by comparing the latest audit timestamp against `greatest(created_at, updated_at)` for documentary and master-data findings.

After the six resolutions, the Audit Gate was rerun:

- Latest finding change: **2026-08-31 19:03:35 UTC**
- New audit run: **2026-08-31 19:06:37 UTC**
- Audit run ID: `918580e3-7913-4951-9788-87b4f74fe894`
- `audit_is_stale`: **false**
- Gate: **HOLD**
- Open blockers: **39**

---

## 10. Production release criteria

Production remains **HOLD** until:

1. The seven remaining documentary findings receive approved evidence/disposition.
2. The 23 receivable accounts receive approved scope classifications and explicit links where applicable.
3. Bank identifiers are verified for operational bank accounts.
4. The three material payable counterparties receive Supplier/AP or GL-only decisions.
5. An approved Fixed Asset Register migration decision is completed.
6. Every finding state is updated through controlled review.
7. The Financial Integrity Audit is rerun after the final finding change.
8. Debit equals credit and structural checks remain zero.
9. TypeScript, scoped Financial Integrity ESLint, build, Staging deploy, and smoke checks pass on the final promotion candidate.

## 11. Non-negotiable controls

- Production is not touched during this phase.
- Imported historical journal amounts are immutable evidence.
- A finding can be resolved without a ledger correction when source evidence proves the posting is correct.
- Any true financial correction must be a separately approved corrective journal with documentary support.
- No bank number/IBAN, owner, unit, supplier, or fixed asset may be fabricated from a GL account name or balance.
