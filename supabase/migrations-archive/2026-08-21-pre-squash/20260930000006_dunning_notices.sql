-- إشعارات التحصيل (المرحلة ٤د).
--
-- **لا يوجد في هذا النظام ما يُرسل شيئًا.** لا جدول رسائل، ولا قالب، ولا مزوّد
-- بريد أو رسائل نصية — فحصتُ قبل أن أبني. ولذلك هذا الملف **لا يدّعي الإرسال**.
-- يُنشئ إشعارًا بحالة `RAISED` فقط، ولا توجد حالة `SENT` يستطيع الكود بلوغها
-- من تلقاء نفسه. تسجيل «أُرسل» بلا إرسال حقيقي أسوأ من عدم الإرسال: المشغّل
-- يظن أن المدين نُبِّه فيتوقف عن ملاحقته، والمدين لم يصله شيء.
-- وهي نفس قاعدة «لا تدّعِ VERIFIED دون مصدر حقيقي» في الفوترة الإلكترونية.
--
-- التسليم — بريد أو رسالة أو طباعة — عمل منفصل. حين يُبنى، يُسجّل عليه
-- `delivered_at` و`delivery_channel` من مصدر حقيقي.

create table if not exists public.dunning_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  stage smallint not null,
  name_ar text not null,
  name_en text not null,
  -- عدد الأيام بعد الاستحقاق التي يبدأ عندها هذا المستوى.
  days_overdue integer not null,
  -- حد أدنى للمبلغ: ملاحقة خمسة جنيهات تكلف أكثر مما تُحصّل.
  minimum_amount numeric(19,4) not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dunning_policies_stage_unique unique (organization_id, stage),
  constraint dunning_policies_stage_positive check (stage > 0),
  constraint dunning_policies_days_positive check (days_overdue >= 0),
  constraint dunning_policies_minimum_positive check (minimum_amount >= 0)
);

create table if not exists public.dunning_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  due_id uuid not null references public.dues(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,

  stage smallint not null,
  raised_on date not null,
  days_overdue integer not null,
  -- المبلغ **وقت الرفع**، لا اليوم: الإشعار مستند يقول ما كان مستحقًا حينها.
  outstanding_amount numeric(19,4) not null,

  status text not null default 'RAISED',
  delivered_at timestamptz,
  delivery_channel text,
  delivery_reference text,

  raised_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  -- مستوى واحد لكل مستحق: لا يُرفع الإشعار الثاني مرتين على الفاتورة نفسها،
  -- وإعادة تشغيل الدورة بلا أثر.
  constraint dunning_notices_once unique (due_id, stage),
  constraint dunning_notices_status_check check (status in ('RAISED', 'DELIVERED', 'CANCELLED')),
  -- لا «سُلِّم» بلا وقت تسليم وقناة. الحالة لا تُدّعى، تُثبَت.
  constraint dunning_notices_delivery_consistent check (
    (status = 'DELIVERED' and delivered_at is not null and delivery_channel is not null)
    or (status <> 'DELIVERED' and delivered_at is null)
  )
);

create index if not exists idx_dunning_notices_org on public.dunning_notices (organization_id);
create index if not exists idx_dunning_notices_due on public.dunning_notices (due_id);

create trigger trg_dunning_policies_updated_at
  before update on public.dunning_policies
  for each row execute function public.set_updated_at();

alter table public.dunning_policies enable row level security;
alter table public.dunning_notices enable row level security;

insert into public.permissions (key, description) values
  ('finance.dunning.read', 'الاطلاع على سياسات وإشعارات التحصيل'),
  ('finance.dunning.manage', 'ضبط سياسات التحصيل ورفع الإشعارات')
on conflict do nothing;

create policy "dunning_policies_select"
  on public.dunning_policies for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.dunning.manage')
  );

create policy "dunning_policies_manage"
  on public.dunning_policies for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.dunning.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.dunning.manage')
    and public.organization_is_active(organization_id)
  );

create policy "dunning_notices_select"
  on public.dunning_notices for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.dunning.manage')
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.dunning.read'),
  ('TENANT_OWNER', 'finance.dunning.manage'),
  ('FINANCE_MANAGER', 'finance.dunning.read'),
  ('FINANCE_MANAGER', 'finance.dunning.manage'),
  ('ACCOUNTANT', 'finance.dunning.read'),
  ('COLLECTOR', 'finance.dunning.read'),
  ('COLLECTOR', 'finance.dunning.manage'),
  ('AUDITOR', 'finance.dunning.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.dunning.read', 'finance.dunning.manage')
