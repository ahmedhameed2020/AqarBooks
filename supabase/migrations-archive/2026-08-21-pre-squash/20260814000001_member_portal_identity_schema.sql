-- Owner portal identity: links a members row to an auth user, and tracks
-- the invitation lifecycle that creates that link. See
-- docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md
-- ("Identity & Invitation Flow") for the full design.

alter table public.members
  add column user_id uuid references auth.users (id) unique;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  email text not null,
  token_hash text not null,        -- sha256 hex digest of the raw token; raw token never stored
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users (id),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_member_invitations_pending_per_member
  on public.member_invitations (member_id) where status = 'pending';

create index idx_member_invitations_organization
  on public.member_invitations (organization_id);

alter table public.member_invitations enable row level security;
-- No policies yet: staff access goes through the has_permission-checked RPC
-- in Task 4, and the accept-invite path goes through its own RPC (also
-- SECURITY DEFINER). Nothing queries this table directly via PostgREST.
