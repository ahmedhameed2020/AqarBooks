-- Phase 2d of the resort -> property domain rename. Purchasing cluster:
-- purchase_orders, purchase_requests, supplier_invoices, supplier_payments.
-- Third cluster in the agreed order (treasury -> purchasing -> payments/
-- dues), chosen for being roughly the same size as treasury and relatively
-- self-contained, ahead of the largest/most interconnected cluster last.

alter table public.purchase_orders rename column resort_id to property_id;
alter table public.purchase_requests rename column resort_id to property_id;
alter table public.supplier_invoices rename column resort_id to property_id;
alter table public.supplier_payments rename column resort_id to property_id;
