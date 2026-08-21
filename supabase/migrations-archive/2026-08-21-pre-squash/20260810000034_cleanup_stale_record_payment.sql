-- Cleanup: the Phase 4 idempotency migration (20260810000027) used
-- CREATE OR REPLACE while adding a new parameter (p_idempotency_key).
-- Postgres treats a changed argument list as a NEW overload rather than a
-- replacement, so the original pre-idempotency 10-argument record_payment
-- was left behind as dead, unused code instead of being removed. Found
-- while verifying Phase 5's migration state. Harmless in practice (nothing
-- calls the old signature) but should not exist.
drop function if exists public.record_payment(
  uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb
);
