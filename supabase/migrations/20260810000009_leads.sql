-- Phase 2 (schema only; public capture form ships in Phase 8): demo leads and
-- contact requests. Never client-writable -- inserted only via a server route
-- using the service-role client after server-side validation and rate limiting.

create table public.demo_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  role_title text,
  organization_name text,
  units_count int,
  gates_count int,
  email text not null,
  phone text,
  preferred_contact_method text check (preferred_contact_method in ('email', 'phone')),
  message text,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED')),
  created_at timestamptz not null default now()
);

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  message text not null,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'CLOSED')),
  created_at timestamptz not null default now()
);
