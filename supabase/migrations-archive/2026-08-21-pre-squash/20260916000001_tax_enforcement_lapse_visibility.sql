-- مخرج الطوارئ يبقى مفتوحًا، لكنه لا يبقى صامتًا.
--
-- التنبيه التشغيلي على المراجعة كان: الإيقاف يحتاج تحذيرًا وسجلًا ومراقبة.
-- الفحص كشف أن المشكلة أعمق من التحذير — **الإيقاف كان يمحو أثره بنفسه**:
--
--   set tax_enforcement_enabled_at = null
--   set tax_enforcement_enabled_by = null
--
-- فبعد الإيقاف لا يبقى على صف المؤسسة ما يدل على أن الإنفاذ كان مفعَّلًا يومًا.
-- السجل وحده يعرف، وأي مراقبة تقرأ الجدول تعمى عن الفجوة تمامًا. وهذا يجعل
-- «مخرج الطوارئ» بابًا خلفيًا دائمًا لا استثناءً مرصودًا.
--
-- ثلاثة تغييرات، ولا شيء منها يحجب المخرج نفسه:
--
-- ١. أثر التفعيل السابق يبقى، ويُضاف إليه أثر الإيقاف بفاعله ووقته وسببه.
-- ٢. السبب **إلزامي** عند إيقاف إنفاذ كان مفعَّلًا فعلًا. لا تحذير في واجهة —
--    الواجهة يمكن تخطّيها، والشرط في القاعدة لا يُتخطّى.
-- ٣. المراقبة تقيس **الأثر** لا الواقعة: كم مستحقًا رُحِّل في الفجوة بلا قرار
--    ضريبي. صفر يعني مخرجًا استُخدم بلا ضرر؛ وعدد كبير يعني سجلًا مثقوبًا
--    يحتاج استدراكًا. الفرق بينهما هو كل ما يهم، وواقعة الإيقاف وحدها لا تقوله.

alter table public.organizations
  add column if not exists tax_enforcement_disabled_at timestamptz,
  add column if not exists tax_enforcement_disabled_by uuid,
  add column if not exists tax_enforcement_disabled_reason text;

comment on column public.organizations.tax_enforcement_disabled_at is
  'يبقى بعد الإيقاف. بدونه يمحو الإيقاف كل أثر على الصف بأن الإنفاذ كان مفعَّلًا، فتعمى المراقبة عن الفجوة.';

create or replace function public.set_tax_enforcement(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gaps text;
  v_count integer;
  v_was boolean;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage') then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بتفعيل الإنفاذ الضريبي'
      using errcode = '42501';
  end if;

  select tax_enforcement_enabled into v_was
  from public.organizations where id = p_organization_id;
  if v_was is null then
    raise exception 'ORGANIZATION_NOT_FOUND: المؤسسة غير موجودة' using errcode = 'P0002';
  end if;

  if p_enabled then
    select count(*), string_agg(gap_code || ': ' || detail, ' | ')
    into v_count, v_gaps
    from public.check_tax_enforcement_readiness(p_organization_id);

    if v_count > 0 then
      raise exception 'TAX_ENFORCEMENT_NOT_READY: %', v_gaps using errcode = 'P0001';
    end if;
  end if;

  -- الشرط يخص الإيقاف بعد تفعيل فعلي فقط: إيقاف ما هو مطفأ أصلًا لا يفتح فجوة.
  if not p_enabled and v_was and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception
      'TAX_ENFORCEMENT_DISABLE_REASON_REQUIRED: إيقاف الإنفاذ يفتح فجوة في السجل الضريبي؛ اذكر السبب'
      using errcode = '22023';
  end if;

  update public.organizations
  set tax_enforcement_enabled = p_enabled,
      tax_enforcement_enabled_at =
        case when p_enabled then now() else tax_enforcement_enabled_at end,
      tax_enforcement_enabled_by =
        case when p_enabled then auth.uid() else tax_enforcement_enabled_by end,
      tax_enforcement_disabled_at = case when p_enabled then null else now() end,
      tax_enforcement_disabled_by = case when p_enabled then null else auth.uid() end,
      tax_enforcement_disabled_reason = case when p_enabled then null else p_reason end
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), p_organization_id,
    case when p_enabled then 'tax_enforcement.enabled' else 'tax_enforcement.disabled' end,
    'organization', p_organization_id, p_reason,
    jsonb_build_object('from', v_was, 'to', p_enabled)
  );
end;
$$;

create or replace function public.list_tax_enforcement_lapses()
returns table (
  organization_id uuid,
  organization_name text,
  enabled_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid,
  disabled_reason text,
  dues_without_decision bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: مراقبة فجوات الإنفاذ لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    o.tax_enforcement_enabled_at,
    o.tax_enforcement_disabled_at,
    o.tax_enforcement_disabled_by,
    o.tax_enforcement_disabled_reason,
    (
      select count(*)
      from public.dues d
      where d.organization_id = o.id
        and d.status <> 'VOID'
        and d.created_at >= o.tax_enforcement_disabled_at
        and not exists (
          select 1 from public.tax_decisions td
          where td.source_type = 'DUE' and td.source_id = d.id
        )
    )
  from public.organizations o
  where o.tax_enforcement_enabled = false
    and o.tax_enforcement_disabled_at is not null
  order by o.tax_enforcement_disabled_at desc;
end;
$$;
