# Controlled Resolution Package — Bagosh Legacy Financial Migration

**Environment:** AqarBooks Bagosh **Staging only**  
**Supabase project:** `mlaayjrrscnxomkxgqwm`  
**Latest audit snapshot:** 2026-08-31 19:50:26 UTC / 22:50:26 Qatar  
**Production status:** **HOLD**

## 1. Executive decision

The imported general ledger remains arithmetically and structurally intact. Review of the preserved Access source plus the three exported Excel workbooks has resolved **10 of the original 13 documentary findings** without changing a single historical journal amount.

Evidence workbooks reviewed:

- `AccSys_Full_Data_Export_تصدير_البيانات.xlsx`
- `AccSys_Data_Health_Check_فحص_جودة_البيانات.xlsx`
- `AccSys_Financial_Reports_التقارير_المالية.xlsx`

Current controls and balances:

- Journal entries: **16,555**
- Posted debit: **916,553,340.3850 EGP**
- Posted credit: **916,553,340.3850 EGP**
- Ledger difference: **0.0000 EGP**
- Entries without lines: **0**
- Negative journal-line amounts: **0**
- Lines with both debit and credit positive: **0**
- Zero/zero lines in Staging: **0**
- Documentary findings: **13 total**
  - Resolved internally: **10**
  - Still open: **3**
- Financial master-data findings still open: **32**
- Total open blockers: **35**
  - HIGH: **31**
  - MEDIUM: **0**
  - LOW: **4**
- Open documentary difference under review: **275,910.95 EGP**
- Audit stale: **No**

**Policy:** `NO_PRODUCTION_PROMOTION_WHILE_OPEN_FINDINGS_REMAIN`.

No imported historical journal is rewritten to close a finding. Internal evidence is accepted only when preserved source data and the Staging GL independently establish the same accounting treatment.

---

## 2. Source-to-Staging count reconciliation — CLOSED

The Excel Data Health Check initially exposed an apparent count difference between Access headers and Staging journal entries. The difference has now been fully reconciled against `legacy_import.rows`, `legacy_import.document_resolutions`, and the actual Staging journal entries.

### Source bridge

| Stage | Count |
|---|---:|
| Access / Excel source header rows | **16,818** |
| Headers with no journal lines | **224** |
| Headers whose lines are entirely zero-value | **31** |
| Source identities with financial movement | **16,563** |
| Direct one-to-one imported identities | **16,524** |
| Controlled exceptional source identities | **39** |
| Exceptional identities without a resolution record | **0** |

All **39** exceptional source identities are explicitly covered by `legacy_import.document_resolutions`.

Those 39 source identities resolve to:

- **31 unique Staging target entries**; and
- **1 cancelled source identity (`8041`)** intentionally excluded because the source header states **قيد لاغى** and its sole dual-sided line nets to zero.

Therefore:

`16,524 direct entries + 31 unique resolution targets = 16,555 Staging journal entries`

**Calculated Staging count = actual Staging count = 16,555. Difference = 0.**

Additional controls:

- Unresolved exceptional source identities: **0**.
- Orphan `document_resolutions.target_entry_id`: **0**.
- Reused voucher numbers are handled by date-inclusive `legacy-resolution` keys where required.
- Complementary unbalanced source documents are represented by controlled paired reconstructions rather than being silently discarded.

### Reused voucher-number finding

The Data Health Check reported five voucher-number reuse cases. These are not lost through idempotency collisions:

- receipt `12` — both 2008-04-05 and 2008-04-12 exist as separate date-qualified resolutions;
- journal `2051` — both 2014-04-02 and 2014-04-04 exist separately;
- journal `2213` — both historical dates exist separately;
- payment `32` — both 2019-05-13 and 2019-05-28 exist separately;
- journal `7736` — both 2025-10-18 and 2025-11-04 exist separately.

The earlier collision concern is therefore **resolved**. The ledger is not merely balanced; the source-document population is now count-reconciled to Staging.

---

## 3. Documentary findings resolved internally — no ledger correction

### Previously resolved

