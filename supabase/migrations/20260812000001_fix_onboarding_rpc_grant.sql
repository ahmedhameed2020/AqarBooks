-- Phase 12 Fix: Grant EXECUTE on create_organization_onboarding to authenticated role
-- The original migration mistakenly REVOKED from authenticated without a subsequent GRANT.
-- SECURITY DEFINER already handles privilege escalation safely; the caller only needs
-- EXECUTE permission — the function runs as its owner (postgres), not as the caller.

GRANT EXECUTE
  ON FUNCTION public.create_organization_onboarding(text, text, text, text, text, text, text)
  TO authenticated;
