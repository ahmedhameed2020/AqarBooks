-- دوال عرض كتالوج الأصناف.
--
-- طُبِّقت على القاعدة مع شاشة الكتالوج (ad0e301) ولم تُكتب في المستودع، فبقيت
-- القاعدة متقدمة على الملفات. هذا الملف يُطابق التعريف المنشور حرفيًا، ولا
-- يُغيّر سلوكًا قائمًا.
--
-- كلتاهما SECURITY DEFINER لأنها تقرأ عبر جداول يحكمها RLS، ولذلك تُعيد فحص
-- الصلاحية بنفسها بدل الاتكاء على إخفاء الشاشة.

create or replace function public.list_catalogue_items(p_organization_id uuid)
returns table (
  id uuid, code text, name_ar text, name_en text, unit_code text,
  item_code_type text, item_code text, is_active boolean, linked_due_types bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على كتالوج الأصناف'
      using errcode = '42501';
  end if;

  return query
  select ci.id, ci.code, ci.name_ar, ci.name_en, ci.unit_code,
         ci.item_code_type, ci.item_code, ci.is_active,
         (select count(*) from public.due_types dt where dt.catalogue_item_id = ci.id)
  from public.catalogue_items ci
  where ci.organization_id = p_organization_id
  -- الناقص كودًا أولًا: هذه شاشة عمل متبقٍّ لا تقرير حالة.
  order by (nullif(btrim(coalesce(ci.item_code, '')), '') is not null), ci.name_ar;
end;
$$;

create or replace function public.list_due_type_catalogue_links(p_organization_id uuid)
returns table (
  due_type_id uuid, due_type_name_ar text, due_type_name_en text,
  catalogue_item_id uuid, item_name_ar text, item_code text,
  item_code_type text, unit_code text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على ربط الأصناف'
      using errcode = '42501';
  end if;

  return query
  select dt.id, dt.name_ar, dt.name_en,
         ci.id, ci.name_ar, ci.item_code, ci.item_code_type, ci.unit_code
  from public.due_types dt
  left join public.catalogue_items ci on ci.id = dt.catalogue_item_id
  where dt.organization_id = p_organization_id and dt.is_active
  -- غير المربوط، والمربوط بلا كود، يتصدّران: كلاهما يمنع الإصدار.
  order by (dt.catalogue_item_id is not null
            and nullif(btrim(coalesce(ci.item_code, '')), '') is not null),
           dt.name_ar;
end;
$$;

grant execute on function public.list_catalogue_items(uuid) to authenticated;
grant execute on function public.list_due_type_catalogue_links(uuid) to authenticated;
