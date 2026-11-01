-- Phase 3i: units_with_financials / members_with_financials compute their totals for the rows asked for, not for the whole platform.
--
-- Measured (docs/audits/phase3-evidence/task8-views/diagnosis.md): the views aggregated dues, allocations, ownerships and payments in
-- unfiltered CTEs and joined the result afterwards, so even a lookup of one member read every row the caller can see and evaluated the RLS
-- functions on each of them (one member = 76,743 buffers, ~2.5 s on the isolated stack; a foreign row costs ~1.3 ms, an own row ~0.3 ms).
--
-- Same relations, same security_invoker, same column list / order / types, same arithmetic and same joins; only the shape changes: each total
-- is now a LATERAL subquery keyed on the unit / member being returned, so a lookup by id reads that unit's rows through the existing
-- unit_id / due_id indexes. RLS still applies to every base-table row the caller reads (no policy, grant or timeout is touched).
--
-- Semantics kept on purpose:
--   * total_paid sums the allocations of ALL the unit's dues INCLUDING void dues (as before: only total_due excludes VOID).
--   * the current owner is the first ownership by (is_primary_contact desc, share_percentage desc, start_date desc); the ownership's
--     member row is joined through members RLS, so an owner the caller cannot see is still no owner.
--   * a unit / member with no rows gets 0 / NULL exactly as the old LEFT JOINs did (COALESCE kept).
--
-- New index: the last-payment lookup is per member and payments had no index on member_id.

CREATE INDEX IF NOT EXISTS idx_payments_member_posted
  ON public.payments (member_id, payment_date DESC, created_at DESC)
  WHERE status = 'POSTED' AND member_id IS NOT NULL;

CREATE OR REPLACE VIEW public.units_with_financials WITH (security_invoker = true) AS
SELECT u.id,
    u.organization_id,
    u.property_id,
    u.building_id,
    u.zone_id,
    u.code,
    u.unit_type,
    u.floor_number,
    u.area,
    u.is_active,
    b.name_ar AS building_name_ar,
    b.name_en AS building_name_en,
    z.name_ar AS zone_name_ar,
    z.name_en AS zone_name_en,
    co.owner_id,
    co.owner_name,
        CASE
            WHEN co.owner_id IS NOT NULL THEN 'OCCUPIED'::text
            ELSE 'VACANT'::text
        END AS occupancy_status,
    COALESCE(t.total_due, 0::numeric)::numeric(19,4) AS total_due,
    COALESCE(t.total_paid, 0::numeric)::numeric(19,4) AS total_paid,
    (COALESCE(t.total_due, 0::numeric) - COALESCE(t.total_paid, 0::numeric))::numeric(19,4) AS balance,
    (COALESCE(t.total_due, 0::numeric) - COALESCE(t.total_paid, 0::numeric)) > 0::numeric AS has_arrears,
    u.custom_type_label,
    co.owner_phone,
    u.archived_at
   FROM units u
     LEFT JOIN buildings b ON b.id = u.building_id
     LEFT JOIN zones z ON z.id = u.zone_id
     LEFT JOIN LATERAL (
        -- ONE pass over the unit's dues (RLS is evaluated per due, so reading them twice doubled the cost): total_due excludes VOID dues,
        -- total_paid counts the allocations of every due of the unit (void ones included), exactly as the two separate CTEs did.
        -- Allocations are fetched per due by due_id: starting from payments instead made the planner scan all payments once per unit
        -- (measured: 6.2M buffers / 72 s for 1,502 units against 0.76M / 3 s before this migration).
        SELECT sum(d.amount) FILTER (WHERE d.status <> 'VOID'::text) AS total_due,
            sum(x.paid) AS total_paid
          FROM dues d
            LEFT JOIN LATERAL (
               SELECT sum(pa.amount) AS paid
                 FROM effective_payment_allocations pa
                WHERE pa.due_id = d.id
            ) x ON true
         WHERE d.unit_id = u.id
     ) t ON true
     LEFT JOIN LATERAL (
        SELECT uo.member_id AS owner_id,
            m.full_name AS owner_name,
            m.phone AS owner_phone
          FROM unit_ownerships uo
            JOIN members m ON m.id = uo.member_id
         WHERE uo.unit_id = u.id AND (uo.end_date IS NULL OR uo.end_date >= CURRENT_DATE)
         ORDER BY uo.is_primary_contact DESC, uo.share_percentage DESC, uo.start_date DESC
         LIMIT 1
     ) co ON true;

CREATE OR REPLACE VIEW public.members_with_financials WITH (security_invoker = true) AS
SELECT m.id,
    m.organization_id,
    m.full_name,
    m.is_company,
    m.email,
    m.phone,
    COALESCE(ma.units_count, 0::bigint) AS units_count,
    COALESCE(ma.total_balance, 0::numeric)::numeric(19,4) AS total_balance,
    COALESCE(ma.total_balance, 0::numeric) > 0::numeric AS has_arrears,
    lp.last_payment_amount,
    lp.last_payment_date,
    m.user_id,
    m.archived_at
   FROM members m
     LEFT JOIN LATERAL (
        SELECT count(*) AS units_count,
            sum(uwf.balance) AS total_balance
          FROM unit_ownerships ao
            JOIN units_with_financials uwf ON uwf.id = ao.unit_id
         WHERE ao.member_id = m.id AND (ao.end_date IS NULL OR ao.end_date >= CURRENT_DATE)
     ) ma ON true
     LEFT JOIN LATERAL (
        SELECT p.amount AS last_payment_amount,
            p.payment_date AS last_payment_date
          FROM payments p
         WHERE p.member_id = m.id AND p.status = 'POSTED'::text
         ORDER BY p.payment_date DESC, p.created_at DESC
         LIMIT 1
     ) lp ON true;
