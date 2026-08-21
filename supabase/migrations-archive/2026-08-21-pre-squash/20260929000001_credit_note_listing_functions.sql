-- دوال عرض إشعارات الخصم.
--
-- `issue_credit_note` كانت موجودة بلا أي وسيلة عرض: لا قائمة بما يقبل الخصم،
-- ولا بالمتبقي منه، ولا بما صدر. الشاشة تحتاج الثلاثة.
--
-- المتبقي يُحسب هنا بـ `creditable_remaining` نفسها التي يُقيّد بها الإصدار، لا
-- بنسخة ثانية من المنطق — نسخة ثانية هي التي تنحرف، فيَعِد العرض بما ترفضه
-- القاعدة.

create or replace function public.list_creditable_dues(p_organization_id uuid)
returns table (
  due_id uuid, description text, issue_date date,
  revenue_nature text, tax_treatment text,
  original_gross numeric, credited numeric, remaining numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dues.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.entries.reverse')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المستحقات'
      using errcode = '42501';
  end if;

  return query
  select d.id,
         coalesce(d.description, td.revenue_nature),
         d.issue_date,
         td.revenue_nature,
         td.tax_decision_snapshot->>'tax_treatment',
         td.gross_amount,
         coalesce((select sum(cn.gross_amount) from public.credit_notes cn
                   where cn.source_type = 'DUE' and cn.source_id = d.id
                     and cn.document_type = 'CREDIT_NOTE'), 0),
         public.creditable_remaining(d.id)
  from public.dues d
  -- الانضمام على القرار الضريبي لا على المستحق وحده: لا إشعار بلا قرار مختوم،
  -- والقرار المعكوس (أو الذي عُكس) لا يصلح أصلًا للخصم.
  join public.tax_decisions td
    on td.source_type = 'DUE' and td.source_id = d.id
   and td.reverses_decision_id is null
   and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  where d.organization_id = p_organization_id
    and d.status <> 'VOID'
  -- المستنفَد أخيرًا: الشاشة للعمل المتبقي.
  order by (public.creditable_remaining(d.id) <= 0), d.issue_date desc;
end;
$$;

create or replace function public.list_credit_notes(p_organization_id uuid)
returns table (
  id uuid, document_number text, credit_date date, source_id uuid,
  gross_amount numeric, taxable_base numeric, vat_amount numeric,
  reason text, has_journal_entry boolean, issued_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dues.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.entries.reverse')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الإشعارات'
      using errcode = '42501';
  end if;

  return query
  -- `has_journal_entry` لا `journal_entry_id`: الشاشة تحتاج أن تقول «مُرحَّل»
  -- أو «بلا قيد»، ولا تحتاج معرّف القيد نفسه.
  select cn.id, cn.document_number, cn.credit_date, cn.source_id,
         cn.gross_amount, cn.taxable_base, cn.vat_amount, cn.reason,
         cn.journal_entry_id is not null, cn.issued_at
  from public.credit_notes cn
  where cn.organization_id = p_organization_id
  order by cn.issued_at desc;
end;
$$;

grant execute on function public.list_creditable_dues(uuid) to authenticated;
grant execute on function public.list_credit_notes(uuid) to authenticated;
