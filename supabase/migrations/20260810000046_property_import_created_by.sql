-- The property CSV import engine (20260810000045_property_csv_import.sql)
-- writes created_by on units/members/unit_ownerships for audit purposes, but
-- none of those tables had the column -- every import call failed with
-- "column created_by does not exist". Add it, nullable, matching the
-- established created_by uuid references auth.users(id) pattern used
-- elsewhere (e.g. dues/payments in 20260810000024_receivables_tables.sql).

alter table public.units add column created_by uuid references auth.users (id);
alter table public.members add column created_by uuid references auth.users (id);
alter table public.unit_ownerships add column created_by uuid references auth.users (id);
