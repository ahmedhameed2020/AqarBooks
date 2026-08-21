-- Lets a user attach the original scanned/PDF invoice to a supplier_invoices
-- row, mirroring member_documents (20260812000003): a private storage
-- bucket with objects at "{organization_id}/{invoice_id}/{filename}", RLS
-- scoped purely from the path, and a metadata table for listing/deleting
-- without needing a storage LIST call.

create table public.supplier_invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index idx_supplier_invoice_attachments_invoice on public.supplier_invoice_attachments (invoice_id, created_at desc);
create index idx_supplier_invoice_attachments_organization on public.supplier_invoice_attachments (organization_id);

alter table public.supplier_invoice_attachments enable row level security;

-- Read follows the same gate as the rest of the suppliers module.
create policy "supplier_invoice_attachments_select"
  on public.supplier_invoice_attachments for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.suppliers.read'));

-- Manage (upload/delete) requires the same permission that can post
-- invoices in the first place -- a supporting document is part of the
-- entry, not a separate higher-trust action.
create policy "supplier_invoice_attachments_manage"
  on public.supplier_invoice_attachments for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.entries.create') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.entries.create') and public.organization_is_active(organization_id));

insert into storage.buckets (id, name, public)
values ('supplier-invoice-attachments', 'supplier-invoice-attachments', false)
on conflict (id) do nothing;

create policy "supplier_invoice_attachments_storage_select" on storage.objects for select
  using (
    bucket_id = 'supplier-invoice-attachments'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance.suppliers.read')
  );

create policy "supplier_invoice_attachments_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'supplier-invoice-attachments'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance.entries.create')
  );

create policy "supplier_invoice_attachments_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'supplier-invoice-attachments'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance.entries.create')
  );
