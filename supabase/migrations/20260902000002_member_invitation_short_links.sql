-- Short redirect links for member portal invitations. The real Supabase
-- invite action_link is ~250+ chars (it embeds a signed verify token plus
-- our own URL-encoded redirect_to) -- reads as spam over WhatsApp/email.
-- This table maps a short opaque slug to that real link so staff can send
-- "aqarbooks.../i/<slug>" instead; app/i/[slug]/route.ts does the 302.
--
-- The stored action_link is a live, single-recipient auth credential (same
-- sensitivity class as the raw invitation token member_invitations
-- deliberately never persists) -- unlike that token, this one has to be
-- persisted for the redirect to work at all, so exposure is minimized
-- instead: RLS grants nothing to anon/authenticated (only the server-side
-- admin client reads/writes it), and expire_stale_member_invitations()
-- below sweeps rows whose invitation is no longer pending on every
-- invite-creation call, same lazy-sweep cadence as the invitations
-- themselves.
create table public.member_invitation_short_links (
  slug text primary key,
  invitation_id uuid not null references public.member_invitations (id) on delete cascade,
  action_link text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_member_invitation_short_links_invitation
  on public.member_invitation_short_links (invitation_id);

alter table public.member_invitation_short_links enable row level security;
-- No policies: only the service-role admin client (server actions +
-- app/i/[slug]/route.ts) ever touches this table.

revoke all on public.member_invitation_short_links from public, anon, authenticated;

create or replace function public.expire_stale_member_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.member_invitations
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*) into v_count from expired;

  delete from public.member_invitation_short_links sl
  using public.member_invitations mi
  where sl.invitation_id = mi.id
    and mi.status <> 'pending';

  return v_count;
end;
$$;

notify pgrst, 'reload schema';
