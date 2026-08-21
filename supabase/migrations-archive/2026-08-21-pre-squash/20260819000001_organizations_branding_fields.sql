-- Adds branding & visual identity fields to organizations
alter table public.organizations
  add column if not exists brand_color text default '#1E1B4B',
  add column if not exists logo_url text,
  add column if not exists commercial_registry text,
  add column if not exists tagline text;
