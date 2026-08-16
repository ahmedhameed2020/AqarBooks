-- Expand organizations.entity_type with three more Egyptian-market entity
-- kinds (tourist resort, tourist village, residential compound), and add a
-- free-text column to capture a custom label when the tenant picks "Other".

alter table public.organizations
  drop constraint if exists organizations_entity_type_check;

alter table public.organizations
  add constraint organizations_entity_type_check
    check (entity_type in (
      'DEVELOPER',
      'FACILITY_MANAGEMENT',
      'OWNERS_ASSOCIATION',
      'INDIVIDUAL_OWNER',
      'TOURIST_RESORT',
      'TOURIST_VILLAGE',
      'RESIDENTIAL_COMPOUND',
      'OTHER'
    ));

alter table public.organizations
  add column entity_type_other text;
