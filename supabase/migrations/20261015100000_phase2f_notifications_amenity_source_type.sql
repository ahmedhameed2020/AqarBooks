-- Phase 2f: restore 'amenity_booking' as an allowed notification source type.
--
-- 20260917040349_amenity_bookings added 'amenity_booking' to notifications_source_type_check; the later
-- 20260925182911_gate_notifications rebuilt the constraint from a fixed list that omitted it. The amenity lifecycle trigger
-- (notify_amenity_booking_lifecycle) inserts source_type = 'amenity_booking', so on a database built from the migrations every
-- amenity decision / cancellation that notifies the owner fails with a check violation and rolls back.
--
-- This forward migration keeps whatever the constraint currently allows (read from the live definition, so a database that
-- gained other types keeps them) and adds 'amenity_booking'. If the constraint is missing it is recreated from the known
-- baseline. It is idempotent and never narrows the list. Existing rows are unaffected (the list only grows).

DO $$
DECLARE
  v_def   text;
  v_types text[];
  v_base  constant text[] := ARRAY[
    'maintenance_request', 'maintenance_request_update', 'work_order', 'work_order_update', 'work_order_cost',
    'visitor_invitation', 'access_event', 'due', 'payment', 'vehicle', 'lease_expiry_dispatch', 'gate_manual_exception'
  ];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.notifications'::regclass AND c.conname = 'notifications_source_type_check';

  IF v_def IS NULL THEN
    v_types := v_base;
  ELSE
    SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO v_types
    FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;
  END IF;

  IF NOT ('amenity_booking' = ANY (v_types)) THEN
    v_types := array_append(v_types, 'amenity_booking');
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check CHECK (source_type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ' ORDER BY t) FROM unnest(v_types) AS t)
  );
END
$$;
