# Time of `select count(*)` per relation under RLS (ms), isolated stack, 839 organizations

| relation | total rows | staff ms (min-max) / sees | owner ms / sees | stranger ms / sees |
|---|---|---|---|---|
| chart_of_accounts | 13473 | 16505-27211 / 26 | 34440-40225 / 0 | 20130-31201 / 0 |
| fiscal_years | 1098 | 1626-2855 / 2 | 1261-2273 / 0 | 1835-2945 / 0 |
| fiscal_periods | 12626 | 11697-23920 / 24 | 5847-7395 / 0 | 5941-7169 / 0 |
| journal_entry_lines | 5624 | 1010-1462 / 105 | 1377-1415 / 0 | 1232-2057 / 0 |
| members | 1037 | 587-936 / 3 | 692-827 / 1 | 588-824 / 0 |
| units | 1017 | 527-1081 / 2 | 598-764 / 1 | 506-883 / 0 |
| properties | 825 | 442-466 / 1 | 636-901 / 0 | 420-702 / 0 |
| dues | 1096 | 1220-1518 / 13 | 1431-5095 / 12 | 1385-2004 / 0 |
| payments | 1043 | 288-702 / 15 | 648-804 / 11 | 537-612 / 0 |
| payment_allocations | 930 | 849-1161 / 15 | 946-1985 / 12 | 295-659 / 0 |
| units_with_financials | 1017 | 746-984 / 2 | 1228-2006 / 1 | 530-1057 / 0 |
| members_with_financials | 1037 | 495-851 / 3 | 494-803 / 1 | 451-599 / 0 |
