-- PR1B: Maintenance request attachments.
--
-- Scope guard:
-- - No work_orders, technician/vendor assignment, SLA, costing, accounting,
--   visitor passes, QR, gates, vehicles, or generic member-document refactor.
-- - All attachment metadata mutations are RPC-only.
-- - Storage bucket remains private and object paths are server-generated.

create table if not exists public.maintenance_request_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  maintenance_request_id uuid not null,
  uploaded_by_user_id uuid not null references auth.users(id),
  uploaded_by_member_id uuid references public.members(id),
  kind text not null,
  visibility text not null default 'MEMBER_VISIBLE',
  original_file_name text not null,
  storage_bucket text not null default 'maintenance-attachments',
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint maintenance_request_attachments_org_request_fkey
    foreign key (organization_id, maintenance_request_id)
    references public.maintenance_requests (organization_id, id)
    on delete cascade,
  constraint maintenance_request_attachments_uploaded_member_fkey
    foreign key (organization_id, uploaded_by_member_id)
    references public.members (organization_id, id),
  constraint maintenance_request_attachments_kind_check
    check (kind in ('ISSUE', 'BEFORE', 'AFTER', 'INVOICE', 'OTHER')),
  constraint maintenance_request_attachments_visibility_check
    check (visibility in ('STAFF_ONLY', 'MEMBER_VISIBLE')),
  constraint maintenance_request_attachments_status_check
    check (status in ('PENDING', 'READY', 'FAILED')),
  constraint maintenance_request_attachments_file_name_not_blank
    check (btrim(original_file_name) <> ''),
  constraint maintenance_request_attachments_bucket_check
    check (storage_bucket = 'maintenance-attachments'),
  constraint maintenance_request_attachments_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint maintenance_request_attachments_byte_size_check
    check (byte_size > 0 and byte_size <= 10485760),
  constraint maintenance_request_attachments_ready_at_check
    check ((status = 'READY' and ready_at is not null) or (status <> 'READY' and ready_at is null)),
  constraint maintenance_request_attachments_path_shape
    check (
      storage_path =
        organization_id::text || '/' ||
        maintenance_request_id::text || '/' ||
        id::text ||
        case mime_type
          when 'image/jpeg' then '.jpg'
          when 'image/png' then '.png'
          when 'image/webp' then '.webp'
          when 'application/pdf' then '.pdf'
        end
    )
);

create unique index if not exists maintenance_request_attachments_storage_path_key
  on public.maintenance_request_attachments (storage_path);

create index if not exists idx_maintenance_request_attachments_request_created
  on public.maintenance_request_attachments (maintenance_request_id, created_at desc);

create index if not exists idx_maintenance_request_attachments_org_request
  on public.maintenance_request_attachments (organization_id, maintenance_request_id, status);

create index if not exists idx_maintenance_request_attachments_status_cleanup
  on public.maintenance_request_attachments (status, created_at);

