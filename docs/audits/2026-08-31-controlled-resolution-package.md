# Controlled Resolution Package — Bagosh Legacy Financial Migration

**Environment:** AqarBooks Bagosh **Staging only**  
**Supabase project:** `mlaayjrrscnxomkxgqwm`  
**Organization:** `7ae0f08d-b15c-4af7-95df-c08931a400e2`  
**Audit snapshot:** 2026-08-31 18:28:42 UTC / 21:28:42 Qatar  
**Production status:** **HOLD**

## 1. Executive decision

The imported general ledger is arithmetically and structurally intact, but Production promotion is blocked by unresolved documentary and financial master-data findings.

- Journal entries: **16,555**
- Posted debit: **916,553,340.3850 EGP**
- Posted credit: **916,553,340.3850 EGP**
- Ledger difference: **0.0000 EGP**
- Entries without lines: **0**
- Negative journal-line amounts: **0**
- Lines with both debit and credit positive: **0**
- Zero/zero lines in migrated ledger: **0**
- Open findings: **45**
  - HIGH: **32**
  - MEDIUM: **4**
  - LOW: **9**
- Documentary findings: **13**
- Financial master-data findings: **32**
- Documentary amount difference under review: **3,272,389.21 EGP**
- Audit stale: **No**

**Policy:** `NO_PRODUCTION_PROMOTION_WHILE_OPEN_FINDINGS_REMAIN`.

No historical financial amount is to be changed merely to make the system appear ready. A correction may only be posted after documentary evidence establishes that the legacy posted amount is wrong and the approved correction method is documented.

---

## 2. Resolution ownership matrix

| Workstream | Open | Primary decision owner | Required input | Permitted outcome | Prohibited shortcut |
|---|---:|---|---|---|---|
| Documentary journal review | 13 | Finance / accounting approver | Original invoice, bank statement, voucher, journal memo, or reconciliation | Confirm posted amount, confirm description typo, or approve corrective journal | Editing imported historical journal without evidence |
| Receivables outside Property Master | 23 | Property administration + Finance | Approved scope/ownership master | Explicit current unit/member link **or** historical/external receivable classification | Creating unit/owner from GL name alone |
| Bank account identifiers | 5 | Treasury / Finance | Official bank statement or account-opening document | Create operational bank account with verified account number/IBAN/currency/status | Inventing account number from GL code |
| Supplier/AP counterparties | 3 | Procurement/AP + Finance | Approved supplier/counterparty identity | Explicit Supplier/AP setup **or** approved GL-only/historical classification | Creating supplier from GL account name alone |
| Fixed-asset register | 1 | Finance + Asset custodian | Approved fixed-asset register | Import individual assets and depreciation metadata | Reconstructing individual assets from aggregate GL balances |

---

## 3. Package A — Documentary journal findings

### HIGH — immediate finance review

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **9112** | 2019-12-31 | 272,170.39 | 2,721,702.39 | **+2,449,532.00** | Approved journal/reconciliation memo confirming whether 272,170.39 or 2,721,702.39 is correct |
| **11607** | 2022-04-14 | 239,770.10 | 23,977.10 | **-215,793.00** | April 2022 electricity invoice or approved journal |
| **7344** | 2017-09-27 | 44,521.45 | 104,522.40 | **+60,000.95** | July/August 2017 electricity invoices and bank statement |

### MEDIUM

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **11689** | 2022-05-18 | 50,179.95 | 501,797.95 | **+451,618.00** | Deposit maturity/advice and Banque Misr statement; text internally says 500,000 + 1,797.95 |
| **5132** | 2014-12-15 | 65,508.70 | 15,508.70 | **-50,000.00** | Disbursement voucher and rental-percentage statement |
| **12866** | 2023-04-27 | 38,497.70 | 69,657.90 | **+31,160.20** | April 2023 electricity invoice / approved entitlement |
| **2197** | 2010-06-24 | 14,303.36 | 2,000.00 | **-12,303.36** | Cheque copy, voucher 1030, and Ata El-Sayed advance reconciliation |

### LOW

