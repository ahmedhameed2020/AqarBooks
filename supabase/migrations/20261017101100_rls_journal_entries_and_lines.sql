-- RLS: journal_entries and journal_entry_lines -- evaluate the permission checks once per statement (approved scope: these two tables, together, in one migration).
--
-- Measured (docs/audits/phase3-evidence/task10-rls/journal-entry-lines-proposal.md): the lines policy is planned as ONE hashed sub-plan over journal_entries,
-- so its cost is the scan of journal_entries (3,269 rows, 87,516 buffers) where every row paid THREE permission checks: the journal_entries select policy (two
-- has_permission calls) plus the lines policy's has_any_permission. Rewriting the lines policy alone gave no gain (3.3 s -> 4.1 s); rewriting both reaches ~13 ms.
-- It made `HEAD /journal_entry_lines` answer HTTP 500 / 57014 (8 s statement_timeout) in tests/membership-status-access.integration.test.ts.
--
-- Same technique as migrations 20261017100900 / 20261017101000: public.orgs_with_permission_keys() returns the caller's own organizations holding any listed key,
-- the platform-admin check is an uncorrelated scalar sub-select (an InitPlan, executed once per statement).
--   * journal_entries: has_permission(k1) OR has_permission(k2)  ==  organization_id IN orgs_with_permission_keys({k1,k2})  (or platform admin).
--   * journal_entry_lines: the entries the caller may see (the sub-select on journal_entries still runs under THAT table's RLS, exactly as the old EXISTS did)
--     whose organization the caller holds one of the five keys in, or any entry for a platform admin.
--
-- Scope and safety: each table has exactly ONE policy, a SELECT policy; there is no INSERT / UPDATE / DELETE policy and none is added or changed (writes keep
-- being denied by default under RLS; they go through SECURITY DEFINER functions). No grant, function or timeout is touched. Equivalence of BOTH tables with the
-- previous expressions, for every role / state, and the unchanged write denial: tests/rls-journal-entry-lines-equivalence.integration.test.ts.

ALTER POLICY journal_entries_select_permission ON public.journal_entries
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.reports.read'::text, 'finance.entries.create'::text]))
  );

ALTER POLICY journal_entry_lines_select_permission ON public.journal_entry_lines
  USING (
    journal_entry_id IN (
      SELECT je.id FROM public.journal_entries je
       WHERE (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
          OR je.organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
               'finance.reports.read'::text, 'finance.entries.create'::text, 'finance.entries.review'::text,
               'finance.accounts.view'::text, 'finance.audit.read'::text]))
    )
  );