create index if not exists idx_maintenance_request_attachments_uploader
  on public.maintenance_request_attachments (uploaded_by_user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-attachments',
  'maintenance-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

create or replace function public.maintenance_attachment_extension(p_mime_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    else null
  end;
$$;

create or replace function public.maintenance_request_accepts_attachments(p_request public.maintenance_requests)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_request.status not in ('CANCELLED', 'CLOSED');
$$;

create or replace function public.maintenance_attachment_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.manage');
$$;

create or replace function public.maintenance_attachment_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.manage');
$$;

create or replace function public.maintenance_attachment_member_can_read(p_attachment public.maintenance_request_attachments)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_attachment.visibility = 'MEMBER_VISIBLE'
    and p_attachment.status = 'READY'
    and exists (
      select 1
      from public.maintenance_requests mr
      where mr.id = p_attachment.maintenance_request_id
        and mr.organization_id = p_attachment.organization_id
        and mr.requester_member_id = public.current_member_id()
        and public.is_current_member_unit_owner(public.current_member_id(), mr.organization_id, mr.unit_id)
        and public.organization_is_active(mr.organization_id)
        and public.maintenance_module_enabled(mr.organization_id)
    );
$$;

create or replace function public.maintenance_attachment_can_upload_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_bucket_id = 'maintenance-attachments'
    and exists (
      select 1
      from public.maintenance_request_attachments a
      join public.maintenance_requests mr
        on mr.id = a.maintenance_request_id
       and mr.organization_id = a.organization_id
      where a.storage_bucket = p_bucket_id
        and a.storage_path = p_name
        and a.status = 'PENDING'
        and a.uploaded_by_user_id = auth.uid()
        and public.organization_is_active(a.organization_id)
        and public.maintenance_module_enabled(a.organization_id)
        and public.maintenance_request_accepts_attachments(mr)
        and (
          public.maintenance_attachment_staff_can_manage(a.organization_id)
          or (
            a.uploaded_by_member_id = public.current_member_id()
            and a.visibility = 'MEMBER_VISIBLE'
            and a.kind in ('ISSUE', 'OTHER')
            and mr.requester_member_id = public.current_member_id()
            and public.is_current_member_unit_owner(public.current_member_id(), mr.organization_id, mr.unit_id)
          )
        )
    );
$$;

create or replace function public.maintenance_attachment_can_select_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_bucket_id = 'maintenance-attachments'
    and exists (
      select 1
      from public.maintenance_request_attachments a
      where a.storage_bucket = p_bucket_id
        and a.storage_path = p_name
        and a.status = 'READY'
        and public.organization_is_active(a.organization_id)
        and public.maintenance_module_enabled(a.organization_id)
        and (
          public.maintenance_attachment_staff_can_read(a.organization_id)
          or public.maintenance_attachment_member_can_read(a)
        )
    );
$$;

create or replace function public.maintenance_attachment_can_delete_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_bucket_id = 'maintenance-attachments'
    and exists (
      select 1
      from public.maintenance_request_attachments a
      where a.storage_bucket = p_bucket_id
        and a.storage_path = p_name
        and a.status in ('PENDING', 'FAILED')
        and a.uploaded_by_user_id = auth.uid()
        and public.organization_is_active(a.organization_id)
        and public.maintenance_module_enabled(a.organization_id)
    );
$$;

create or replace function public.begin_maintenance_attachment_upload(
  p_request_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_kind text,
  p_visibility text default 'MEMBER_VISIBLE'
) returns table (
  attachment_id uuid,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_request public.maintenance_requests;
  v_kind text := upper(coalesce(nullif(btrim(p_kind), ''), 'ISSUE'));
  v_visibility text := upper(coalesce(nullif(btrim(p_visibility), ''), 'MEMBER_VISIBLE'));
  v_file_name text := nullif(btrim(p_original_file_name), '');
  v_extension text;
  v_attachment_id uuid := gen_random_uuid();
  v_is_staff_manager boolean := false;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_file_name is null or char_length(v_file_name) > 180 then
    raise exception 'INVALID_FILE_NAME' using errcode = '22023';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then
    raise exception 'INVALID_FILE_SIZE' using errcode = '22023';
  end if;

  v_extension := public.maintenance_attachment_extension(p_mime_type);
  if v_extension is null then
    raise exception 'INVALID_MIME_TYPE' using errcode = '22023';
  end if;

  if v_kind not in ('ISSUE', 'BEFORE', 'AFTER', 'INVOICE', 'OTHER') then
    raise exception 'INVALID_ATTACHMENT_KIND' using errcode = '22023';
  end if;

  if v_visibility not in ('STAFF_ONLY', 'MEMBER_VISIBLE') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_request.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.maintenance_module_enabled(v_request.organization_id) then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.maintenance_request_accepts_attachments(v_request) then
    raise exception 'REQUEST_NOT_ACCEPTING_ATTACHMENTS' using errcode = '22023';
  end if;

  v_is_staff_manager := public.maintenance_attachment_staff_can_manage(v_request.organization_id);

  if v_is_staff_manager then
    v_member_id := null;
  else
    if v_member_id is null then
      raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT' using errcode = '42501';
    end if;
    if v_request.requester_member_id <> v_member_id
       or not public.is_current_member_unit_owner(v_member_id, v_request.organization_id, v_request.unit_id) then
      raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT' using errcode = '42501';
    end if;
    if v_visibility <> 'MEMBER_VISIBLE' or v_kind not in ('ISSUE', 'OTHER') then
      raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT_KIND' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_count
  from public.maintenance_request_attachments
  where organization_id = v_request.organization_id
    and maintenance_request_id = v_request.id
    and status in ('PENDING', 'READY');

  if v_count >= 20 then
    raise exception 'TOO_MANY_ATTACHMENTS' using errcode = '22023';
  end if;

  insert into public.maintenance_request_attachments (
    id,
    organization_id,
    maintenance_request_id,
    uploaded_by_user_id,
    uploaded_by_member_id,
    kind,
    visibility,
    original_file_name,
    storage_bucket,
    storage_path,
    mime_type,
    byte_size,
    status
  ) values (
    v_attachment_id,
    v_request.organization_id,
    v_request.id,
    v_user_id,
    v_member_id,
    v_kind,
    v_visibility,
    v_file_name,
    'maintenance-attachments',
    v_request.organization_id::text || '/' || v_request.id::text || '/' || v_attachment_id::text || '.' || v_extension,
    p_mime_type,
    p_byte_size,
    'PENDING'
  );

  return query
  select a.id, a.storage_bucket, a.storage_path
  from public.maintenance_request_attachments a
  where a.id = v_attachment_id;
end;
$$;

create or replace function public.finalize_maintenance_attachment_upload(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_attachment public.maintenance_request_attachments;
  v_request public.maintenance_requests;
  v_object storage.objects;
  v_is_staff_manager boolean := false;
  v_object_size bigint;
  v_object_mime text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_attachment
  from public.maintenance_request_attachments
  where id = p_attachment_id
  for update;

  if v_attachment.id is null then
    raise exception 'ATTACHMENT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_attachment.status <> 'PENDING' then
    raise exception 'INVALID_ATTACHMENT_STATUS' using errcode = '22023';
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = v_attachment.maintenance_request_id
    and organization_id = v_attachment.organization_id;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '22023';
  end if;

  v_is_staff_manager := public.maintenance_attachment_staff_can_manage(v_attachment.organization_id);
  if not (
    v_is_staff_manager
    or (
      v_attachment.uploaded_by_user_id = v_user_id
      and v_attachment.uploaded_by_member_id = public.current_member_id()
      and v_request.requester_member_id = public.current_member_id()
      and public.is_current_member_unit_owner(public.current_member_id(), v_request.organization_id, v_request.unit_id)
    )
  ) then
    raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_attachment.organization_id)
     or not public.maintenance_module_enabled(v_attachment.organization_id)
     or not public.maintenance_request_accepts_attachments(v_request) then
    raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT' using errcode = '42501';
  end if;

  select * into v_object
  from storage.objects
  where bucket_id = v_attachment.storage_bucket
    and name = v_attachment.storage_path;

  if v_object.id is null then
    raise exception 'ATTACHMENT_OBJECT_NOT_FOUND' using errcode = '22023';
  end if;

  v_object_size := nullif(v_object.metadata->>'size', '')::bigint;
  v_object_mime := coalesce(v_object.metadata->>'mimetype', v_object.metadata->>'contentType');

  if v_object_size is null or v_object_size <> v_attachment.byte_size then
    raise exception 'ATTACHMENT_SIZE_MISMATCH' using errcode = '22023';
  end if;

  if v_object_mime is null or v_object_mime <> v_attachment.mime_type then
    raise exception 'ATTACHMENT_MIME_MISMATCH' using errcode = '22023';
  end if;

  update public.maintenance_request_attachments
  set status = 'READY',
      ready_at = now()
  where id = v_attachment.id;

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_attachment.organization_id,
    v_request.property_id,
    'maintenance_attachment.ready',
    'maintenance_request_attachment',
    v_attachment.id,
    jsonb_build_object(
      'maintenance_request_id', v_attachment.maintenance_request_id,
      'kind', v_attachment.kind,
      'visibility', v_attachment.visibility,
      'mime_type', v_attachment.mime_type,
      'byte_size', v_attachment.byte_size
    )
  );
end;
$$;

create or replace function public.abort_maintenance_attachment_upload(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attachment public.maintenance_request_attachments;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_attachment
  from public.maintenance_request_attachments
  where id = p_attachment_id
  for update;

  if v_attachment.id is null then
    raise exception 'ATTACHMENT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_attachment.status = 'READY' then
    raise exception 'READY_ATTACHMENT_IMMUTABLE' using errcode = '22023';
  end if;

  if not (
    v_attachment.uploaded_by_user_id = v_user_id
    or public.maintenance_attachment_staff_can_manage(v_attachment.organization_id)
  ) then
    raise exception 'FORBIDDEN_MAINTENANCE_ATTACHMENT' using errcode = '42501';
  end if;

  update public.maintenance_request_attachments
  set status = 'FAILED',
      ready_at = null
  where id = v_attachment.id;
end;
$$;

alter table public.maintenance_request_attachments enable row level security;

create policy maintenance_request_attachments_select_authorized
  on public.maintenance_request_attachments
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.maintenance_attachment_staff_can_read(organization_id)
      or public.maintenance_attachment_member_can_read(maintenance_request_attachments)
    )
  );

create policy maintenance_attachments_storage_insert_pending
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-attachments'
    and public.maintenance_attachment_can_upload_object(bucket_id, name)
  );