| JE | Date | Description amount | Posted amount | Difference | Evidence required |
|---:|---|---:|---:|---:|---|
| **4205** | 2013-07-15 | 937.50 | 1,937.50 | **+1,000.00** | Receipt or L02 account statement |
| **2388** | 2010-09-01 | 750.00 | 116.50 | **-633.50** | Original journal voucher and C25 collection document |
| **2797** | 2011-06-14 | 2,376.30 | 2,237.10 | **-139.20** | Office-advance settlement support |
| **3722** | 2012-12-18 | 2,074.50 | 1,957.50 | **-117.00** | 2012 inventory/stocktake reconciliation |
| **11741** | 2022-06-05 | 192.83 | 129.83 | **-63.00** | Suez Canal Bank statement or interest-account transfer memo |
| **12125** | 2022-09-25 | 127,798.50 | 127,769.50 | **-29.00** | September 2022 electricity invoice and bank statement |

**Resolution rule:** `OPEN` remains unchanged until the supporting document is reviewed. If the document confirms the posted amount, resolve as **description/documentation discrepancy — no ledger change**. If the posted amount is proven wrong, use a separately approved corrective journal; do not rewrite the imported historical entry.

---

## 4. Package B — Receivables outside current Property/Member Master

There are **23** non-zero legacy receivable accounts outside the current Property/Member Master.

- Absolute exposure: **3,233,722.00 EGP**
- Signed net balance: **3,233,202.00 EGP**
- Source vs Supabase financial amount verification: **zero monetary difference**
- The issue is **scope/linkage**, not migration amount integrity.

| GL account | Legacy name | Sector / unit | Balance EGP | Last activity |
|---|---|---|---:|---|
| 1420001 | إدارة نوادى وفنادق القوات المسلحة | القوات المسلحة / ق م | 2,839,900.00 | 2026-04-07 |
| 1420002 | مينا بشرى زخارى فايز زخاري V01 | V / 01 | 93,498.00 | 2026-04-07 |
| 1420440 | جودى محمد سامح على الهوارى V54 | V / 54 | 69,008.00 | 2026-05-20 |
| 1420441 | حمزة محمد سامح الهوارى V55 | V / 55 | 68,398.00 | 2026-05-20 |
| 1420442 | ياسين محمد سامح الهوارى V56 | V / 56 | 68,398.00 | 2026-05-20 |
| 1420010 | محمد السيد مصطفى النعمانى V13 | V / 13 | 26,600.00 | 2026-04-07 |
| 1420069 | حازم حسن عبدالحميد جمعة A26 | A / 26 | 15,500.00 | 2026-04-07 |
| 1420096 | ايمان محمود خليل البنا B16 | B / 16 | 15,500.00 | 2026-04-07 |
| 1420084 | صلاح محمود خليل البنا B04 | B / 04 | 4,600.00 | 2026-04-07 |
| 1420021 | ثناء حسن على ابراهيم V29 | V / 29 | 4,500.00 | 2026-04-07 |
| 1420046 | محمد جابر محمد احمد A03 | A / 03 | 4,500.00 | 2026-04-07 |
| 1420048 | ورثه / فتحى حماد محمود عطية A05 | A / 05 | 4,500.00 | 2026-04-07 |
| 1420059 | غادة حسين نجيب نبية A16 | A / 16 | 4,500.00 | 2026-04-07 |
| 1420065 | غادة حسين نجيب نبية A22 | A / 22 | 4,500.00 | 2026-04-07 |
| 1420071 | داليا - دينا سعيد عبد الحميد جبر A28 | A / 28 | 4,500.00 | 2026-05-09 |
| 1420439 | الاء واية وامنية وريم عاصف عبد الحليم خويلد V53 | V / 53 | 4,500.00 | 2026-04-07 |
| 1420072 | هشام الدين محمد حسين A29 | A / 29 | **-260.00** | 2026-05-19 |
| 1420003 | ميخائيل نجيب ميخائيل عبد الله V02 | V / 02 | 100.00 | 2026-04-14 |
| 1420009 | اشرف مدحت زيد V11 | V / 11 | 100.00 | 2026-04-07 |
| 1420015 | محمد سالم احمد سلامة V22 | V / 22 | 100.00 | 2026-05-04 |
| 1420016 | على انور محمد ابو العز V23 | V / 23 | 100.00 | 2026-04-07 |
| 1420024 | ميخائيل نجيب ميخائيل VB1 | VU / 01 | 100.00 | 2026-04-14 |
| 1420420 | أحمد السيد عبد المقصود محمد خليل V31 | V / 31 | 60.00 | 2026-04-07 |

### Required management decision

For each account, approve exactly one outcome:

1. **CURRENT_SCOPE** — the unit/entity remains managed. Supply the current Unit ID and current Member/Owner identity for explicit linkage.
2. **HISTORICAL_RECEIVABLE** — preserve the GL balance and history without creating current ownership.
3. **EXTERNAL_RECEIVABLE** — classify as a receivable outside the managed property/member hierarchy.

