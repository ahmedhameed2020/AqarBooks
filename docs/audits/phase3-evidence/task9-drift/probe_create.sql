create table public.zz_guard_probe(id int primary key, note text);
alter table public.zz_guard_probe enable row level security;
create policy zz_guard_probe_sel on public.zz_guard_probe for select to authenticated using (id > 0);
create function public.zz_guard_probe_fn() returns int language sql security definer as $$ select 1 $$;
grant execute on function public.zz_guard_probe_fn() to anon;
