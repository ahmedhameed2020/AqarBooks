-- شاشة مراجعة ربط أنواع المستحقات — الطبقة الخلفية.
--
-- ثلاث إضافات، بلا أي تغيير في الحواجز التي اعتُمدت في المرحلة الأولى:
--
-- ١. **سجل تدقيق على الربط.** ثلاثة أفعال تُسجَّل في `platform_audit_logs`:
--    `tax_mapping.set` و`tax_mapping.approved` و`tax_mapping.approval_revoked`،
--    وكلها تحفظ ما **قبل** وما **بعد**. تغيير طبيعة إيراد مربوطة يُسقط اعتمادًا
--    قائمًا، فلا يكفي أن يقول السجل «تغيّر شيء»؛ لا بد أن يبيّن ما أُلغي ومَن ألغاه.
--
-- ٢. **مسار سحب الاعتماد صراحةً.** كان سحب الاعتماد لا يتم إلا بإعادة ضبط
--    الطبيعة إلى قيمتها نفسها — التفاف لا نية، ولا يترك في السجل أثرًا يقول إن
--    المراجع أراد السحب. صار له فعل مستقل يقبل سببًا.
--
-- ٣. **قائمة المراجعة تُظهر غير المربوط.** النوع بلا صف ربط يظهر بحالة
--    `REVIEW_REQUIRED` صريحة بدل أن يغيب. غيابه من الشاشة يُقرأ «لا شيء مطلوب»،
--    وهو عكس الحقيقة تمامًا، وهو الخطأ الذي يجعل حاجزًا صحيحًا في القاعدة عديم
--    الأثر في الممارسة.
--
-- ولا شيء هنا يربط الحاجز بمسار الترحيل الفعلي، ولا يُدخل أي قاعدة ضريبية.

create or replace function public.set_due_type_revenue_nature(
  p_due_type_id uuid,
  p_revenue_nature text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
  v_before record;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بربط أنواع المستحقات'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.revenue_natures where code = p_revenue_nature) then
    raise exception 'REVENUE_NATURE_UNKNOWN: طبيعة إيراد غير معروفة (%)', p_revenue_nature
      using errcode = '22023';
  end if;

  select revenue_nature, status into v_before
  from public.due_type_revenue_natures
  where organization_id = v_org and due_type_id = p_due_type_id;

  insert into public.due_type_revenue_natures (
    organization_id, due_type_id, revenue_nature, status, notes, created_by
  ) values (
    v_org, p_due_type_id, p_revenue_nature, 'REVIEW_REQUIRED', p_notes, auth.uid()
  )
  on conflict (organization_id, due_type_id) do update
  set revenue_nature = excluded.revenue_nature,
      notes          = excluded.notes,
      status         = 'REVIEW_REQUIRED',
      approved_by    = null,
      approved_at    = null,
      updated_at     = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'tax_mapping.set', 'due_type_revenue_nature', v_id,
    jsonb_build_object(
      'due_type_id',         p_due_type_id,
      'revenue_nature_from', v_before.revenue_nature,
      'revenue_nature_to',   p_revenue_nature,
      'status_from',         v_before.status,
      'status_to',           'REVIEW_REQUIRED',
      'approval_revoked',    coalesce(v_before.status = 'APPROVED', false)
    )
  );

  return v_id;
end;
$$;

create or replace function public.approve_due_type_revenue_nature(p_mapping_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map record;
begin
  select * into v_map from public.due_type_revenue_natures where id = p_mapping_id;
  if v_map.id is null then
    raise exception 'TAX_MAPPING_NOT_FOUND: الربط غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_map.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك باعتماد الربط' using errcode = '42501';
  end if;

  -- الاعتماد المكرر ليس عمليةً بلا أثر: يكتب مُعتمِدًا وتاريخًا جديدين فوق
  -- القديمين، فيمحو مَن اعتمد فعلًا ومتى.
  if v_map.status = 'APPROVED' then
    raise exception 'TAX_MAPPING_ALREADY_APPROVED: الربط معتمد بالفعل' using errcode = 'P0001';
  end if;

  update public.due_type_revenue_natures
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_mapping_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_map.organization_id, 'tax_mapping.approved', 'due_type_revenue_nature', p_mapping_id,
    jsonb_build_object(
      'due_type_id',    v_map.due_type_id,
      'revenue_nature', v_map.revenue_nature,
      'status_from',    v_map.status,
      'status_to',      'APPROVED'
    )
  );
end;
$$;

create or replace function public.revoke_due_type_revenue_nature_approval(
  p_mapping_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map record;
begin
  select * into v_map from public.due_type_revenue_natures where id = p_mapping_id;
  if v_map.id is null then
    raise exception 'TAX_MAPPING_NOT_FOUND: الربط غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_map.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بسحب الاعتماد' using errcode = '42501';
  end if;

  if v_map.status <> 'APPROVED' then
    raise exception 'TAX_MAPPING_NOT_APPROVED: الربط ليس معتمدًا' using errcode = 'P0001';
  end if;

  update public.due_type_revenue_natures
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where id = p_mapping_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_map.organization_id, 'tax_mapping.approval_revoked',
    'due_type_revenue_nature', p_mapping_id, p_reason,
    jsonb_build_object(
      'due_type_id',    v_map.due_type_id,
      'revenue_nature', v_map.revenue_nature,
      'status_from',    'APPROVED',
      'status_to',      'REVIEW_REQUIRED'
    )
  );
end;
$$;

create or replace function public.list_due_type_tax_mappings(p_organization_id uuid)
returns table (
  due_type_id     uuid,
  due_type_name_ar text,
  due_type_name_en text,
  mapping_id      uuid,
  revenue_nature  text,
  nature_name_ar  text,
  nature_name_en  text,
  status          text,
  notes           text,
  approved_at     timestamptz,
  updated_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بالاطلاع على ربط أنواع المستحقات'
      using errcode = '42501';
  end if;

  return query
  select
    dt.id,
    dt.name_ar,
    dt.name_en,
    m.id,
    m.revenue_nature,
    rn.name_ar,
    rn.name_en,
    coalesce(m.status, 'REVIEW_REQUIRED'),
    m.notes,
    m.approved_at,
    m.updated_at
  from public.due_types dt
  left join public.due_type_revenue_natures m
    on m.due_type_id = dt.id and m.organization_id = dt.organization_id
  left join public.revenue_natures rn on rn.code = m.revenue_nature
  where dt.organization_id = p_organization_id
    and dt.is_active
  -- غير المحسوم أولًا: هذه شاشة عمل متبقٍّ لا تقرير حالة.
  order by (coalesce(m.status, 'REVIEW_REQUIRED') = 'APPROVED'), dt.name_ar;
end;
$$;

create or replace function public.list_revenue_natures()
returns setof public.revenue_natures
language sql
stable
as $$
  select * from public.revenue_natures order by sort_order;
$$;