| JE | Resolution basis |
|---:|---|
| **11689** | Raw header detail states **500,000 + 1,797.95**, exactly matching posted lines. |
| **4205** | Source detail contains the additional **1,000.00** component labelled **خط محطة التحلية**. |
| **2388** | Narrative spans two source documents: receipt `1167` = 633.50 and journal `1167ج` = 116.50. |
| **2797** | Same-day sequential settlement contains the missing **139.20**, completing 2,376.30. |
| **12866** | Subsequent payment explicitly confirms **69,657.90 for April 2023**. |
| **11741** | Originating interest entry and transfer both confirm **129.83**. |

### Resolved from the Excel evidence pass

| JE | Source evidence | Staging GL cross-check | Resolution |
|---:|---|---|---|
| **9112** | Source voucher `3403` credits account `1180002` by **2,721,702.39**. | Pre-entry balance of `1180002` is exactly **2,721,702.39** and the posting reduces it to **0.00**. | Header amount `272,170.39` is missing a digit; **no ledger change**. |
| **5132** | Source voucher `2218`: village share **3,305.22** + HQ share **2,203.48** + advance **10,000.00**. | Total debit and cash credit are exactly **15,508.70**. | Header `55,508.70` contains an extra zero; **no ledger change**. |
| **2197** | Source entry `1126` explicitly issues cheque **143036** / voucher **1030** for a **2,000** advance; source entry `1141` clears it. | Advance account balance immediately before settlement is exactly **2,000** and JE 2197 clears **2,000**. | `14303.36` is a malformed cheque reference, not a posted amount; **no ledger change**. |
| **12125** | September 2022 accrual source entry is **176,069.50**. Payment source entry `5026` contains bank settlement **127,769.50** plus expense reversal **48,300.00**. | `127,769.50 + 48,300.00 = 176,069.50` exactly. | Header `127,798.50` is a 29.00 typo; **no ledger change**. |

All ten findings are `RESOLVED`; ledger corrections required: **0**.

---

## 4. Remaining documentary findings requiring external evidence

Only three documentary cases remain open.

| Priority | JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---|---:|---|---:|---:|---:|---|
| HIGH | **11607** | 2022-04-14 | 239,770.10 | 23,977.10 | **-215,793.00** | April 2022 electricity invoice or approved journal support. Source and Staging agree on the 23,977.10 posting, but no independent internal evidence establishes which header amount is authoritative. |
| HIGH | **7344** | 2017-09-27 | 44,521.45 | 104,522.40 | **+60,000.95** | July/August 2017 electricity invoices and bank statement. The source description states 36,514 + 8,007.45, while source and Staging both post 104,522.40. |
| LOW | **3722** | 2012-12-18 | 2,074.50 | 1,957.50 | **-117.00** | 2012 inventory/stocktake reconciliation or approved adjustment memo. Source and Staging agree on 1,957.50, but the stocktake amount cannot be independently derived from the exported data. |

Open documentary difference: **275,910.95 EGP**.

---

## 5. Resolution ownership matrix

| Workstream | Open | Primary decision owner | Required input | Permitted outcome | Prohibited shortcut |
|---|---:|---|---|---|---|
| Documentary journal review | **3** | Finance / accounting approver | Original invoice, bank statement, stocktake, journal memo | Confirm posted amount or approve corrective journal | Rewriting imported journal without evidence |
| Receivables outside Property Master | **23** | Property administration + Finance | Approved scope/ownership master | Explicit current link or historical/external receivable classification | Creating unit/owner from GL name |
| Bank account identifiers | **5** | Treasury / Finance | Official bank document | Verified bank-account setup | Inventing account number/IBAN |
| Supplier/AP counterparties | **3** | AP/Procurement + Finance | Approved legal counterparty decision | Supplier/AP setup or GL-only classification | Creating supplier from account name |
| Fixed-asset register | **1** | Finance + Asset custodian | Approved fixed-asset register | Controlled asset-register migration | Reconstructing assets from aggregate GL |

---

## 6. Receivables outside current Property/Member Master

There are **23** non-zero legacy receivable accounts outside the current Property/Member Master.

- Absolute exposure: **3,233,722.00 EGP**
- Source vs Supabase monetary difference: **0.00 EGP**
- The Excel export independently confirms historical sectors including **A, B, V and VU**.
- The Excel `Members` master does not establish current members for those historical sectors.
- Finding type: scope/linkage, **not migration amount integrity**.

