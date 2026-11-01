# The eight page queries, before/after the migration (isolated stack, 839 orgs; staff/owner sessions under RLS; median of 3; buffers = top-node shared hits)

| query (839-org stack) | before median ms | after median ms | before buffers | after buffers |
|---|---|---|---|---|
| Q1 member page: units of one member (id = ANY) | 2064 | 30 | 75236 | 2568 |
| Q2 member page: the member row | 3479 | 31 | 76743 | 2861 |
| Q3 property list page: first 25 units + exact count | 2630 | 31 | 75181 | 2513 |
| Q4 property KPI strip: every unit's status and balance | 2623 | 26 | 75234 | 2566 |
| Q5 members page KPI: every unit balance of the organization | 2177 | 24 | 51219 | 2566 |
| Q6 members list: first 25 members | 2437 | 56 | 86861 | 2904 |
| Q7 portal units page: the owner's units (RLS only, no filter) | 2243 | 556 | 91419 | 27049 |
| Q8 portal home: the owner's member row | 2045 | 53 | 91817 | 4108 |