**Prohibited:** automatic creation of A/B/V/VU units or owners from legacy GL names.

---

## 5. Package C — Bank master data

The bank master contains bank identities, but operational `bank_accounts` are not configured because no verified account number/IBAN exists in the legacy source inspected.

### HIGH — active/material balances

| GL | Account | GL balance EGP | Last activity | Required evidence |
|---|---|---:|---|---|
| **1515001** | جارى بنك مصر | **2,454,249.83** | 2026-08-24 | Official bank statement/account-opening document with account number or IBAN, currency, and active status |
| **1514000** | جارى بنك قناه السويس بعائد | **313,608.08** | 2026-08-11 | Same |

### LOW — historical zero-balance accounts

| GL | Account | Balance | Last activity |
|---|---|---:|---|
| 1511000 | جاري بنك قناة السويس | 0.00 | 2019-06-30 |
| 1515000 | جارى بنك قناة السويس دولار أمريكى - 1 | 0.00 | 2025-03-15 |
| 1515002 | جارى بنك قناة السويس بدون عائد | 0.00 | 2021-12-15 |

**Policy:** `DO_NOT_FABRICATE_BANK_ACCOUNT_IDENTIFIER`.

---

## 6. Package D — Supplier/AP counterparties

The operational Supplier/AP master is empty while three material external liabilities remain in the GL. Their monetary balances were verified against the legacy source with **zero difference**.

| GL | Counterparty | Balance EGP | Last activity | Decision required |
|---|---|---:|---|---|
| **2150002** | محطة تحلية مياة البحر | **1,123,790.00** | 2026-07-19 | Operational supplier/AP or approved GL-only/historical liability |
| **2110001** | مستحقات هيئة التنمية السياحية (اسكان سياحي) | **622,142.00** | 2026-06-29 | Same |
| **2160001** | شركة كهرباء البحيرة لتوزيع الكهرباء | **417,995.00** | 2026-08-24 | Same |

Total current GL liability represented by these three accounts: **2,163,927.00 EGP**.

**Policy:** `NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME`.

---

## 7. Package E — Fixed assets

The operational `fixed_assets` register currently contains **0 assets**, while historical fixed-asset balances and accumulated depreciation exist in the GL.

- Legacy accumulated depreciation GL: **2240002**
- Accumulated depreciation balance: **4,022,011.68 EGP**
- Last legacy depreciation activity: **2025-12-31**
- Balance Sheet presentation: classified as **CONTRA_ASSET** for reporting only
- General Ledger classification and historical postings remain unchanged

Required document: approved fixed-asset register containing, at minimum:

- asset code/name
- acquisition date
- historical cost
- useful life
- salvage value where applicable
- status
- explicit GL mapping
- accumulated depreciation / opening depreciation basis where applicable

**Policy:** `NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES`.

---

## 8. Production release criteria

Production promotion remains **HOLD** until all of the following are true:

1. Every HIGH documentary finding has approved evidence and a documented resolution.
2. All remaining documentary findings have an approved disposition or formally accepted risk.
3. Every receivable outside the Property Master has an approved scope classification and, when current, an explicit Unit/Member link.
4. Active/material bank GL accounts have verified operational bank-account identifiers.
5. Material payable counterparties have an approved Supplier/AP or GL-only classification.
6. Fixed Assets has an approved migration decision and register; no synthetic assets are introduced.
7. All finding statuses are updated through controlled review.
8. The Financial Integrity Audit Gate is rerun after the final finding update.
9. Ledger debit equals credit and all structural integrity checks remain zero.
10. Staging TypeScript, scoped financial-integrity ESLint, build, deploy, and smoke checks pass on the final promotion candidate.

---

## 9. Non-negotiable controls

- **Production is not touched during this resolution phase.**
- **No imported historical journal is overwritten.**
- **No bank account number/IBAN is invented.**
- **No unit or owner is created from a financial account name alone.**
- **No supplier is created solely from a GL account label.**
- **No fixed asset is synthesized from aggregate GL balances.**
- **Historical account-to-unit evidence must never be interpreted as current ownership evidence.**
- **Ledger balance is necessary but is not equivalent to documentary or master-data clearance.**

## 10. Current conclusion

The migration is financially balanced and source-preserving. The remaining HOLD is a controlled governance decision based on missing documentary evidence and master-data definitions, not an indication that the imported ledger is out of balance.
