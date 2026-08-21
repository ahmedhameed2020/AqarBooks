-- Phase 1 security remediation — migration 2 of 4
--
-- Closes the confirmed production tenant-isolation leak.
--
-- BEFORE: public.lease_rent_generation_runs had RLS disabled and zero
-- policies, while `anon` held SELECT, INSERT, UPDATE, DELETE and TRUNCATE.
-- An unauthenticated caller holding only the public publishable key could
-- read 9 rows spanning 9 distinct organizations -- verified live against
-- production -- and could equally have destroyed them. Because this table is
-- the idempotency guard for lease rent generation, truncating it would have
-- allowed duplicate rent dues to be generated on the next run.
--
-- The policy mirrors due_generation_runs_select_permission on the sibling
-- table, so the two rent/due generation logs now behave identically.
--
-- Write paths are unaffected: the table is written by
-- generate_lease_rent_dues(), which is SECURITY DEFINER and therefore
-- bypasses RLS, and is reached from the dues page through the service-role
-- client, which also bypasses RLS. Pre-flight confirmed zero direct reads of
-- this table anywhere in application or test code.

ALTER TABLE public.lease_rent_generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY lease_rent_generation_runs_select_permission
  ON public.lease_rent_generation_runs
  FOR SELECT
  USING (public.has_permission(auth.uid(), organization_id, 'finance.schedules.read'));

-- anon has no legitimate access to this table at all.
REVOKE ALL ON public.lease_rent_generation_runs FROM anon;

-- authenticated reads through the policy above; it never writes directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lease_rent_generation_runs FROM authenticated;
GRANT SELECT ON public.lease_rent_generation_runs TO authenticated;
