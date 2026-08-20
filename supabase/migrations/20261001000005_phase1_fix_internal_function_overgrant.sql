-- Phase 1 security remediation — migration 5 of 4 (corrective)
--
-- Repairs a regression introduced by migration 4
-- (20261001000004_phase1_revoke_anon_function_execute).
--
-- WHAT WENT WRONG
-- Migration 4 looped over every application function and executed an
-- unconditional `GRANT EXECUTE ... TO authenticated` while revoking PUBLIC and
-- anon. Its own header stated "The `authenticated` surface is INTENTIONALLY
-- UNCHANGED", but the unconditional grant did not preserve the prior state --
-- it granted EXECUTE to `authenticated` on nine functions that previously had
-- none. Advisor count for authenticated_security_definer_function_executable
-- moved 169 -> 178, which is how this was caught.
--
-- WHY IT MATTERS
-- Two of the nine are the unguarded internals that the permission-checked
-- wrappers exist to protect:
--   post_payment_internal        <- wrapped by record_payment
--   post_journal_entry_internal  <- wrapped by post_journal_entry
-- Direct `authenticated` access to those would have let any signed-in user
-- bypass the very guard migration 3 had just hardened. Also newly exposed:
--   get_payment_provider_credentials  (payment provider secrets)
--   append_financial_audit_event      (forging audit-trail entries)
--   create_journal_entry_internal, record_online_payment,
--   run_lease_rent_generation, expire_stale_member_invitations,
--   expire_stale_online_payment_transactions
--
-- FIX
-- Revoke EXECUTE from `authenticated` on exactly these nine, restoring the
-- pre-migration-4 ACL. service_role retains EXECUTE -- the six reached from
-- application code are all called through the service-role admin client, and
-- the three *_internal helpers are called from inside other SECURITY DEFINER
-- functions, which run as the owner and need no role grant at all.
--
-- No function body is modified. No financial data is touched.

REVOKE EXECUTE ON FUNCTION
  public.append_financial_audit_event(uuid,text,text,uuid,uuid,text,inet,text,jsonb)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.create_journal_entry_internal(uuid,uuid,uuid,date,text,text,jsonb,text)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.expire_stale_member_invitations()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.expire_stale_online_payment_transactions()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.get_payment_provider_credentials(uuid,uuid,text,text)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.post_journal_entry_internal(uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.post_payment_internal(uuid,uuid,uuid,uuid,numeric,text,date,uuid,uuid,jsonb,text,uuid,uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.record_online_payment(uuid,text,jsonb)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  public.run_lease_rent_generation()
  FROM authenticated;
