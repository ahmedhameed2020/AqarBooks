-- الأصول الثابتة والإهلاك (المرحلة ٤).
--
-- الإهلاك ليس حسابًا يُعاد كل شهر، بل **حدث مُرحَّل مرة واحدة لكل أصل ولكل فترة**.
-- ولذلك المفتاح الفريد على (asset, fiscal_period) هو جوهر التصميم لا تفصيلًا فيه:
-- تشغيل الإهلاك مرتين على الفترة نفسها يجب أن يكون بلا أثر، لا أن يُضاعف المصروف.
--
-- حسابات كل أصل تُحفظ على الأصل نفسه لا على المؤسسة: منشأة سياحية قد تُهلك
-- المباني على حساب غير الذي تُهلك عليه السيارات، وربط ذلك بالمؤسسة كان سيفرض
-- حسابًا واحدًا على الجميع.
--
-- ملاحظة على «مجمع الإهلاك»: في دليل الحسابات القياسي رصيده الطبيعي DEBIT، وهذا
-- مقصود لا خطأ — `get_trial_balance` يحسب الرصيد حسب الرصيد الطبيعي، فالحساب
-- المدين الذي يُقيَّد دائنًا يظهر **سالبًا** ويُنقص إجمالي الأصول، وهو السلوك
-- الصحيح لحساب مقابل. لو جُعل CREDIT لظهر موجبًا و**ضخّم** الأصول.

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,

  code text not null,
  name_ar text not null,
  name_en text not null,

  -- الثلاثة إلزامية: أصل بلا حساب مجمع إهلاك أو بلا حساب مصروف لا يمكن ترحيل
  -- إهلاكه أصلًا، وقبوله ناقصًا يؤجّل الاكتشاف إلى لحظة الترحيل.
  asset_account_id uuid not null references public.chart_of_accounts(id),
  accumulated_depreciation_account_id uuid not null references public.chart_of_accounts(id),
  depreciation_expense_account_id uuid not null references public.chart_of_accounts(id),

  acquisition_date date not null,
  acquisition_cost numeric(18,4) not null,
  salvage_value numeric(18,4) not null default 0,
  useful_life_months integer not null,

  method text not null default 'STRAIGHT_LINE',
  status text not null default 'ACTIVE',

  disposal_date date,
  disposal_proceeds numeric(18,4),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fixed_assets_code_unique unique (organization_id, code),
  constraint fixed_assets_cost_positive check (acquisition_cost > 0),
  -- القيمة التخريدية جزء من التكلفة لا إضافة عليها، وتساويها يعني أصلًا غير
  -- قابل للإهلاك — يُرفض عند الإدخال بدل أن يُنتج قسطًا صفريًا كل شهر.
  constraint fixed_assets_salvage_below_cost check (salvage_value >= 0 and salvage_value < acquisition_cost),
  constraint fixed_assets_life_positive check (useful_life_months > 0),
  constraint fixed_assets_method_check check (method in ('STRAIGHT_LINE')),
  constraint fixed_assets_status_check check (status in ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED')),
  constraint fixed_assets_disposal_consistent check (
    (status = 'DISPOSED' and disposal_date is not null)
    or (status <> 'DISPOSED' and disposal_date is null)
  )
);

create index if not exists idx_fixed_assets_org on public.fixed_assets (organization_id);
create index if not exists idx_fixed_assets_status on public.fixed_assets (organization_id, status);

-- سجل الإهلاك: صف واحد لكل (أصل، فترة). القيد الفريد أدناه هو ما يجعل إعادة
-- التشغيل بلا أثر.
create table if not exists public.fixed_asset_depreciation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fixed_asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_periods(id) on delete restrict,

  entry_date date not null,
  amount numeric(18,4) not null,
  journal_entry_id uuid references public.journal_entries(id),

  posted_by uuid references auth.users(id),
  posted_at timestamptz not null default now(),

  constraint fad_once_per_period unique (fixed_asset_id, fiscal_period_id),
  constraint fad_amount_positive check (amount > 0)
);

create index if not exists idx_fad_org on public.fixed_asset_depreciation (organization_id);
create index if not exists idx_fad_asset on public.fixed_asset_depreciation (fixed_asset_id);

create trigger trg_fixed_assets_updated_at
  before update on public.fixed_assets
  for each row execute function public.set_updated_at();

alter table public.fixed_assets enable row level security;
alter table public.fixed_asset_depreciation enable row level security;

insert into public.permissions (key, description) values
  ('finance.assets.read', 'الاطلاع على سجل الأصول الثابتة وإهلاكها'),
  ('finance.assets.manage', 'تسجيل الأصول الثابتة وترحيل الإهلاك')