on conflict do nothing;


-- المتبقي على مستحق = المبلغ − المخصَّص له من دفعات **مُرحَّلة**.
-- الدفعة غير المرحَّلة ليست تحصيلًا، وحسابها يوقف ملاحقة دين لم يُسدَّد.
create or replace function public.due_outstanding(p_due_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select d.amount - coalesce((
    select sum(a.amount) from public.payment_allocations a
    join public.payments p on p.id = a.payment_id
    where a.due_id = d.id and p.status = 'POSTED' and a.reversed_at is null
  ), 0)
  from public.dues d where d.id = p_due_id;
$$;


-- ما يستحق إشعارًا اليوم، ولمَ.
--
-- المستوى المستحق هو **أعلى** مستوى تجاوز المدين أيامه، لا أدناه: مستحق متأخر
-- 90 يومًا يجب أن يبلغ مستوى الـ90 لا أن يبدأ من الـ7 ويتدرّج. والمرفوع سابقًا
-- يُستبعد لأن القيد الفريد يرفضه على أي حال — يُستبعد هنا ليكون العرض صادقًا،
-- لا لتفادي خطأ.
create or replace function public.list_dunning_candidates(
  p_organization_id uuid,
  p_as_of date default current_date
)
returns table (
  due_id uuid, description text, due_date date, days_overdue integer,
  outstanding numeric, member_id uuid, member_name text, member_email text,
  member_phone text, stage smallint, stage_name_ar text, stage_name_en text,
  already_raised boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التحصيل'
      using errcode = '42501';
  end if;

  return query
  with overdue as (
    select d.id, d.description, d.due_date, d.unit_id,
           (p_as_of - d.due_date)::integer as days_late,
           public.due_outstanding(d.id) as outstanding
    from public.dues d
    where d.organization_id = p_organization_id
      and d.status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
      and d.due_date < p_as_of
  ),
  with_stage as (
    select o.*,
           (select pol.stage from public.dunning_policies pol
            where pol.organization_id = p_organization_id and pol.is_active
              and o.days_late >= pol.days_overdue
              and o.outstanding >= pol.minimum_amount
            order by pol.days_overdue desc
            limit 1) as matched_stage
    from overdue o
    where o.outstanding > 0
  )
  select w.id, coalesce(w.description, ''), w.due_date, w.days_late, w.outstanding,
         m.id, m.full_name, m.email, m.phone,
         pol.stage, pol.name_ar, pol.name_en,
         exists (select 1 from public.dunning_notices n
                 where n.due_id = w.id and n.stage = pol.stage)
  from with_stage w
  join public.dunning_policies pol
    on pol.organization_id = p_organization_id and pol.stage = w.matched_stage
  -- صاحب الوحدة الحالي وجهة الإشعار. غيابه لا يُسقط الصف: مستحق بلا مالك
  -- **مشكلة بيانات يجب أن تُرى**، لا صف يُخفى حتى يُصلَح.
  left join public.unit_ownerships uo
    on uo.unit_id = w.unit_id and uo.is_primary_contact
   and (uo.end_date is null or uo.end_date >= p_as_of)
  left join public.members m on m.id = uo.member_id
  where w.matched_stage is not null
  order by w.days_late desc, w.outstanding desc;
end;
$$;


-- رفع إشعارات مستوى واحد.
--
-- «رفع» لا «إرسال». الإشعار يُنشأ بحالة RAISED، ولا سبيل في هذا الملف لبلوغ
-- DELIVERED — تلك تحتاج تسليمًا حقيقيًا يسجّل قناته ووقته.
create or replace function public.raise_dunning_notices(
  p_organization_id uuid,
  p_stage smallint,
  p_as_of date default current_date
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
  v_count int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك برفع إشعارات التحصيل'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.dunning_policies
    where organization_id = p_organization_id and stage = p_stage and is_active
  ) then
    raise exception 'DUNNING_STAGE_NOT_FOUND: لا يوجد مستوى تحصيل نشط بهذا الرقم (%)', p_stage
      using errcode = '22023';
  end if;

  for v_row in
    select * from public.list_dunning_candidates(p_organization_id, p_as_of) c
    where c.stage = p_stage and not c.already_raised
  loop
    insert into public.dunning_notices (
      organization_id, due_id, member_id, stage, raised_on,
      days_overdue, outstanding_amount, raised_by
    ) values (
      p_organization_id, v_row.due_id, v_row.member_id, p_stage, p_as_of,
      v_row.days_overdue, v_row.outstanding, auth.uid()
    )
    on conflict (due_id, stage) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.due_outstanding(uuid) to authenticated;
grant execute on function public.list_dunning_candidates(uuid, date) to authenticated;
grant execute on function public.raise_dunning_notices(uuid, smallint, date) to authenticated;


-- ── تسجيل التسليم (طُبِّق كـ dunning_delivery_recording) ────────────────────
--
-- القنوات المسموحة كلها **يدوية**: طُبع، سُلِّم باليد، اتصال، أو أُرسل من خارج
-- النظام. لا قناة آلية هنا لأن النظام لا يملك واحدة — وحين تُبنى، تُضاف قيمتها
-- ويُسجَّل مرجعها الحقيقي في `delivery_reference`.
--
-- الفارق الجوهري: هذه الدالة تُسجّل **ما فعله إنسان**، لا ما ادّعاه الكود.

alter table public.dunning_notices
  drop constraint if exists dunning_notices_channel_check;

alter table public.dunning_notices
  add constraint dunning_notices_channel_check check (
    delivery_channel is null
    or delivery_channel in ('PRINTED', 'HAND_DELIVERED', 'PHONE', 'EMAIL_EXTERNAL', 'WHATSAPP_EXTERNAL', 'POST')
  );

create or replace function public.record_dunning_delivery(
  p_notice_id uuid,
  p_channel text,
  p_reference text default null,
  p_delivered_at timestamptz default now()
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  select organization_id, status into v_org, v_status
  from public.dunning_notices where id = p_notice_id;

  if v_org is null then
    raise exception 'DUNNING_NOTICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.dunning.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتسجيل تسليم الإشعارات'
      using errcode = '42501';
  end if;

  if v_status = 'CANCELLED' then
    raise exception 'DUNNING_NOTICE_CANCELLED: الإشعار ملغى، فلا يُسجَّل له تسليم'
      using errcode = '22023';
  end if;

  -- التسليم واقعة لا تتكرر: تسجيله مرتين يوحي بتنبيهين ولم يقع إلا واحد.
  if v_status = 'DELIVERED' then
    raise exception 'DUNNING_NOTICE_ALREADY_DELIVERED: سُجِّل تسليم هذا الإشعار من قبل'
      using errcode = '22023';
  end if;

  update public.dunning_notices
  set status = 'DELIVERED',
      delivered_at = p_delivered_at,
      delivery_channel = p_channel,
      delivery_reference = nullif(btrim(coalesce(p_reference, '')), '')
  where id = p_notice_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'dunning_notice.delivered', 'dunning_notice', p_notice_id,
    jsonb_build_object('channel', p_channel, 'delivered_at', p_delivered_at)
  );
end;
$$;

create or replace function public.list_dunning_notices(p_organization_id uuid)
returns table (
  id uuid, due_id uuid, stage smallint, stage_name_ar text, stage_name_en text,
  raised_on date, days_overdue integer, outstanding_amount numeric,
  status text, delivered_at timestamptz, delivery_channel text,
  member_name text, member_email text, member_phone text,
  due_description text, due_date date, unit_code text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الإشعارات'
      using errcode = '42501';
  end if;

  return query
  select n.id, n.due_id, n.stage, pol.name_ar, pol.name_en,
         n.raised_on, n.days_overdue, n.outstanding_amount,
         n.status, n.delivered_at, n.delivery_channel,
         m.full_name, m.email, m.phone,
         coalesce(d.description, ''), d.due_date, u.code
  from public.dunning_notices n
  left join public.dunning_policies pol
    on pol.organization_id = n.organization_id and pol.stage = n.stage
  left join public.members m on m.id = n.member_id
  left join public.dues d on d.id = n.due_id
  left join public.units u on u.id = d.unit_id
  where n.organization_id = p_organization_id
  -- غير المسلَّم أولًا: الشاشة للعمل المتبقي.
  order by (n.status <> 'RAISED'), n.raised_on desc, n.outstanding_amount desc;
end;
$$;

grant execute on function public.record_dunning_delivery(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.list_dunning_notices(uuid) to authenticated;
