-- The RESORT_STANDARD template's name_ar somehow ended up holding the literal
-- text "DELETE requires a WHERE clause" -- almost certainly a Postgres/
-- Supabase safe-mode error message from an unrelated unscoped DELETE that got
-- written into this row by mistake (e.g. a script that caught the error and
-- fed it into a subsequent UPDATE instead of the intended value). Restore the
-- correct display name.

update public.coa_templates
set name_ar = 'دليل الحسابات القياسي للمنتجعات',
    name_en = 'Standard Resort Chart of Accounts'
where key = 'RESORT_STANDARD';
