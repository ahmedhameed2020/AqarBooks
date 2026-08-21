-- تكلفة المشاريع والأعمال تحت التنفيذ (المرحلة ٤ج).
--
-- **لم أُنشئ جدول `projects`.** كان موجودًا بالفعل — هو و`cost_centers` —
-- بسياساته ومفتاحه الفريد، وبصفر صفوف. و`journal_entry_lines` تحمل منذ البداية
-- عمودَي `project_id` و`cost_center_id`، و`create_journal_entry_internal` تقرأ
-- كليهما من كل سطر وتكتبهما. أي أن البُعد كان **مبنيًّا من طرفه إلى طرفه**
-- وينقصه شيئان فقط: مفتاح خارجي على العمود، وحسابات محاسبية على المشروع.
--
-- (وكدتُ أُنشئه من جديد: استعلام المسح الأول عندي كان متعدد الجُمل، وأداة
-- التنفيذ تُعيد نتيجة الجملة الأخيرة فقط، فلم أرَ الجدول. الخطأ ظهر عند
-- التطبيق لا عند المراجعة.)
--
-- ولم أُضِف صلاحية جديدة: للجدول سياستان قائمتان على `finance.accounts.manage`
-- وعضوية المؤسسة، فالدوال تفحص **نفس القاعدة**. صلاحية موازية لجدول له صلاحية
-- هي القاعدة الثانية التي تنحرف.
--
-- **المبدأ المحاسبي:** المطوّر الذي ينفق على مشروع لا يُصرّف الإنفاق مصروفًا —
-- يُرسمله أصلًا تحت التنفيذ. المصروف يظهر حين تُباع الوحدات فيُحرَّر جزء من
-- الأصل إلى تكلفة المبيعات. تصريف الإنفاق فور وقوعه **يُظهر المطوّر خاسرًا
-- طوال سنوات البناء ثم رابحًا فجأة عند البيع** — تشويه للنتيجة لا خطأ عرض.
--
-- ورصيد الأعمال تحت التنفيذ **يُشتق من الدفاتر لا يُخزَّن**: الرقم المخزَّن
-- ينحرف عن الأستاذ عند أول قيد يدوي موسوم بالمشروع.

alter table public.projects
  add column if not exists wip_account_id uuid references public.chart_of_accounts(id),
  add column if not exists cost_of_sales_account_id uuid references public.chart_of_accounts(id),
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists start_date date,
  add column if not exists expected_completion_date date,
  add column if not exists budget_amount numeric(19,4),
  add column if not exists updated_at timestamptz not null default now();

-- الحسابان يقبلان الفراغ لأن الجدول قائم، لكن الترحيل **يرفض** حتى يُضبطا —
-- نفس نمط حسابات فروق الصرف والاستبعاد: يُضبط ثم يُرحَّل.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'));

alter table public.projects drop constraint if exists projects_budget_positive;
alter table public.projects add constraint projects_budget_positive
  check (budget_amount is null or budget_amount > 0);

-- العمود كان بلا مرجع منذ إنشائه. يُربط الآن ويبقى قابلًا للإفراغ: أغلب القيود
-- ليست على مشروع.
alter table public.journal_entry_lines
  drop constraint if exists journal_entry_lines_project_id_fkey;
alter table public.journal_entry_lines
  add constraint journal_entry_lines_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

create index if not exists idx_jel_project on public.journal_entry_lines (project_id)
  where project_id is not null;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();


-- ما رُسمل، وما حُرِّر، والرصيد — من سطور القيود الموسومة بالمشروع مباشرة.
-- أي قيد يدوي يوسم بالمشروع يدخل الحساب تلقائيًا، فلا يمكن للرقم أن يخالف
-- الأستاذ.
create or replace function public.project_wip_summary(p_project_id uuid)
returns table (capitalised numeric, released numeric, wip_balance numeric)
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_wip uuid;
begin
  select pr.wip_account_id into v_wip from public.projects pr where pr.id = p_project_id;

  return query
  select
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0)
      - coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0)
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.project_id = p_project_id and je.status = 'POSTED';
end;
$fn$;


