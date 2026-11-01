-- Fiscal calendar: revoke TRUNCATE on public.fiscal_years and public.fiscal_periods from client-facing roles.
-- Forward-only; no earlier migration is edited.
--
-- Why: the baseline grants ALL ON TABLE to anon, authenticated and service_role on both tables
-- (20260821105505_baseline.sql:20659-20667). ALL includes TRUNCATE. Row-level security does not apply to
-- TRUNCATE, and row-level triggers (including trg_fiscal_periods_status_guard and trg_fiscal_years_status_guard,
-- 20261019100100_fiscal_year_close_guards.sql:143-150) do not fire on it either. Any of those roles could therefore
-- empty an organization's fiscal calendar in one statement, bypassing every policy and guard. No client path needs
-- TRUNCATE: writes go through the RLS policies and the guarded functions.
--
-- Scope: only TRUNCATE on these two tables. postgres (the owner) keeps all privileges. PUBLIC holds no grant on
-- these tables (the baseline grants name only anon, authenticated and service_role), so it is not named here.
-- No GRANT, policy or ALTER DEFAULT PRIVILEGES is added.
--
-- Default privileges: the baseline's ALTER DEFAULT PRIVILEGES FOR ROLE postgres ... GRANT ALL ON TABLES
-- (20260821105505_baseline.sql:21053-21056) apply only to tables created after they run. They do not re-grant
-- anything on these existing tables. They would matter only if a later migration dropped and recreated either table.

REVOKE TRUNCATE ON TABLE public.fiscal_years FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.fiscal_periods FROM anon, authenticated, service_role;
