-- current_member_id(): the single source of truth every owner-portal RLS
-- policy resolves identity through. No parameters -- it derives everything
-- from auth.uid(), so there is no argument shape that lets a caller ask
-- "what if I were member X". members.user_id is UNIQUE (Task 1), so the
-- underlying query structurally cannot return more than one row. Returns
-- NULL (not an error) for staff-only/unlinked users, so every policy that
-- calls it denies access via `NULL = ...` rather than needing a special case.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid();
$$;

drop policy if exists "members_select_self" on public.members;
create policy "members_select_self"
  on public.members for select
  using (id = public.current_member_id());
