-- Hardening decided after the 17-call-site audit: cancel_supplier_invoice
-- and void_supplier_payment were flagged as "safe today, but only by
-- coincidence" -- both check finance.suppliers.void (resort-scoped) then
-- call the PUBLIC create_journal_entry/post_journal_entry, which
-- independently demand finance.entries.create/finance.entries.post. Today
-- that's a no-op in practice because finance.suppliers.void is only ever
-- granted to TENANT_OWNER/FINANCE_MANAGER, who already hold those -- but
-- nothing *structurally* ties them together. Granting finance.suppliers.
-- void to any other role in the future would silently change these
-- functions' real permission requirement without anyone deciding that.
--
-- Fixed by making the coupling explicit and intentional instead of
-- incidental: each function now checks finance.suppliers.void (resort-
-- scoped, unchanged -- this remains the "can this user manage supplier
-- void operations" gate) AND finance.entries.post (org-level, matching
-- how entries.post is checked everywhere else in this schema) as two
-- separate, named requirements, then delegates to create_journal_entry_
-- internal/post_journal_entry_internal (20260813000005) so the *only*
-- authorization for the reversal's own entry is this function's own
-- explicit checks -- not a third, unstated permission requirement buried
-- inside the public journal functions.
--
-- finance.suppliers.void is NOT made sufficient on its own (the
-- alternative the brainstorm considered): reversing a posted, balanced
-- journal entry is exactly the kind of action finance.entries.post exists
-- to gate, and folding that authority silently into a narrower "void
-- vendor stuff" permission would let a future finance.suppliers.void grant
-- become a backdoor general-posting capability -- the same class of bug
-- this whole audit started from, just via a different permission key.
-- finance.suppliers.void stays a distinct, separately-granted business
-- permission; both are required, explicitly, every time.
--
-- Reversal remains atomic in the same transaction as before (unchanged):
-- one function call, one advisory lock (void_supplier_payment), one
-- journal entry insert+post, one status update, one audit log row -- no
-- multi-step/non-transactional reversal was introduced here.

create or replace function public.cancel_supplier_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_fiscal_period_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices;
  v_reason text;
  v_entry_id uuid;
  v_taxable_base numeric(19, 4);
  v_debit_lines jsonb;
  v_credit_lines jsonb;
  v_has_active_allocations boolean;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  select * into v_invoice from public.supplier_invoices where id = p_invoice_id and organization_id = p_organization_id for update;
  if v_invoice.id is null then
    raise exception 'INVOICE_NOT_FOUND: الفاتورة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء فواتير الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: إلغاء فاتورة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
  end if;

  if v_invoice.status = 'CANCELLED' then
    raise exception 'ALREADY_CANCELLED: هذه الفاتورة ملغاة بالفعل بتاريخ %', v_invoice.reversed_at using errcode = '22023';
  end if;

  select exists(
    select 1 from public.supplier_payment_allocations where invoice_id = p_invoice_id and reversed_at is null
  ) into v_has_active_allocations;
  if v_has_active_allocations then
    raise exception 'HAS_PAYMENTS: لا يمكن إلغاء فاتورة عليها دفعات مسددة، يجب عكس الدفعات أولًا' using errcode = '22023';
  end if;

  v_taxable_base := v_invoice.net_amount - v_invoice.discount_amount;
  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.payable_account_id, 'debit', v_invoice.amount, 'credit', 0));
  v_credit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.expense_account_id, 'debit', 0, 'credit', v_taxable_base));
  if v_invoice.vat_amount > 0 then
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object('account_id', v_invoice.vat_account_id, 'debit', 0, 'credit', v_invoice.vat_amount));
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_invoice.resort_id, p_fiscal_period_id, current_date,
    'Cancellation of supplier invoice ' || v_invoice.invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_invoices
  set status = 'CANCELLED', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_invoice.resort_id, 'supplier_invoice.cancelled', 'supplier_invoice', p_invoice_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'amount', v_invoice.amount));

  return v_entry_id;
end;
$$;

create or replace function public.void_supplier_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_fiscal_period_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.supplier_payments;
  v_reason text;
  v_affected_invoice_ids uuid[];
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_invoice_id uuid;
  v_invoice public.supplier_invoices;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  select * into v_payment from public.supplier_payments where id = p_payment_id and organization_id = p_organization_id for update;
  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء دفعات الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: عكس دفعة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
  end if;

  if v_payment.reversed_at is not null then
    raise exception 'ALREADY_REVERSED: هذه الدفعة معكوسة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;

  select array_agg(distinct invoice_id) into v_affected_invoice_ids
  from public.supplier_payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  if v_affected_invoice_ids is not null then
    perform 1 from public.supplier_invoices where id = any(v_affected_invoice_ids) order by id for update;
  end if;

  for v_grouped in
    select si.payable_account_id as account_id, sum(spa.amount) as total
    from public.supplier_payment_allocations spa
    join public.supplier_invoices si on si.id = spa.invoice_id
    where spa.payment_id = p_payment_id and spa.reversed_at is null
    group by si.payable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_payment.payment_account_id, 'debit', v_payment.amount, 'credit', 0));

  if v_payment.wht_amount > 0 then
    for v_grouped in
      select si.wht_account_id as account_id,
        sum(round(spa.amount * si.wht_amount / nullif(si.amount, 0), 4)) as total
      from public.supplier_payment_allocations spa
      join public.supplier_invoices si on si.id = spa.invoice_id
      where spa.payment_id = p_payment_id and spa.reversed_at is null and si.wht_amount > 0
      group by si.wht_account_id
    loop
      v_debit_lines := v_debit_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_grouped.account_id, 'debit', v_grouped.total, 'credit', 0)
      );
    end loop;
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_payment.resort_id, p_fiscal_period_id, current_date,
    'Reversal of supplier payment voucher #' || v_payment.voucher_number, 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_payment_allocations
  set reversed_at = now(), reversed_by = auth.uid()
  where payment_id = p_payment_id and reversed_at is null;

  update public.supplier_payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_payment_id;

  if v_affected_invoice_ids is not null then
    foreach v_invoice_id in array v_affected_invoice_ids loop
      select coalesce(sum(spa.amount), 0) into v_paid_so_far
      from public.supplier_payment_allocations spa
      where spa.invoice_id = v_invoice_id and spa.reversed_at is null;

      select * into v_invoice from public.supplier_invoices where id = v_invoice_id;
      if v_invoice.status <> 'CANCELLED' then
        v_new_status := case
          when v_paid_so_far >= v_invoice.amount then 'PAID'
          when v_paid_so_far > 0 then 'PARTIALLY_PAID'
          else 'POSTED'
        end;
        update public.supplier_invoices set status = v_new_status where id = v_invoice_id;
      end if;
    end loop;
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_payment.resort_id, 'supplier_payment.reversed', 'supplier_payment', p_payment_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'original_amount', v_payment.amount, 'affected_invoice_ids', to_jsonb(coalesce(v_affected_invoice_ids, array[]::uuid[]))));

  return v_entry_id;
end;
$$;

notify pgrst, 'reload schema';
