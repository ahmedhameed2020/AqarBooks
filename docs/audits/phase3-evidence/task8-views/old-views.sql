-- pre-migration (20261017100700) definitions, taken from the untouched clone scratch_ref; used only for old-vs-new A/B in scratch databases

CREATE OR REPLACE VIEW public.units_with_financials WITH (security_invoker = true) AS
WITH due_totals AS (
         SELECT d.unit_id,
            sum(d.amount) AS total_due
           FROM dues d
          WHERE d.status <> 'VOID'::text
          GROUP BY d.unit_id
        ), paid_totals AS (
         SELECT d.unit_id,
            sum(pa.amount) AS total_paid
           FROM effective_payment_allocations pa
             JOIN dues d ON d.id = pa.due_id
          GROUP BY d.unit_id
        ), current_owner AS (
         SELECT DISTINCT ON (uo.unit_id) uo.unit_id,
            uo.member_id AS owner_id,
            m.full_name AS owner_name,
            m.phone AS owner_phone
           FROM unit_ownerships uo
             JOIN members m ON m.id = uo.member_id
          WHERE uo.end_date IS NULL OR uo.end_date >= CURRENT_DATE
          ORDER BY uo.unit_id, uo.is_primary_contact DESC, uo.share_percentage DESC, uo.start_date DESC
        )
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
    COALESCE(dt.total_due, 0::numeric)::numeric(19,4) AS total_due,
    COALESCE(pt.total_paid, 0::numeric)::numeric(19,4) AS total_paid,
    (COALESCE(dt.total_due, 0::numeric) - COALESCE(pt.total_paid, 0::numeric))::numeric(19,4) AS balance,
    (COALESCE(dt.total_due, 0::numeric) - COALESCE(pt.total_paid, 0::numeric)) > 0::numeric AS has_arrears,
    u.custom_type_label,
    co.owner_phone,
    u.archived_at
   FROM units u
     LEFT JOIN buildings b ON b.id = u.building_id
     LEFT JOIN zones z ON z.id = u.zone_id
     LEFT JOIN due_totals dt ON dt.unit_id = u.id
     LEFT JOIN paid_totals pt ON pt.unit_id = u.id
     LEFT JOIN current_owner co ON co.unit_id = u.id;

CREATE OR REPLACE VIEW public.members_with_financials WITH (security_invoker = true) AS
WITH active_ownerships AS (
         SELECT uo.member_id,
            uo.unit_id
           FROM unit_ownerships uo
          WHERE uo.end_date IS NULL OR uo.end_date >= CURRENT_DATE
        ), member_aggregates AS (
         SELECT ao.member_id,
            count(*) AS units_count,
            sum(uwf.balance) AS total_balance
           FROM active_ownerships ao
             JOIN units_with_financials uwf ON uwf.id = ao.unit_id
          GROUP BY ao.member_id
        ), last_payment AS (
         SELECT DISTINCT ON (p.member_id) p.member_id,
            p.amount AS last_payment_amount,
            p.payment_date AS last_payment_date
           FROM payments p
          WHERE p.status = 'POSTED'::text AND p.member_id IS NOT NULL
          ORDER BY p.member_id, p.payment_date DESC, p.created_at DESC
        )
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
     LEFT JOIN member_aggregates ma ON ma.member_id = m.id
     LEFT JOIN last_payment lp ON lp.member_id = m.id;
