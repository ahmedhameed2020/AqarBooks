-- فاتورة مورد بعملة أجنبية (المرحلة ٤ب — ربط أول دورة).
--
-- **لم تُمَسّ `post_supplier_invoice`.** هي 7,800 حرف تحمل بالفعل ضريبة المدخلات
-- وأهليتها وخصم المنبع وحدود أمر الشراء، وأي خطأ فيها يمسّ كل فاتورة مورد في
-- النظام. فالعملة الأجنبية تُضاف **بغلاف يستدعيها**، لا بتعديلها: يحوّل الغلاف
-- المبالغ إلى عملة المؤسسة، ثم يُسلّمها للدالة القائمة كما كانت تتلقاها دائمًا،
-- ثم يسجّل بيانات العملة على الصف. المسار القديم لا يتغيّر بحرف واحد.
--
-- وخاصية في التصميم القائم جعلت هذا أسهل مما توقّعت: القيمة المضافة وخصم المنبع
-- مخزَّنان **كنِسَب لا كمبالغ**. والنسبة لا تُحوَّل — 14% من مبلغ باليورو هي 14%
-- من مقابله بالجنيه. فلا يحتاج التحويل إلا الصافي والخصم.
--
-- الدفاتر تبقى بعملة المؤسسة وحدها. مبالغ العملة الأجنبية تُحفظ على المستند
-- للرجوع والمطابقة، ولا تدخل قيدًا — دفتر بعملتين ليس دفترًا.

alter table public.supplier_invoices
  add column if not exists currency text,
  add column if not exists exchange_rate numeric(18,8),
  add column if not exists foreign_net_amount numeric(19,4),
  add column if not exists foreign_discount_amount numeric(19,4),
  add column if not exists foreign_amount numeric(19,4);

comment on column public.supplier_invoices.currency is
  'عملة المستند الأصلية. NULL = عملة المؤسسة، وهو ما عليه كل صف قائم.';
comment on column public.supplier_invoices.exchange_rate is
  'كم وحدة من عملة المؤسسة تساوي وحدة واحدة من عملة الفاتورة، وقت التسجيل.';


