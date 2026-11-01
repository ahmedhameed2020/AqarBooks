-- PROPOSAL ONLY (not in supabase/migrations, not applied anywhere). Needs approval, and the approval must include journal_entries (a table outside the
-- three approved ones), because rewriting journal_entry_lines alone does not help (measured: jel-prototype.md).
-- Equivalence proof, independent of the application: tests/rls-journal-entry-lines-equivalence.integration.test.ts (negative control fails as required).

-- 1) journal_entries select policy: same rule (reports.read OR entries.create in the caller's organization, or platform admin), evaluated once per statement
ALTER POLICY journal_entries_select_permission ON public.journal_entries
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.reports.read'::text, 'finance.entries.create'::text]))
  );

-- 2) journal_entry_lines select policy: the entries the caller may see through journal_entries (its own RLS still applies to the sub-select, as before)
--    whose organization the caller holds one of the listed keys in, or any entry for a platform admin
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
