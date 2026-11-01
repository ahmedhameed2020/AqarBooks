\set ON_ERROR_STOP 1
select je.id,
       je.description,
       je.status,
       je.reversed_entry_id,
       je.posted_at is not null as has_posted_at,
       exists(select 1 from public.journal_entries r where r.reversed_entry_id = je.id) as has_reversal_entry
from public.journal_entries je
where je.id in (
  'abea6168-b53c-4760-a711-c66064ae594b',
  '8d9c9461-6695-451a-9276-4c83fb6bf315',
  '0ecbc9e8-90a8-4544-bf0b-b6a18135129a',
  '3e0a6d91-8f48-4148-ab24-91354302d68e',
  'dddddddd-0000-4000-8000-0000000000a2'
)
order by je.created_at, je.id;
