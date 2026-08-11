-- Phase 2: tenant role templates. Cloned into an organization's own `roles` /
-- `role_permissions` rows at org-creation time, so grants can later be
-- customized per tenant without mutating a shared global row.

create table public.role_templates (
  key text primary key,
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0
);

create table public.role_template_permissions (
  role_template_key text not null references public.role_templates (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_template_key, permission_key)
);

create or replace function public.clone_tenant_role_templates(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_role_id uuid;
begin
  for v_template in select key, name_ar, name_en from public.role_templates loop
    insert into public.roles (organization_id, key, name_ar, name_en, is_system)
    values (p_organization_id, v_template.key, v_template.name_ar, v_template.name_en, false)
    returning id into v_role_id;

    insert into public.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from public.role_template_permissions rtp
    join public.permissions p on p.key = rtp.permission_key
    where rtp.role_template_key = v_template.key;
  end loop;
end;
$$;
