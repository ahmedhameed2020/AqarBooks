-- Members "next level" feature set: tags + saved filters, a per-member
-- activity log (manual notes + auto-logged reminder sends), and document
-- attachments (Supabase Storage). All four new tables follow the same
-- RLS shape already used for members/unit_ownerships: readable by any org
-- member, writable only with property.members.manage on an active org.

create table public.member_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index idx_member_tags_organization on public.member_tags (organization_id);

alter table public.member_tags enable row level security;

create policy "member_tags_select_member" on public.member_tags for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "member_tags_manage" on public.member_tags for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create table public.member_tag_assignments (
  member_id uuid not null references public.members (id) on delete cascade,
  tag_id uuid not null references public.member_tags (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, tag_id)
);

create index idx_member_tag_assignments_organization on public.member_tag_assignments (organization_id);
create index idx_member_tag_assignments_tag on public.member_tag_assignments (tag_id);

alter table public.member_tag_assignments enable row level security;

create policy "member_tag_assignments_select_member" on public.member_tag_assignments for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "member_tag_assignments_manage" on public.member_tag_assignments for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create table public.member_saved_filters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id),
  name text not null,
  query jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_member_saved_filters_organization on public.member_saved_filters (organization_id);

alter table public.member_saved_filters enable row level security;

create policy "member_saved_filters_select_member" on public.member_saved_filters for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "member_saved_filters_manage" on public.member_saved_filters for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create table public.member_activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  actor_id uuid references auth.users (id),
  type text not null check (type in ('note', 'call', 'whatsapp_reminder', 'email_reminder')),
  body text,
  created_at timestamptz not null default now()
);

create index idx_member_activity_log_member on public.member_activity_log (member_id, created_at desc);
create index idx_member_activity_log_organization on public.member_activity_log (organization_id);

alter table public.member_activity_log enable row level security;

create policy "member_activity_log_select_member" on public.member_activity_log for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "member_activity_log_manage" on public.member_activity_log for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create table public.member_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index idx_member_documents_member on public.member_documents (member_id, created_at desc);
create index idx_member_documents_organization on public.member_documents (organization_id);

alter table public.member_documents enable row level security;

create policy "member_documents_select_member" on public.member_documents for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "member_documents_manage" on public.member_documents for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

-- Storage bucket for the actual files backing member_documents. Private
-- (public = false); objects are stored at "{organization_id}/{member_id}/{filename}"
-- so the policies below can scope access purely from the path, mirroring the
-- table RLS above.
insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do nothing;

create policy "member_documents_storage_select" on storage.objects for select
  using (
    bucket_id = 'member-documents'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "member_documents_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'member-documents'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'property.members.manage')
  );

create policy "member_documents_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'member-documents'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'property.members.manage')
  );
