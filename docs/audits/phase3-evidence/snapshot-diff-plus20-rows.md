# The single difference between the pre-C snapshot and the state after migration C: +20, by rows

Nothing was deleted or cleaned to make the comparison match; the rows below are still in the isolated stack.

| What | Id |
|---|---|
| Unit whose balance changed | `0b883461-01f4-407e-9dbe-47d1763833d5` (A-101, organization `0b13510a-dd4a-4807-8295-0fcc9b3c2128`) — balance 3770 -> 3790 (total due 5000, paid 1210) |
| Its owner member (`members_with_financials.total_balance` 3770 -> 3790) | `d0bc3b56-0c32-475d-82d9-69c143ac93e9` |
| Due they were allocated against | `6999e932-e510-4b3d-955f-66b62268ff5d` (amount 300) |
| Receipt 1: POSTED, **no journal entry** | `8565288d-1d5e-42cb-afd2-517937379a08`, allocation `714149a7-83fe-4ced-9409-e335d71b7279` = 10.0000 |
| Receipt 2: POSTED, journal entry in **DRAFT** | `540b246a-c686-4bc7-8f42-846b2579ab94`, allocation `90e262b2-e31e-496c-8110-efb182afe41e` = 10.0000 |

Origin: both receipts are synthetic stand-ins inserted by the RED run of `tests/customer-advances-integrity.integration.test.ts` (section 2). That run failed before its
cleanup step, so they stayed. Before migration C the readers counted their allocations (status-only); after it they require a posted receipt entry, as the specification says,
so 10 + 10 = 20 of "paid" disappeared: 3770 + 20 = 3790. Every other row of the five compared tables (units_with_financials 416 rows, members_with_financials 410,
due_outstanding 328, payments 287, payment_allocations 236) is byte-identical; the rows that appear only in the later state are fixtures created after the snapshot.

Reproduce (read-only):
```sql
select a.id, a.payment_id, a.amount, coalesce(je.status,'NO ENTRY')
from public.payment_allocations a join public.payments p on p.id=a.payment_id left join public.journal_entries je on je.id=p.journal_entry_id
where a.payment_id in ('8565288d-1d5e-42cb-afd2-517937379a08','540b246a-c686-4bc7-8f42-846b2579ab94');
select balance from public.units_with_financials where id='0b883461-01f4-407e-9dbe-47d1763833d5';   -- 3790.0000
```
The same two receipts are what `due_outstanding` (status-only, unchanged) still counts for due `6999e932…`: 300 - 20 = 280 owed by that function vs 300 by the readers.
