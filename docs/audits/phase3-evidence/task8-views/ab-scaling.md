# old vs new view definitions, same data (scratch_ab, 1 organization, staff session under RLS; min of 3 runs; buffers = top-node shared hits)

| size | query | old ms | new ms | old buffers | new buffers |
|---|---|---|---|---|---|
| 2 units / 13 dues / 3 members | Q2 one member | 48 | 42 | 4003 | 3426 |
| 2 units / 13 dues / 3 members | Q1 one member's units | 42 | 55 | 3482 | 5892 |
| 2 units / 13 dues / 3 members | Q3 25 units (list page) | 59 | 52 | 3429 | 9204 |
| 2 units / 13 dues / 3 members | Q4/Q5 ALL units of the org (KPI) | 49 | 59 | 3490 | 9250 |
| 2 units / 13 dues / 3 members | Q6 25 members (list page) | 74 | 240 | 3831 | 9484 |
| 2 units / 13 dues / 3 members | ALL members of the org (KPI) | 45 | 97 | 3487 | 9534 |
| 102 units / 663 dues / 153 members | Q2 one member | 392 | 284 | 100328 | 5909 |
| 102 units / 663 dues / 153 members | Q1 one member's units | 567 | 223 | 102860 | 5861 |
| 102 units / 663 dues / 153 members | Q3 25 units (list page) | 1045 | 3712 | 104634 | 423501 |
| 102 units / 663 dues / 153 members | Q4/Q5 ALL units of the org (KPI) | 468 | 9933 | 104682 | 423545 |
| 102 units / 663 dues / 153 members | Q6 25 members (list page) | 464 | 8582 | 106492 | 429713 |
| 102 units / 663 dues / 153 members | ALL members of the org (KPI) | 947 | 10940 | 105695 | 429763 |
| 402 units / 2613 dues / 603 members | Q2 one member | 6269 | 47 | 383322 | 5905 |
| 402 units / 2613 dues / 603 members | Q1 one member's units | 1826 | 41 | 393356 | 5857 |
| 402 units / 2613 dues / 603 members | Q3 25 units (list page) | 1816 | 16657 | 400530 | 1663787 |
| 402 units / 2613 dues / 603 members | Q4/Q5 ALL units of the org (KPI) | 3597 | 23884 | 400578 | 1663835 |
| 402 units / 2613 dues / 603 members | Q6 25 members (list page) | 2956 | 17809 | 405387 | 1688004 |
| 402 units / 2613 dues / 603 members | ALL members of the org (KPI) | 2562 | 12595 | 404590 | 1688054 |
| 1502 units / 9763 dues / 2253 members | Q2 one member | 3787 | 80 | 698906 | 5905 |
| 1502 units / 9763 dues / 2253 members | Q1 one member's units | 2329 | 87 | 736606 | 5857 |
| 1502 units / 9763 dues / 2253 members | Q3 25 units (list page) | 3623 | 78492 | 763431 | 6211532 |
| 1502 units / 9763 dues / 2253 members | Q4/Q5 ALL units of the org (KPI) | 2994 | 72097 | 763479 | 6211580 |
| 1502 units / 9763 dues / 2253 members | Q6 25 members (list page) | 3813 | 74944 | 779296 | 6301757 |
| 1502 units / 9763 dues / 2253 members | ALL members of the org (KPI) | 3564 | 58102 | 778499 | 6301807 |
