-- Phase 2f (part 2): restore the AMENITY_BOOKING_* notification TYPES.
--
-- The same 20260925182911_gate_notifications rebuild that dropped the 'amenity_booking' source type (restored by
-- 20261015100000) also rebuilt notifications_type_check from a list without the four types the amenity lifecycle trigger
-- produces ('AMENITY_BOOKING_' || status): REQUESTED, CONFIRMED, REJECTED, CANCELLED. Both constraints had to be fixed
-- before an amenity booking could notify its owner. Like part 1 this keeps whatever the constraint currently allows, only
-- adds the four, recreates the constraint from the known baseline if it is missing, and is idempotent.

DO $$
DECLARE
  v_def   text;
  v_types text[];
  v_t     text;
  v_base  constant text[] := ARRAY[
    'REQUEST_RECEIVED', 'MAINTENANCE_UPDATE', 'WORK_ORDER_SCHEDULED', 'WORK_STARTED', 'WORK_COMPLETED', 'OWNER_CHARGE_CREATED',
    'VISITOR_INVITATION_CREATED', 'VISITOR_ENTERED', 'VISITOR_EXITED', 'INVITATION_REVOKED', 'DUE_CREATED', 'PAYMENT_CONFIRMED',
    'RECEIPT_AVAILABLE', 'VEHICLE_REGISTERED', 'VEHICLE_DEACTIVATED', 'LEASE_EXPIRY_REMINDER', 'VISITOR_SECURITY_ALERT',
    'VISITOR_MANUAL_EXCEPTION'
  ];
  v_amenity constant text[] := ARRAY[
    'AMENITY_BOOKING_REQUESTED', 'AMENITY_BOOKING_CONFIRMED', 'AMENITY_BOOKING_REJECTED', 'AMENITY_BOOKING_CANCELLED'
  ];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.notifications'::regclass AND c.conname = 'notifications_type_check';

  IF v_def IS NULL THEN
    v_types := v_base;
  ELSE
    SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO v_types
    FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;
  END IF;

  FOREACH v_t IN ARRAY v_amenity LOOP
    IF NOT (v_t = ANY (v_types)) THEN
      v_types := array_append(v_types, v_t);
    END IF;
  END LOOP;

  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ' ORDER BY t) FROM unnest(v_types) AS t)
  );
END
$$;