Management must approve one classification for each account:

1. `CURRENT_SCOPE` — provide explicit current unit/member identity.
2. `HISTORICAL_RECEIVABLE` — preserve finance history without current ownership.
3. `EXTERNAL_RECEIVABLE` — keep the receivable outside the managed property/member hierarchy.

**Policy:** `NO_AUTOMATIC_UNIT_OR_OWNER_CREATION_FROM_FINANCIAL_ACCOUNT`.

---

## 7. Bank master data

Operational `bank_accounts` remain unconfigured where no verified account number/IBAN exists in the source or Excel export.

Material active balances:

| GL | Account | Balance EGP |
|---|---|---:|
| **1515001** | جاري بنك مصر | **2,454,249.83** |
| **1514000** | جاري بنك قناة السويس بعائد | **313,608.08** |

Historical zero-balance findings remain for `1511000`, `1515000`, and `1515002`.

The workbook sheet `معاملات البنوك - Bank Factors` contains accounting factors/mappings, not verified account numbers or IBANs, and contains no usable identifier rows for the five bank GL accounts. It is therefore **not** used to fabricate operational bank identifiers.

**Policy:** `DO_NOT_FABRICATE_BANK_ACCOUNT_IDENTIFIER`.

---

## 8. Supplier/AP counterparties

Three material external liabilities remain in the GL and are source-verified with zero monetary difference:

| GL | Counterparty | Balance EGP |
|---|---|---:|
| **2150002** | محطة تحلية مياه البحر | **1,123,790.00** |
| **2110001** | هيئة التنمية السياحية — إسكان سياحي | **622,142.00** |
| **2160001** | شركة كهرباء البحيرة لتوزيع الكهرباء | **417,995.00** |

The Excel account master confirms these GL accounts and names, but does not provide a legal supplier/counterparty master sufficient to create Supplier records safely.

Management must approve Supplier/AP setup or GL-only/historical classification.

**Policy:** `NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME`.

---

## 9. Fixed assets

The Excel account master contains fixed-asset GL accounts, but it does **not** provide a reliable operational asset register containing acquisition date, individual historical cost, useful life, salvage value, status, and explicit GL mapping for each asset.

- Operational `fixed_assets`: **0 migrated assets**
- Accumulated depreciation GL `2240002`: **4,022,011.68 EGP**
- Reporting presentation: `CONTRA_ASSET` only
- Historical GL postings remain unchanged

**Policy:** `NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES`.

---

## 10. Latest audit gate

Latest audit run:

- Executed: **2026-08-31 19:50:26 UTC**
- Audit run ID: `a1f67e0c-e0f7-4173-b4e3-083abb2fc115`
- Snapshot: `FINANCIAL_INTEGRITY_SOURCE_COUNT_RECONCILIATION_2026_08_31`
- Gate: **HOLD**
- Audit stale: **No**
- Open blockers: **35**
- Documentary: **3**
- Master Data: **32**
- HIGH: **31**
- MEDIUM: **0**
- LOW: **4**
- Ledger difference: **0.0000 EGP**
- Source count reconciliation difference: **0**

---

## 11. Production release criteria

Production remains **HOLD** until:

1. The three remaining documentary findings receive approved evidence/disposition.
2. The 23 receivable accounts receive approved scope classifications and explicit links where applicable.
3. Bank identifiers are verified for operational bank accounts.
4. The three material payable counterparties receive Supplier/AP or GL-only decisions.
5. An approved Fixed Asset Register migration decision is completed.
6. Every finding state is updated through controlled review.
7. The Financial Integrity Audit is rerun after the final finding change.
8. Debit equals credit, source-count reconciliation remains zero, and structural checks remain zero.
9. TypeScript, Financial Integrity ESLint, build, Staging deploy, and smoke checks pass on the final promotion candidate.

## 12. Non-negotiable controls

- Production is not touched during this phase.
- Imported historical journal amounts are immutable evidence.
- A finding can be resolved without a ledger correction only when evidence proves the posting is correct.
- Any true correction must use a separately approved corrective journal.
- No bank number/IBAN, owner, unit, supplier, or fixed asset may be fabricated from a GL account name or balance.
