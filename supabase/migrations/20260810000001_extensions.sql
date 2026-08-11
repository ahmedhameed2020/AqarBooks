-- Foundation: extensions required by the rest of the schema.
create extension if not exists "pgcrypto" with schema extensions;

-- Generic updated_at trigger used by every table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
