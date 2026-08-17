-- The "Other" free-text column was renamed in application code from
-- entity_type_other to the clearer entity_type_custom_label. Reconcile the
-- schema: drop the old column if the previous migration already created it,
-- add the new one if it isn't there yet. Idempotent either way -- safe
-- whether or not 20260811000007's original column name was ever applied.

alter table public.organizations drop column if exists entity_type_other;
alter table public.organizations add column if not exists entity_type_custom_label text;
