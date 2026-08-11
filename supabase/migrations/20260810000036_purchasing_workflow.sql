-- Phase 6: purchase request / purchase order lifecycle functions.

create or replace function public.create_purchase_request(
  p_organization_id uuid,
  p_resort_id uuid,
  p_description text,
  p_estimated_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'purchasing.requests.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_estimated_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.purchase_requests (organization_id, resort_id, description, estimated_amount, requested_by)
  values (p_organization_id, p_resort_id, p_description, p_estimated_amount, auth.uid())
  returning id into v_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id)
  values (auth.uid(), p_organization_id, p_resort_id, 'purchase_request.created', 'purchase_request', v_request_id);

  return v_request_id;
end;
$$;

create or replace function public.decide_purchase_request(
  p_request_id uuid,
  p_approve boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'purchase request not found';
  end if;
  if not public.has_permission(auth.uid(), v_request.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_request.status <> 'SUBMITTED' then
    raise exception 'only a submitted request can be decided';
  end if;

  update public.purchase_requests
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end, approved_by = auth.uid()
  where id = p_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_request.organization_id, v_request.resort_id,
    case when p_approve then 'purchase_request.approved' else 'purchase_request.rejected' end,
    'purchase_request', p_request_id, p_reason);
end;
$$;

create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_purchase_request_id uuid,
  p_description text,
  p_amount numeric,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'purchasing.requests.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id) then
    raise exception 'supplier does not belong to this organization';
  end if;
  if p_purchase_request_id is not null and not exists (
    select 1 from public.purchase_requests
    where id = p_purchase_request_id and organization_id = p_organization_id and status = 'APPROVED'
  ) then
    raise exception 'purchase request must be an approved request belonging to this organization';
  end if;

  insert into public.purchase_orders (
    organization_id, resort_id, supplier_id, purchase_request_id, description, amount, order_date, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_request_id, p_description, p_amount, p_order_date, auth.uid()
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.approve_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_order_number bigint;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status <> 'DRAFT' then
    raise exception 'only a draft order can be approved';
  end if;

  v_order_number := public.next_sequence_value(v_order.organization_id, null, 'purchase_order');

  update public.purchase_orders
  set status = 'APPROVED', approved_by = auth.uid(), order_number = v_order_number
  where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.resort_id, 'purchase_order.approved', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('order_number', v_order_number));
end;
$$;

create or replace function public.set_purchase_order_status(
  p_purchase_order_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_legal boolean;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_legal := (v_order.status, p_new_status) in (('APPROVED', 'RECEIVED'), ('DRAFT', 'CANCELLED'), ('APPROVED', 'CANCELLED'));
  if not v_legal then
    raise exception 'illegal purchase order status transition: % -> %', v_order.status, p_new_status;
  end if;

  update public.purchase_orders set status = p_new_status where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.resort_id, 'purchase_order.status_changed', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('new_status', p_new_status));
end;
$$;
