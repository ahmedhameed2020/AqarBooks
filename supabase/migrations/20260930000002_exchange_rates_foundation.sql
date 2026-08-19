-- أساس تعدد العملات (المرحلة ٤ب) — سجل الأسعار ودالة التحويل.
--
-- الحالة قبل هذا الملف: العمود الوحيد الواعي بالعملة في المخطط كله هو
-- `organizations.default_currency`. لا سعر صرف في أي مكان. فأي مبلغ بعملة أخرى
-- كان سيدخل الدفاتر برقمه كما هو.
--
-- **القاعدة الحاكمة: غياب السعر رفض، لا افتراض 1:1.**
-- هذا ليس تشددًا. لو حوّلنا 1000 يورو إلى مؤسسة جنيهها المصري بسعر مفترض 1،
-- لدخلت الدفاتر 1000 بدل ~55,000 — خطأ بمقدار خمسة وخمسين ضعفًا لا يُظهره أي
-- ميزان مراجعة، لأن القيد سيكون **متوازنًا** بالرقم الخاطئ. الرفض الصريح هو
-- الفارق بين نظام يعرف أنه لا يعرف، ونظام يكذب بثقة.
-- وهي نفس قاعدة رفض المساحة الغائبة في توزيع رسوم الخدمة، ورفض أساس NET.
--
-- اتجاه السعر مُسمّى لا مُستنتَج: `base_per_unit` = كم وحدة من عملة المؤسسة
-- تساوي **وحدة واحدة** من العملة الأجنبية. عكس الاتجاه أشهر أخطاء هذا الباب،
-- واسم العمود وحده يمنعه.

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  foreign_currency text not null,
  base_currency text not null,
  rate_date date not null,
  base_per_unit numeric(18,8) not null,

  -- من أين جاء السعر: البنك المركزي، عقد، أو إدخال يدوي. لا يُفرض، لكنه يُحفظ
  -- لأن سعرًا بلا مصدر لا يمكن الدفاع عنه أمام مراجع.
  source text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  constraint exchange_rates_unique unique (organization_id, foreign_currency, base_currency, rate_date),
  constraint exchange_rates_positive check (base_per_unit > 0),
  -- عملة إلى نفسها ليست سعر صرف، والسماح بها يفتح باب سعر ≠ 1 للعملة نفسها.
  constraint exchange_rates_distinct check (foreign_currency <> base_currency),
  constraint exchange_rates_iso check (
    foreign_currency ~ '^[A-Z]{3}$' and base_currency ~ '^[A-Z]{3}$'
  )
);

create index if not exists idx_exchange_rates_lookup
  on public.exchange_rates (organization_id, foreign_currency, base_currency, rate_date desc);

alter table public.exchange_rates enable row level security;

insert into public.permissions (key, description) values
  ('finance.fx.read', 'الاطلاع على أسعار الصرف'),
  ('finance.fx.manage', 'تسجيل أسعار الصرف وتعديلها')
on conflict do nothing;

create policy "exchange_rates_select"
  on public.exchange_rates for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.fx.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.fx.manage')
  );

create policy "exchange_rates_manage"
  on public.exchange_rates for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.fx.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.fx.manage')
    and public.organization_is_active(organization_id)
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.fx.read'),
  ('TENANT_OWNER', 'finance.fx.manage'),
  ('FINANCE_MANAGER', 'finance.fx.read'),
  ('FINANCE_MANAGER', 'finance.fx.manage'),
  ('ACCOUNTANT', 'finance.fx.read'),
  ('ACCOUNTANT', 'finance.fx.manage'),
  ('AUDITOR', 'finance.fx.read'),
  ('CASHIER', 'finance.fx.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.fx.read', 'finance.fx.manage')
on conflict do nothing;


-- السعر السارِي في تاريخ ما = أحدث سعر مُسجَّل في ذلك التاريخ أو قبله.
--
-- «أو قبله» مقصود: أسعار الصرف تُنشر في أيام العمل، والمعاملة في يوم جمعة تأخذ
-- سعر الخميس. أما البحث عن سعر **بعد** التاريخ فممنوع ضمنًا — لا يجوز تقييم
-- معاملة بسعر لم يكن معروفًا وقتها.
create or replace function public.get_exchange_rate(
  p_organization_id uuid,
  p_foreign_currency text,
  p_base_currency text,
  p_date date
)
returns table (rate numeric, rate_date date, source text)
language sql stable security definer set search_path = public
as $$
  select r.base_per_unit, r.rate_date, r.source
  from public.exchange_rates r
  where r.organization_id = p_organization_id
    and r.foreign_currency = upper(p_foreign_currency)
    and r.base_currency = upper(p_base_currency)
    and r.rate_date <= p_date
  order by r.rate_date desc
  limit 1;
$$;


-- التحويل إلى عملة المؤسسة.
--
-- العملة نفسها تمرّ كما هي بلا بحث عن سعر — وهذا ما يجعل هذا الملف بلا أثر على
-- كل مؤسسة أحادية العملة قائمة اليوم.
create or replace function public.convert_to_base(
  p_organization_id uuid,
  p_amount numeric,
  p_currency text,
  p_date date
)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare
  v_base text;
  v_rate numeric;
  v_rate_date date;
  v_scale int;
begin
  select default_currency into v_base from public.organizations where id = p_organization_id;
  if v_base is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- الهوية: لا سعر، ولا تقريب، ولا أثر على أي مسار قائم.
  if upper(p_currency) = upper(v_base) then
    return p_amount;
  end if;

  select g.rate, g.rate_date into v_rate, v_rate_date
  from public.get_exchange_rate(p_organization_id, p_currency, v_base, p_date) g;

  if v_rate is null then
    raise exception
      'EXCHANGE_RATE_MISSING: لا يوجد سعر صرف لـ% مقابل% في% أو قبله — سجّل السعر أولًا',
      upper(p_currency), upper(v_base), p_date
      using errcode = 'P0001';
  end if;

  v_scale := public.currency_decimals(v_base);
  return round(p_amount * v_rate, v_scale);
end;
$$;


create or replace function public.list_exchange_rates(p_organization_id uuid)
returns table (
  id uuid, foreign_currency text, base_currency text, rate_date date,
  base_per_unit numeric, source text, is_latest boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.fx.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.fx.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على أسعار الصرف'
      using errcode = '42501';
  end if;

  return query
  select r.id, r.foreign_currency, r.base_currency, r.rate_date,
         r.base_per_unit, r.source,
         -- أحدث سعر لكل زوج: هو المستعمل فعلًا اليوم، والباقي تاريخ.
         r.rate_date = max(r.rate_date) over (
           partition by r.foreign_currency, r.base_currency
         )
  from public.exchange_rates r
  where r.organization_id = p_organization_id
  order by r.foreign_currency, r.rate_date desc;
end;
$$;

grant execute on function public.get_exchange_rate(uuid, text, text, date) to authenticated;
grant execute on function public.convert_to_base(uuid, numeric, text, date) to authenticated;
grant execute on function public.list_exchange_rates(uuid) to authenticated;
