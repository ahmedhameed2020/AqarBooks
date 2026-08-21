-- Baseline companion — application objects outside the `public` schema
--
-- WHY THIS FILE EXISTS
-- `supabase db dump` excludes the `auth` schema by design (see its
-- --exclude-schema list). Production carries exactly one application object
-- there, and the schema dump therefore omits it. A baseline consisting of the
-- dump alone produces a database where every new user signs up successfully
-- and then has no `profiles` row — a failure invisible until someone
-- registers.
--
-- SCOPE — verified, not assumed
-- Production has 6 non-internal triggers outside `public`. Exactly ONE is
-- ours; the other five belong to Supabase's own subsystems and must NOT be
-- recreated by us:
--
--   auth.users      trg_on_auth_user_created  -> public.handle_new_user     <- OURS
--   realtime.subscription  tr_check_filters              -> realtime.*      platform
--   storage.buckets enforce_bucket_name_length_trigger   -> storage.*       platform
--   storage.buckets protect_buckets_delete               -> storage.*       platform
--   storage.objects protect_objects_delete               -> storage.*       platform
--   storage.objects update_objects_updated_at            -> storage.*       platform
--
-- ORDERING
-- Apply AFTER the schema baseline. `public.handle_new_user()` is created
-- there; this file only wires the trigger to it.
--
-- OWNERSHIP CAVEAT
-- `auth.users` is owned by `supabase_auth_admin`, not `postgres`. Creating a
-- trigger on it requires sufficient privilege. On Supabase this works when the
-- baseline is applied as `postgres`, which is how the original migration
-- created it — but it is a privilege dependency worth knowing about before
-- restoring into any non-Supabase Postgres.
--
-- ONE DELIBERATE DIFFERENCE FROM PRODUCTION
-- Production's stored definition is:
--     EXECUTE FUNCTION handle_new_user()      -- unqualified
-- resolved through search_path at creation time. This file writes it as
--     EXECUTE FUNCTION public.handle_new_user()
-- Same target function; the qualification removes a dependency on whatever
-- search_path happens to be active when the baseline is applied. Step 5 must
-- confirm the two resolve identically rather than taking this on trust.

-- Fail loudly if the schema baseline has not been applied first. Without this
-- guard a missing function would surface later as silently broken signup
-- rather than as a failed restore.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION
      'BASELINE_ORDER_ERROR: public.handle_new_user() is missing. Apply the schema baseline before this file.';
  END IF;
END
$$;

-- Idempotent: CREATE OR REPLACE TRIGGER (PostgreSQL 14+) replaces an existing
-- trigger of the same name on the same table atomically, so re-running the
-- baseline is safe. Production runs PostgreSQL 17.
CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
