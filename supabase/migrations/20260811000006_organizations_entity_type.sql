-- Lets a tenant record what kind of entity they are (real estate developer,
-- facility management company, owners' association, individual owner, or
-- other) -- context stored on the organization record. Nullable/no default
-- so existing tenants aren't forced into a value; the org profile form lets
-- them set it going forward. Purely informational for now (no copy/behavior
-- in the app branches on it yet).

alter table public.organizations
  add column entity_type text
    check (entity_type in ('DEVELOPER', 'FACILITY_MANAGEMENT', 'OWNERS_ASSOCIATION', 'INDIVIDUAL_OWNER', 'OTHER'));
