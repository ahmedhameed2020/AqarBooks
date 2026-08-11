-- Fix: document_sequences' unique(organization_id, resort_id, sequence_type)
-- constraint does NOT treat two NULL resort_id rows as duplicates (standard
-- SQL NULL semantics), so ON CONFLICT DO NOTHING in next_sequence_value()
-- silently inserted a second row every time an org-wide (resort_id IS NULL)
-- sequence was requested more than once, and the subsequent
-- UPDATE ... RETURNING then matched multiple rows and errored with
-- "query returned more than one row". Found via the Phase 3 integrity tests
-- (journal numbering broke on the second post/reverse for the same org).
--
-- NULLS NOT DISTINCT (Postgres 15+) makes NULL resort_id rows collide
-- correctly, so ON CONFLICT actually finds them.

-- Remove any duplicate org-wide rows created by the bug before tightening
-- the constraint, keeping the row with the highest next_value (the most
-- advanced counter) so no previously issued number can be reissued.
delete from public.document_sequences ds
using public.document_sequences ds2
where ds.organization_id = ds2.organization_id
  and ds.sequence_type = ds2.sequence_type
  and ds.resort_id is null
  and ds2.resort_id is null
  and ds.next_value < ds2.next_value;

alter table public.document_sequences
  drop constraint document_sequences_organization_id_resort_id_sequence_type_key;

alter table public.document_sequences
  add constraint document_sequences_organization_id_resort_id_sequence_type_key
  unique nulls not distinct (organization_id, resort_id, sequence_type);
