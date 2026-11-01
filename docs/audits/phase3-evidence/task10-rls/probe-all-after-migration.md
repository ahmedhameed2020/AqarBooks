# Time of `select count(*)` per relation under RLS (ms), isolated stack, 839 organizations

| relation | total rows | staff ms (min-max) / sees | owner ms / sees | stranger ms / sees |
|---|---|---|---|---|
| chart_of_accounts | 14520 | 2269-2362 / 26 | 2015-2807 / 0 | 1415-1716 / 0 |
| fiscal_years | 1185 | 3118-4234 / 2 | 2117-3768 / 0 | 624-973 / 0 |
| fiscal_periods | 13615 | 1117-1497 / 24 | 397-2026 / 0 | 420-889 / 0 |
| journal_entry_lines | 6099 | 4191-6397 / 105 | 5065-5828 / 0 | 3955-7310 / 0 |
| members | 1105 | 2867-3997 / 3 | 1217-2569 / 1 | 1479-2350 / 0 |
| units | 1082 | 1008-2640 / 2 | 1874-3348 / 1 | 1052-2415 / 0 |
| properties | 877 | 1175-2758 / 1 | 1541-2076 / 0 | 739-1410 / 0 |
| dues | 1173 | 2138-2387 / 13 | 2912-5563 / 12 | 2286-3403 / 0 |
| payments | 1128 | 330-1038 / 15 | 789-1668 / 11 | 1682-1985 / 0 |
| payment_allocations | 1010 | 790-1756 / 15 | 1490-2237 / 12 | 541-1088 / 0 |
| units_with_financials | 1082 | 1093-2184 / 2 | 688-1218 / 1 | 1373-2713 / 0 |
| members_with_financials | 1105 | 1500-2435 / 3 | 1487-2206 / 1 | 496-648 / 0 |
