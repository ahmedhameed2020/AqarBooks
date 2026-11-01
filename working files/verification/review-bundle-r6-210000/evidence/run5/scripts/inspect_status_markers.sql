\set ON_ERROR_STOP 1
\echo ==== Status-only cancelled draft versus genuine posted-then-reversed entries
select je.id,
       je.description,
       je.status,
       je.reversed_entry_id,
       je.posted_at is not null as has_posted_at,
       exists(select 1 from public.journal_entries r where r.reversed_entry_id = je.id) as has_reversal_entry
from public.journal_entries je
where je.description in ('E draft 300 to be cancelled', 'wip seq2 capitalise', 'wip seq2 release', 'wip seq2 reverse release', 'wip seq2 reverse cap')
   or je.id = 'dddddddd-0000-4000-8000-0000000000a2'
order by je.created_at, je.id;
\echo ==== Reversed-row marker profile across r6 (counts only)
select exists(select 1 from public.journal_entries r where r.reversed_entry_id = je.id) as has_reversal_entry,
       je.posted_at is not null as has_posted_at,
       count(*)
from public.journal_entries je
where je.status = 'REVERSED'
group by 1, 2
order by 1, 2;
\echo ==== Current summary for the existing cancelled-draft fixture
select capitalised, released, wip_balance
from public.project_wip_summary('bbbbbbb1-0000-4000-8000-000000000208');