create policy maintenance_attachments_storage_select_ready
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'maintenance-attachments'
    and public.maintenance_attachment_can_select_object(bucket_id, name)
  );

create policy maintenance_attachments_storage_delete_pending_or_failed
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'maintenance-attachments'
    and public.maintenance_attachment_can_delete_object(bucket_id, name)
  );

revoke all privileges on table public.maintenance_request_attachments from public, anon, authenticated;
grant select on table public.maintenance_request_attachments to authenticated;
grant all privileges on table public.maintenance_request_attachments to service_role;

revoke all on function public.maintenance_attachment_extension(text) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_request_accepts_attachments(public.maintenance_requests) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_member_can_read(public.maintenance_request_attachments) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_can_upload_object(text, text) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_can_select_object(text, text) from public, anon, authenticated, service_role;
revoke all on function public.maintenance_attachment_can_delete_object(text, text) from public, anon, authenticated, service_role;
revoke all on function public.begin_maintenance_attachment_upload(uuid, text, text, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_maintenance_attachment_upload(uuid) from public, anon, authenticated, service_role;
revoke all on function public.abort_maintenance_attachment_upload(uuid) from public, anon, authenticated, service_role;

grant execute on function public.maintenance_attachment_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.maintenance_attachment_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.maintenance_attachment_member_can_read(public.maintenance_request_attachments) to authenticated, service_role;
grant execute on function public.maintenance_attachment_can_upload_object(text, text) to authenticated, service_role;
grant execute on function public.maintenance_attachment_can_select_object(text, text) to authenticated, service_role;
grant execute on function public.maintenance_attachment_can_delete_object(text, text) to authenticated, service_role;
grant execute on function public.begin_maintenance_attachment_upload(uuid, text, text, bigint, text, text) to authenticated;
grant execute on function public.finalize_maintenance_attachment_upload(uuid) to authenticated;
grant execute on function public.abort_maintenance_attachment_upload(uuid) to authenticated;
