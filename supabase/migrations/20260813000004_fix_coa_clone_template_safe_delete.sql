-- Fix for SQL strict delete mode: "DELETE requires a WHERE clause"
-- Replacing `delete from _coa_clone_map;` in clone_chart_of_accounts_template
-- with `truncate table _coa_clone_map;` (or explicit `delete from _coa_clone_map where true;`)
-- so Postgres/pggssapi/Supabase strict safe-delete extensions do not abort the RPC.

create or replace function public.clone_chart_of_accounts_template(
  p_organization_id uuid,
  p_template_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_new_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  create temporary table if not exists _coa_clone_map (code text primary key, id uuid) on commit drop;
  truncate table _coa_clone_map;

  for v_row in
    select * from public.coa_template_accounts
    where template_key = p_template_key
    order by sort_order
  loop
    insert into public.chart_of_accounts (
      organization_id, code, name_ar, name_en, parent_id, category, normal_balance, is_group
    ) values (
      p_organization_id,
      v_row.code,
      v_row.name_ar,
      v_row.name_en,
      (select id from _coa_clone_map where code = v_row.parent_code),
      v_row.category,
      v_row.normal_balance,
      v_row.is_group
    )
    returning id into v_new_id;

    insert into _coa_clone_map (code, id) values (v_row.code, v_new_id);
  end loop;
end;
$$;