on conflict do nothing;

create policy "fixed_assets_select"
  on public.fixed_assets for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.assets.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.assets.manage')
  );

create policy "fixed_assets_manage"
  on public.fixed_assets for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.assets.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.assets.manage')
    and public.organization_is_active(organization_id)
  );

-- لا سياسة كتابة للعميل على سجل الإهلاك: كل صف فيه يحمل قيدًا في الدفاتر،
-- فيُنشأ عبر الدالة أدناه فقط — نفس قاعدة العمولات والشيكات.
create policy "fad_select"
  on public.fixed_asset_depreciation for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.assets.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.assets.manage')
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.assets.read'),
  ('TENANT_OWNER', 'finance.assets.manage'),
  ('FINANCE_MANAGER', 'finance.assets.read'),
  ('FINANCE_MANAGER', 'finance.assets.manage'),
  ('ACCOUNTANT', 'finance.assets.read'),
  ('ACCOUNTANT', 'finance.assets.manage'),
  ('PROPERTY_MANAGER', 'finance.assets.read'),
  ('AUDITOR', 'finance.assets.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.assets.read', 'finance.assets.manage')
on conflict do nothing;


-- المتبقي القابل للإهلاك = (التكلفة − التخريدية) − ما رُحِّل فعلًا.
-- يُشتق من السجل لا من عمود مخزَّن، فلا يمكن أن ينحرف عن الدفاتر.
create or replace function public.depreciable_remaining(p_asset_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select (a.acquisition_cost - a.salvage_value)
       - coalesce((select sum(d.amount) from public.fixed_asset_depreciation d
                   where d.fixed_asset_id = a.id), 0)
  from public.fixed_assets a
  where a.id = p_asset_id;
$$;


-- قسط فترة واحدة لأصل واحد.
--
-- القسط الشهري = الأساس ÷ العمر، مقرَّبًا بعملة المؤسسة. والقسط الأخير يأخذ
-- **الباقي كاملًا** لا القسط المقرَّب، وإلا تراكم فرق التقريب وبقي الأصل بقيمة
-- دفترية لا تساوي قيمته التخريدية أبدًا. هذه هي نفس قاعدة «أكبر باقٍ» في توزيع
-- رسوم الخدمة: المجموع يجب أن يُطابق بالبناء لا بالتقريب.
create or replace function public.depreciation_for_period(p_asset_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare
  v_asset public.fixed_assets;
  v_currency text;
  v_scale int;
  v_monthly numeric;
  v_remaining numeric;
  v_posted int;
begin
  select * into v_asset from public.fixed_assets where id = p_asset_id;
  if not found then
    raise exception 'FIXED_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select default_currency into v_currency from public.organizations where id = v_asset.organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));

  v_remaining := public.depreciable_remaining(p_asset_id);
  if v_remaining <= 0 then
    return 0;
  end if;

  v_monthly := round(
    (v_asset.acquisition_cost - v_asset.salvage_value) / v_asset.useful_life_months,
    v_scale
  );

  select count(*) into v_posted
  from public.fixed_asset_depreciation d where d.fixed_asset_id = p_asset_id;

  -- القسط الأخير يأخذ **الباقي كاملًا**، ويُعرَف بعدّ الأقساط لا بمقارنة المبالغ.
  -- المقارنة (الباقي < القسط) خاطئة: بعد ستة أقساط من 1285.71 يبقى 1285.74، وهو
  -- أكبر من القسط لا أصغر، فيأخذ القسط المقرَّب ويتبقّى 0.03 يمدّ الأصل إلى شهر
  -- ثامن — أي أن العمر الإنتاجي المُدخل يُنتهك بفعل التقريب وحده. أمسك هذا
  -- الاختبارُ التكاملي لا المراجعة.
  if v_posted + 1 >= v_asset.useful_life_months then
    return v_remaining;
  end if;

  -- وإن نقص الباقي عن قسط كامل لأي سبب آخر، يؤخذ كما هو.
  if v_remaining < v_monthly then
    return v_remaining;
  end if;

  return v_monthly;
end;
$$;


-- ترحيل إهلاك فترة كاملة لكل الأصول المؤهَّلة.
--
-- «مؤهَّل» يعني: نشط، مُقتنى في تاريخ لا يتجاوز نهاية الفترة، وما زال له متبقٍّ.
-- الأصل الذي رُحِّل إهلاكه لهذه الفترة يُتخطّى بصمت — إعادة التشغيل ليست خطأ،
-- وهي الحالة الطبيعية حين يُقفل شهر على دفعتين.
create or replace function public.post_depreciation_for_period(
  p_organization_id uuid,
  p_fiscal_period_id uuid
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_period public.fiscal_periods;
  v_asset public.fixed_assets;
  v_amount numeric;
  v_entry_id uuid;
  v_posted int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.assets.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بترحيل الإهلاك'
      using errcode = '42501';
  end if;

  select * into v_period from public.fiscal_periods
  where id = p_fiscal_period_id and organization_id = p_organization_id;
  if not found then
    raise exception 'FISCAL_PERIOD_NOT_FOUND: الفترة المالية غير موجودة في هذه المؤسسة'
      using errcode = 'P0001';
  end if;

  -- فترة مقفلة لا تقبل قيدًا جديدًا. الرفض هنا أوضح من تركه ينكسر داخل محرك القيود.
  if v_period.status <> 'OPEN' then
    raise exception
      'FISCAL_PERIOD_NOT_OPEN: الفترة (%) ليست مفتوحة، فلا يمكن ترحيل الإهلاك إليها', v_period.name
      using errcode = 'P0001';
  end if;

  for v_asset in
    select a.* from public.fixed_assets a
    where a.organization_id = p_organization_id
      and a.status = 'ACTIVE'
      and a.acquisition_date <= v_period.end_date
      and not exists (
        select 1 from public.fixed_asset_depreciation d
        where d.fixed_asset_id = a.id and d.fiscal_period_id = p_fiscal_period_id
      )
    order by a.code
  loop
    v_amount := public.depreciation_for_period(v_asset.id);

    -- استُنفد الأصل: يُختم مرة واحدة بدل أن يُفحص كل شهر إلى الأبد.
    if v_amount <= 0 then
      update public.fixed_assets set status = 'FULLY_DEPRECIATED' where id = v_asset.id;
      continue;
    end if;

    v_entry_id := public.create_journal_entry_internal(
      p_organization_id,
      v_asset.property_id,
      p_fiscal_period_id,
      v_period.end_date,
      'Depreciation — ' || v_asset.code || ' ' || v_asset.name_en,
      'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_asset.depreciation_expense_account_id, 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id, 'debit', 0, 'credit', v_amount)
      ),
      'depreciation:' || v_asset.id::text || ':' || p_fiscal_period_id::text
    );
    perform public.post_journal_entry_internal(v_entry_id);

    insert into public.fixed_asset_depreciation (
      organization_id, fixed_asset_id, fiscal_period_id, entry_date, amount,
      journal_entry_id, posted_by
    ) values (
      p_organization_id, v_asset.id, p_fiscal_period_id, v_period.end_date, v_amount,
      v_entry_id, auth.uid()
    );

    -- بلغ نهايته بهذا القسط: يُختم الآن، فلا يُفحص في الفترات التالية.
    if public.depreciable_remaining(v_asset.id) <= 0 then
      update public.fixed_assets set status = 'FULLY_DEPRECIATED' where id = v_asset.id;
    end if;

    v_posted := v_posted + 1;
  end loop;

  return v_posted;
end;
$$;


-- عرض السجل بالقيمة الدفترية محسوبة، لا مخزَّنة.
create or replace function public.list_fixed_assets(p_organization_id uuid)
returns table (
  id uuid, code text, name_ar text, name_en text, status text,
  acquisition_date date, acquisition_cost numeric, salvage_value numeric,
  useful_life_months integer, accumulated numeric, net_book_value numeric,
  remaining numeric, periods_posted bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.assets.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.assets.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الأصول الثابتة'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.code, a.name_ar, a.name_en, a.status,
         a.acquisition_date, a.acquisition_cost, a.salvage_value,
         a.useful_life_months,
         coalesce(d.total, 0),
         a.acquisition_cost - coalesce(d.total, 0),
         public.depreciable_remaining(a.id),
         coalesce(d.periods, 0)
  from public.fixed_assets a
  left join lateral (
    select sum(x.amount) as total, count(*) as periods
    from public.fixed_asset_depreciation x where x.fixed_asset_id = a.id
  ) d on true
  where a.organization_id = p_organization_id
  -- النشط أولًا: الشاشة للعمل المتبقي لا لأرشيف ما استُنفد.
  order by (a.status <> 'ACTIVE'), a.code;
end;
$$;

grant execute on function public.depreciable_remaining(uuid) to authenticated;
grant execute on function public.depreciation_for_period(uuid) to authenticated;
grant execute on function public.post_depreciation_for_period(uuid, uuid) to authenticated;
grant execute on function public.list_fixed_assets(uuid) to authenticated;
