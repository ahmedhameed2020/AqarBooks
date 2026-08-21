-- الفجوة التاريخية لا تُقبل ضمنًا.
--
-- القاعدة المعتمدة: «لا يجوز تشغيل enforcement لمؤسسة لديها فجوة تاريخية غير
-- مفهومة دون تقرير واضح عن أثرها». وهي ليست وثيقةً تُكتب فحسب — لأن وثيقة لا
-- يقرؤها أحد لا تمنع تفعيلًا. فأُنفِذت كشرط:
--
--   ١. `get_tax_decision_coverage` تقيس الأثر: كم مستحقًا قائمًا بلا قرار،
--      ومداه الزمني، **ومبلغه** — والمبلغ هو ما يحوّل «١٢٠ مستحقًا» من رقم إلى
--      أثر يمكن الحكم عليه.
--   ٢. `set_tax_enforcement` عند التفعيل تحسب العدد الفعلي، وترفض إن لم يذكره
--      المستدعي **مطابقًا**. عدد خاطئ يُرفض كغيابه، فلا يمرّ الإقرار بالتخمين
--      ولا بنسخ رقم قديم.
--   ٣. الفجوة المقبولة تُختم في سجل التدقيق لحظة قبولها: مَن قبلها، ومتى، وكم
--      كانت، وما مداها. فالقبول يصبح واقعة موثَّقة لا سكوتًا.
--
-- والشرط يسري فقط حين تكون الفجوة > صفر: مؤسسة بلا مستحقات سابقة لا شيء لديها
-- يُقَر، وإلزامها بإقرار صفر طقس لا حماية.
--
-- ما لم يُبنَ عمدًا: تصنيف المستحقات السابقة. أتُصنَّف بقواعد اليوم أم بقواعد
-- تواريخها؟ قرار محاسبي غير محسوم، وأي افتراض هنا يكتب تاريخًا ضريبيًا لم يقرّه
-- أحد. الشرط أعلاه يجعل تأجيله **مرئيًا** لا صامتًا، وهذا كل ما يجوز للكود فعله.

create or replace function public.get_tax_decision_coverage(p_organization_id uuid)
returns table (
  total_dues bigint,
  dues_with_decision bigint,
  dues_without_decision bigint,
  earliest_undecided_issue_date date,
  latest_undecided_issue_date date,
  undecided_amount numeric,
  enforcement_enabled boolean,
  enforcement_enabled_at timestamptz
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
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بالاطلاع على تغطية القرارات الضريبية'
      using errcode = '42501';
  end if;

  return query
  with scoped as (
    -- «له قرار» تعني قرارًا **نشطًا**: قرار أُبطل بقيد عكسي لا يُحتسب تغطية.
    select d.id, d.issue_date, d.amount,
           exists (
             select 1 from public.tax_decisions td
             where td.source_type = 'DUE' and td.source_id = d.id
               and td.reverses_decision_id is null
               and not exists (
                 select 1 from public.tax_decisions r where r.reverses_decision_id = td.id
               )
           ) as has_decision
    from public.dues d
    where d.organization_id = p_organization_id
      and d.status <> 'VOID'
  )
  select
    count(*)::bigint,
    count(*) filter (where has_decision)::bigint,
    count(*) filter (where not has_decision)::bigint,
    min(issue_date) filter (where not has_decision),
    max(issue_date) filter (where not has_decision),
    coalesce(sum(amount) filter (where not has_decision), 0),
    o.tax_enforcement_enabled,
    o.tax_enforcement_enabled_at
  from scoped, public.organizations o
  where o.id = p_organization_id
  group by o.tax_enforcement_enabled, o.tax_enforcement_enabled_at;
end;
$$;

-- التوقيع القديم يُحذف صراحةً: `create or replace` مع مُعامل جديد يُنشئ دالة
-- ثانية بتوقيع مختلف، فتبقى القديمة قابلة للاستدعاء وتتجاوز الشرط كله.
drop function if exists public.set_tax_enforcement(uuid, boolean, text);

create or replace function public.set_tax_enforcement(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason text default null,
  p_acknowledged_undecided_dues integer default null
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
  v_undecided integer;
  v_earliest date;
  v_latest date;
  v_amount numeric;
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

    select c.dues_without_decision, c.earliest_undecided_issue_date,
           c.latest_undecided_issue_date, c.undecided_amount
    into v_undecided, v_earliest, v_latest, v_amount
    from public.get_tax_decision_coverage(p_organization_id) c;

    v_undecided := coalesce(v_undecided, 0);

    if v_undecided > 0
       and coalesce(p_acknowledged_undecided_dues, -1) <> v_undecided then
      raise exception
        'TAX_HISTORICAL_GAP_UNACKNOWLEDGED: % مستحقًا قائمًا بلا قرار ضريبي (% إلى %، بمبلغ %). التفعيل يعمل إلى الأمام فقط ولن يصنّفها؛ أكّد العدد صراحةً بعد تقرير أثره',
        v_undecided, v_earliest, v_latest, v_amount
        using errcode = 'P0001';
    end if;
  end if;

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
    jsonb_build_object(
      'from', v_was, 'to', p_enabled,
      'historical_undecided_dues', case when p_enabled then coalesce(v_undecided, 0) else null end,
      'historical_undecided_amount', case when p_enabled then v_amount else null end,
      'historical_undecided_from', case when p_enabled then v_earliest else null end,
      'historical_undecided_to', case when p_enabled then v_latest else null end
    )
  );
end;
$$;