create or replace function public.post_supplier_invoice_in_currency(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_purchase_order_id uuid,
  p_invoice_number text,
  p_expense_account_id uuid,
  p_net_amount numeric,
  p_discount_amount numeric,
  p_vat_rate numeric,
  p_vat_account_id uuid,
  p_wht_rate numeric,
  p_wht_account_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_fiscal_period_id uuid,
  p_currency text,
  -- سعر يدوي يعلو على السجل: عقد قد ينص على سعر متفق عليه يخالف سعر اليوم،
  -- وفرضُ سعر السجل عليه كان سيجعل الدفاتر تخالف العقد. وتركه فارغًا يعني
  -- «استعمل السعر المسجَّل»، والغياب حينها رفض لا افتراض.
  p_exchange_rate numeric default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_base text;
  v_rate numeric;
  v_scale int;
  v_base_net numeric;
  v_base_discount numeric;
  v_invoice_id uuid;
  v_foreign_gross numeric;
begin
  select o.default_currency into v_base
  from public.organizations o where o.id = p_organization_id;
  if v_base is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- الحالة العظمى: الفاتورة بعملة المؤسسة. تمرّ إلى الدالة القائمة كما هي، بلا
  -- سعر ولا تحويل ولا بيانات عملة — فلا أثر لهذا الملف على أي مسار قائم.
  if p_currency is null or upper(p_currency) = upper(v_base) then
    return public.post_supplier_invoice(
      p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
      p_invoice_number, p_expense_account_id, p_net_amount, p_discount_amount,
      p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
      p_invoice_date, p_due_date, p_fiscal_period_id
    );
  end if;

  if p_exchange_rate is not null then
    if p_exchange_rate <= 0 then
      raise exception 'EXCHANGE_RATE_INVALID: السعر يجب أن يكون أكبر من صفر'
        using errcode = '22023';
    end if;
    v_rate := p_exchange_rate;
  else
    select g.rate into v_rate
    from public.get_exchange_rate(p_organization_id, p_currency, v_base, p_invoice_date) g;

    if v_rate is null then
      raise exception
        'EXCHANGE_RATE_MISSING: لا يوجد سعر صرف لـ % مقابل % في % أو قبله — سجّل السعر أو مرّر سعر الفاتورة',
        upper(p_currency), upper(v_base), p_invoice_date
        using errcode = 'P0001';
    end if;
  end if;

  v_scale := public.currency_decimals(v_base);
  v_base_net := round(p_net_amount * v_rate, v_scale);
  v_base_discount := round(coalesce(p_discount_amount, 0) * v_rate, v_scale);

  -- التحويل قبل الاستدعاء لا بعده: الدالة القائمة تتحقق من حدود أمر الشراء
  -- ومن أن الخصم أقل من الصافي، وكلاهما يجب أن يُقارَن بعملة الدفاتر لا بعملة
  -- الفاتورة، وإلا قُورن يورو بجنيه وسقط الحدّ.
  v_invoice_id := public.post_supplier_invoice(
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
    p_invoice_number, p_expense_account_id, v_base_net, v_base_discount,
    p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
    p_invoice_date, p_due_date, p_fiscal_period_id
  );

  v_foreign_gross := round(
    (p_net_amount - coalesce(p_discount_amount, 0))
    * (1 + coalesce(p_vat_rate, 0) / 100), 4);

  update public.supplier_invoices
  set currency = upper(p_currency),
      exchange_rate = v_rate,
      foreign_net_amount = p_net_amount,
      foreign_discount_amount = coalesce(p_discount_amount, 0),
      foreign_amount = v_foreign_gross
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;


-- فرق التسوية: ما يُدفع لاحقًا بسعر آخر.
--
-- الفاتورة سُجِّلت بسعر يومها، والسداد يتم بسعر يوم السداد. الفرق **محقق** لا
-- تقديري، ويُرحَّل على ذمم المورد لأنه هناك نشأ.
create or replace function public.settle_supplier_invoice_fx_difference(
  p_invoice_id uuid,
  p_settlement_date date,
  p_settlement_rate numeric
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.supplier_invoices;
  v_period public.fiscal_periods;
  v_difference numeric;
  v_scale int;
  v_base text;
begin
  select * into v_inv from public.supplier_invoices where id = p_invoice_id;
  if not found then
    raise exception 'SUPPLIER_INVOICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_inv.organization_id, 'finance.entries.create') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فروق التسوية'
      using errcode = '42501';
  end if;

  -- فاتورة بعملة المؤسسة لا فرق لها بالتعريف، والسماح بالمحاولة يوحي بغير ذلك.
  if v_inv.currency is null then
    raise exception
      'INVOICE_NOT_FOREIGN_CURRENCY: الفاتورة بعملة المؤسسة، فلا فرق صرف لها'
      using errcode = '22023';
  end if;

  if p_settlement_rate <= 0 then
    raise exception 'EXCHANGE_RATE_INVALID: السعر يجب أن يكون أكبر من صفر'
      using errcode = '22023';
  end if;

  select o.default_currency into v_base
  from public.organizations o where o.id = v_inv.organization_id;
  v_scale := public.currency_decimals(coalesce(v_base, 'EGP'));

  -- الالتزام سُجِّل بـ(الإجمالي الأجنبي × سعر الفاتورة) وسيُسدَّد بـ(الإجمالي
  -- الأجنبي × سعر السداد). ارتفاع السعر يعني أننا ندفع أكثر بعملة الدفاتر:
  -- خسارة. ولذلك الفرق = (سعر الفاتورة − سعر السداد) × الإجمالي الأجنبي، فيخرج
  -- موجبًا عند الربح وسالبًا عند الخسارة، وهو الاصطلاح الذي تنتظره
  -- `post_fx_difference`.
  v_difference := round(
    (v_inv.exchange_rate - p_settlement_rate) * v_inv.foreign_amount, v_scale);

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_inv.organization_id
    and fp.status = 'OPEN'
    and p_settlement_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_period.id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ السداد (%)', p_settlement_date
      using errcode = 'P0001';
  end if;

  return public.post_fx_difference(
    v_inv.organization_id,
    v_inv.property_id,
    v_period.id,
    p_settlement_date,
    v_difference,
    v_inv.payable_account_id,
    'FX settlement — invoice ' || v_inv.invoice_number,
    'fx_settlement:' || p_invoice_id::text || ':' || p_settlement_date::text
  );
end;
$$;

grant execute on function public.post_supplier_invoice_in_currency(
  uuid, uuid, uuid, uuid, text, uuid, numeric, numeric, numeric, uuid, numeric, uuid,
  date, date, uuid, text, numeric) to authenticated;
grant execute on function public.settle_supplier_invoice_fx_difference(uuid, date, numeric) to authenticated;
