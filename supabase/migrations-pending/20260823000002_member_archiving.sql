-- Owner records: archive instead of delete.
--
-- WHY
-- There was no way to remove a member at all, and a plain DELETE is not the
-- missing feature. The foreign keys pointing at public.members split into two
-- groups, and both make a delete button a bad button:
--
--   CASCADE   unit_ownerships, member_documents, member_phones,
--             member_invitations, member_tag_assignments,
--             member_activity_log, online_payment_transactions
--   NO ACTION payments, cheques, unit_leases, installment_plans, tax_decisions
--
-- So an owner with any financial history cannot be deleted at all, and an owner
-- without one is deleted along with their ownership links and their uploaded
-- contracts -- whose files stay behind in storage, now unreferenced.
--
-- Worse, `dues` references the UNIT, not the member. Cascading away
-- unit_ownerships leaves those dues alive in the ledger with nobody attached to
-- them: debts that no statement and no portal will ever show again.
--
-- An owner is a financial counterparty. It gets retired, not erased. Hard
-- delete survives only as a narrow cleanup for a record that never touched
-- anything, and the application checks that before offering it.
--
-- Mirrors the columns units already uses (archived_at / archived_by), so the
-- two entity types retire the same way.
--
-- NOTE ON THIS FILE'S LOCATION
-- supabase/migrations-pending/, not supabase/migrations/ -- the directory guard
-- pins the latter to the single squashed baseline. Applied via MCP.

begin;

alter table public.members
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists archive_reason text;

comment on column public.members.archived_at is
  'Retired from active lists. History, statements and ledger entries are unaffected.';
comment on column public.members.archive_reason is
  'Why this owner was retired. Required by the application when archiving.';

-- Active-member lookups are the common path; keep them off the archived rows.
create index if not exists idx_members_active
  on public.members (organization_id)
  where archived_at is null;

-- The members list reads members_with_financials, so the view has to carry the
-- archive flag or the list cannot filter on it. user_id comes along in the same
-- pass: the list needs to show who actually has portal access, and reading
-- member_invitations is not an option there (RLS-enabled with no policies at
-- all, so it is unreadable through a security_invoker view).
--
-- CREATE OR REPLACE VIEW may only append columns, never reorder or rename the
-- existing ones, so the two new columns go last and everything above is
-- byte-identical to the deployed definition.
create or replace view public.members_with_financials
with (security_invoker = true) as
 WITH active_ownerships AS (
         SELECT uo.member_id,
            uo.unit_id
           FROM unit_ownerships uo
          WHERE uo.end_date IS NULL OR uo.end_date >= CURRENT_DATE
        ), member_aggregates AS (
         SELECT ao.member_id,
            count(*) AS units_count,
            sum(uwf.balance) AS total_balance
           FROM active_ownerships ao
             JOIN units_with_financials uwf ON uwf.id = ao.unit_id
          GROUP BY ao.member_id
        ), last_payment AS (
         SELECT DISTINCT ON (p.member_id) p.member_id,
            p.amount AS last_payment_amount,
            p.payment_date AS last_payment_date
           FROM payments p
          WHERE p.status = 'POSTED'::text AND p.member_id IS NOT NULL
          ORDER BY p.member_id, p.payment_date DESC, p.created_at DESC
        )
 SELECT m.id,
    m.organization_id,
    m.full_name,
    m.is_company,
    m.email,
    m.phone,
    COALESCE(ma.units_count, 0::bigint) AS units_count,
    COALESCE(ma.total_balance, 0::numeric)::numeric(19,4) AS total_balance,
    COALESCE(ma.total_balance, 0::numeric) > 0::numeric AS has_arrears,
    lp.last_payment_amount,
    lp.last_payment_date,
    m.user_id,
    m.archived_at
   FROM members m
     LEFT JOIN member_aggregates ma ON ma.member_id = m.id
     LEFT JOIN last_payment lp ON lp.member_id = m.id;

commit;
