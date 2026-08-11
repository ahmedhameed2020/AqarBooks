-- Fix: organization_is_active() incorrectly excluded TRIAL organizations,
-- blocking every write (fiscal years, chart of accounts, resorts, journal
-- postings...) for any newly created org until a platform admin manually
-- flipped it to ACTIVE. The spec's intent (§9: "Suspended organizations
-- cannot create new financial activity") only singles out SUSPENDED (and,
-- by extension, ARCHIVED) as blocking -- TRIAL is meant to be a fully
-- functional evaluation period. Found via the Phase 3 integrity test suite.

create or replace function public.organization_is_active(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status in ('TRIAL', 'ACTIVE')
  );
$$;
