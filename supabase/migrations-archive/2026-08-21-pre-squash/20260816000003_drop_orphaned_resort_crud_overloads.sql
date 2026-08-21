-- Drift-correction migration (2026-08-16): create_resort/update_resort
-- accumulated orphaned overloads live with no corresponding local file
-- (confirmed via full schema/function reconciliation audit -- the middle
-- overloads were evidently pasted directly into the SQL editor as
-- intermediate steps and never captured as migration files, and no
-- DROP FUNCTION for the superseded signatures exists anywhere in the
-- 127 on-disk migration files).
--
-- Impact assessed before running this: no live caller uses the shorter
-- forms. lib/actions/tenant.ts (the only app code path) always passes all
-- 8 named params for both functions. create_organization_onboarding
-- inserts into public.resorts directly rather than calling create_resort.
-- tests/e2e/owner-portal-isolation.spec.ts even has a code comment
-- documenting that the shorter overloads exist and cause ambiguity with
-- fewer named args, which is exactly the risk this migration removes.
--
-- Kept: create_resort(uuid, text, text, text, text, text, text, text) and
-- update_resort(uuid, text, text, text, text, text, text, text) -- the
-- 8-arg, contact-details-aware versions, matching all live call sites.

drop function if exists public.create_resort(uuid, text, text, text);
drop function if exists public.create_resort(uuid, text, text, text, text, text);
drop function if exists public.update_resort(uuid, text, text, text, text, text);
