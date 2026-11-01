-- RLS: fiscal_years -- evaluate the permission checks once per statement (approved scope: this one table; no other table is touched).
--
-- Measured (docs/audits/phase3-evidence/task10-rls/fiscal-years-proposal.md): `count(*)` over 1,394 rows took ~4.4 s under load (37,100 buffers) because the SELECT
-- policy called has_any_permission() and the ALL "manage" policy called has_permission() + organization_is_active() for every row (~440 us and ~240 us per call);
-- `HEAD /fiscal_years` answered HTTP 500 / 57014 (8 s statement_timeout) once in tests/membership-status-access.integration.test.ts.
--
-- Same technique as migrations 20261017100900 / 101000 / 101100: public.orgs_with_permission_keys() returns the caller's own organizations holding any listed key,
-- and the platform-admin check is an uncorrelated scalar sub-select (an InitPlan, executed once per statement). organization_is_active() stays as the extra AND.
-- The ALL policy keeps USING and WITH CHECK identical to each other, as before.
--
-- Nothing is widened or narrowed: same rows readable, updatable, deletable and insertable for every principal (tests/rls-fiscal-years-equivalence.integration.test.ts
-- compares the installed policies with the previous expressions for reads, inserts, updates, deletes and WITH CHECK, for every role / state). No grant, function or
-- timeout is touched; no policy is added or removed (still exactly one SELECT policy and one ALL policy).

ALTER POLICY fiscal_years_select_permission ON public.fiscal_years
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
         'finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text]))
  );

ALTER POLICY fiscal_years_manage ON public.fiscal_years
  USING (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  )
  WITH CHECK (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  );
