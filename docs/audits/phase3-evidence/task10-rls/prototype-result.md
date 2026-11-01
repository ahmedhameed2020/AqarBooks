# PROTOTYPE in scratch_rls (a copy of the isolated stack; the stack's policies were not touched)

Principals compared: 8 x staff, 8 x owner, 4 x invited_or_suspended, 1 x stranger

## Same rows? (visible ids per principal and table, old vs new, both directions)
| table | rows seen by all principals (old) | rows only in NEW | rows only in OLD |
|---|---|---|---|
| chart_of_accounts | 208 | 0 | 0 |
| fiscal_periods | 192 | 0 | 0 |
| dues | 188 | 0 | 0 |

## Time of `select count(*)` under RLS
| table | principal | current policy ms (min-max) | set-based policy ms (min-max) |
|---|---|---|---|
| chart_of_accounts | staff | 29995-46433 | 528-671 |
| fiscal_periods | staff | 25260-42795 | 764-965 |
| dues | staff | 846-1515 | 924-1313 |
| chart_of_accounts | stranger | 6240-17652 | 462-1582 |
| fiscal_periods | stranger | 9284-32139 | 394-702 |
| dues | stranger | 3146-5096 | 813-1400 |
