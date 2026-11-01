-- DELIBERATELY WRONG (negative control, scratch_rls only)
ALTER POLICY journal_entries_select_permission ON public.journal_entries
  USING (organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.reports.read'::text])));
ALTER POLICY journal_entry_lines_select_permission ON public.journal_entry_lines
  USING (journal_entry_id IN (SELECT je.id FROM public.journal_entries je
          WHERE (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
             OR je.organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.view'::text]))));
