-- Migration: internal helper ACL hardening
--
-- These bytes are the migration. Apply this file VERBATIM, then commit it
-- unchanged under the version the ledger records. Its LOCATION is its status:
-- under scripts/demo/ it is pending, under supabase/migrations/ it is applied.
--
-- ===========================================================================
-- WHY, AND WHY THE FIRST TRIAGE WAS WRONG
-- ===========================================================================
-- A sweep of all 203 functions found fourteen that are SECURITY DEFINER,
-- granted EXECUTE to `authenticated`, write, and authorize nobody. The first
-- triage classified them by "does it move money?" and exempted nine.
--
-- That was the wrong question. The demo's promise is narrower and stricter:
--
--     a public visitor cannot mutate the database.
--
-- So the test is not severity, it is:
--
--     can an authenticated caller change tenant state through a
--     SECURITY DEFINER function with no authorization contract?
--
-- Under that rule, a sequence counter and a role clone are mutations, and the
-- five functions below stop being exemptions. Each is an INTERNAL helper: the
-- system calls it, a client never should.
--
-- ---------------------------------------------------------------------------
-- record_tax_decision_for_due_internal(uuid)
--   Named _internal, and the Phase 1 postamble revoked three of its siblings
--   -- create_journal_entry_internal, post_journal_entry_internal,
--   post_payment_internal -- while leaving this one executable by
--   `authenticated`. The naming convention says it should have gone with them.
--   The public path is record_tax_decision_for_due(), which is permission
--   checked; the trigger reaches the internal form as definer.
--
-- post_due_to_ledger(uuid)
--   Creates a POSTED journal entry from an existing due whenever a period is
--   OPEN. Being idempotent does not make it read-only: it performs an
--   accounting action, and after F0 opened May it was reachable. The public
--   path is recognize_pending_dues(), which checks finance.entries.post and
--   calls this internally. The dues trigger keeps working because it runs as
--   definer.
--
-- allocate_document_number(uuid, text, text, uuid, date)
-- next_sequence_value(uuid, uuid, text)
--   Both take an organization id from the caller with no authorization and
--   write document_number_counters / document_numbers / document_sequences.
--   No money moves, but a caller can consume document numbers or advance
--   another tenant's counters -- cross-tenant mutable state, which is exactly
--   what the rule above forbids.
--
-- clone_tenant_role_templates(uuid)
--   Writes roles and role_permissions for any organization id passed to it.
--   "Bounded by a unique constraint" is not authorization: against an
--   organization whose templates have not been cloned yet, an authenticated
--   caller can write roles into someone else's tenant. It belongs to
--   provisioning, not to clients.
--
-- ---------------------------------------------------------------------------
-- NOT INCLUDED
-- generate_lease_rent_dues stays executable by `authenticated`. It is a
-- legitimate business RPC that staff run, not an internal helper; its fix is
-- an authorization check inside the function, in the companion migration.
--
-- Verified before writing this: no application code calls any of the five
-- directly. The only mentions outside the generated types are in the seed
-- tooling, which runs as the service role.
--
-- ===========================================================================
-- HOW TO APPLY (ADR 0004 still prohibits `supabase db push`)
-- ===========================================================================
--   1. Apply through apply_migration, name `internal_helper_acls`.
--   2. Copy this file into supabase/migrations/ under the recorded version.
--   3. Add it to MIGRATION_FILES in tests/migration-directory-guard.test.ts.
--   4. Run `npm run test:security-definer`; the five move out of the sweep.
--   5. Run `npm run test:demo-rent-authz` for the direct-RPC probes.
--
-- service_role keeps EXECUTE on all five: the seed and any server-side job
-- runs as that role, and it already bypasses RLS entirely, so leaving it opens
-- nothing that was not already open.

begin;

revoke execute on function public.record_tax_decision_for_due_internal(uuid)
  from public, anon, authenticated;

revoke execute on function public.post_due_to_ledger(uuid)
  from public, anon, authenticated;

revoke execute on function public.allocate_document_number(uuid, text, text, uuid, date)
  from public, anon, authenticated;

revoke execute on function public.next_sequence_value(uuid, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.clone_tenant_role_templates(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Assert, rather than complete quietly. A hardening migration that silently
-- fails to harden is the failure being repaired.
-- ---------------------------------------------------------------------------
do $$
declare
  v_leaked text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'record_tax_decision_for_due_internal',
      'post_due_to_ledger',
      'allocate_document_number',
      'next_sequence_value',
      'clone_tenant_role_templates'
    )
    and (
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if v_leaked is not null then
    raise exception
      'INTERNAL_HELPER_ACL_FAILED: still executable by a client role: %', v_leaked;
  end if;

  -- And the service role must NOT have been caught by the revoke: the seed
  -- and the triggers' own paths depend on it.
  select string_agg(p.proname, ', ') into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'record_tax_decision_for_due_internal',
      'post_due_to_ledger',
      'allocate_document_number',
      'next_sequence_value',
      'clone_tenant_role_templates'
    )
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');

  if v_leaked is not null then
    raise exception
      'INTERNAL_HELPER_ACL_FAILED: service_role lost EXECUTE on: %', v_leaked;
  end if;
end
$$;

commit;

-- ===========================================================================
-- VERIFY AFTER APPLYING
-- ===========================================================================
--   select p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('record_tax_decision_for_due_internal','post_due_to_ledger',
--                       'allocate_document_number','next_sequence_value',
--                       'clone_tenant_role_templates');
--
-- Expected: auth false, anon false, svc true, for all five.
--
-- Then confirm the demo still works end to end: the dues trigger still posts
-- (it runs as definer), and recognize_pending_dues still reaches
-- post_due_to_ledger.