create or replace function public.capitalise_project_cost(
  p_project_id uuid,
  p_amount numeric,
  p_credit_account_id uuid,
  p_entry_date date,
  p_description text
)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك برسملة تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حساب الأعمال تحت التنفيذ وحساب تكلفة المبيعات للمشروع (%) أولًا',
      v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_COST_NOT_POSITIVE: قيمة الرسملة يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  -- مشروع مقفل أو ملغى لا يستقبل تكلفة: قبولها يعيد فتح ما أُقفل حسابيًا.
  if v_project.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'PROJECT_NOT_OPEN: المشروع (%) بحالة % فلا تُرسمل عليه تكلفة جديدة',
      v_project.code, v_project.status
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'WIP — ' || v_project.code || ' — ' || coalesce(p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.wip_account_id, 'debit', p_amount, 'credit', 0,
                         'project_id', p_project_id),
      jsonb_build_object('account_id', p_credit_account_id, 'debit', 0, 'credit', p_amount,
                         'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$fn$;


-- تحرير جزء من الأعمال تحت التنفيذ إلى تكلفة المبيعات عند بيع وحدات.
--
-- **لا يُحرَّر أكثر من الرصيد المتراكم.** تجاوزه اعتراف بتكلفة لم تُنفق، ويجعل
-- رصيد الأصل سالبًا — وهو ما لا يعنيه شيء في الميزانية.
create or replace function public.release_project_wip(
  p_project_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_description text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_balance numeric;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتحرير تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حسابي المشروع (%) أولًا', v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_RELEASE_NOT_POSITIVE: قيمة التحرير يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  select s.wip_balance into v_balance from public.project_wip_summary(p_project_id) s;

  if p_amount > coalesce(v_balance, 0) then
    raise exception
      'PROJECT_RELEASE_EXCEEDS_WIP: التحرير (%) يتجاوز رصيد الأعمال تحت التنفيذ (%)',
      p_amount, coalesce(v_balance, 0)
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'Cost of sales — ' || v_project.code || coalesce(' — ' || p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.cost_of_sales_account_id,
                         'debit', p_amount, 'credit', 0, 'project_id', p_project_id),
      jsonb_build_object('account_id', v_project.wip_account_id,
                         'debit', 0, 'credit', p_amount, 'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$fn$;


create or replace function public.list_projects(p_organization_id uuid)
returns table (
  id uuid, code text, name_ar text, name_en text, status text,
  accounts_set boolean, budget_amount numeric, capitalised numeric,
  released numeric, wip_balance numeric, budget_variance numeric
)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  if not public.is_org_member(auth.uid(), p_organization_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المشاريع'
      using errcode = '42501';
  end if;

  return query
  select pr.id, pr.code, pr.name_ar, pr.name_en, pr.status,
         (pr.wip_account_id is not null and pr.cost_of_sales_account_id is not null),
         pr.budget_amount, s.capitalised, s.released, s.wip_balance,
         -- موجب = تحت الموازنة. و NULL حين لا موازنة، لا صفر: الصفر يعني
         -- «مطابق تمامًا» وهو ادّعاء مختلف عن «لا موازنة للمقارنة».
         case when pr.budget_amount is null then null
              else pr.budget_amount - s.capitalised end
  from public.projects pr
  cross join lateral public.project_wip_summary(pr.id) s
  where pr.organization_id = p_organization_id
  order by (pr.status <> 'ACTIVE'), pr.code;
end;
$fn$;

grant execute on function public.project_wip_summary(uuid) to authenticated;
grant execute on function public.capitalise_project_cost(uuid, numeric, uuid, date, text) to authenticated;
grant execute on function public.release_project_wip(uuid, numeric, date, text) to authenticated;
grant execute on function public.list_projects(uuid) to authenticated;

