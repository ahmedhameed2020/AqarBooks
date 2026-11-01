CREATE OR REPLACE FUNCTION public.create_journal_entry(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء قيود محاسبية في هذا الموقع' using errcode = '42501';
  end if;

  -- OPTION A (proposal): manual entries cannot tag a line with a project. Project postings use capitalise/release.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l
    where nullif(l ->> 'project_id', '') is not null
  ) then
    raise exception 'MANUAL_PROJECT_TAG_NOT_ALLOWED: القيود اليدوية لا تُربط بمشروع؛ الرسملة والتحرير عبر إجراءات المشروع' using errcode = '22023';
  end if;

  return public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date,
    p_description, p_source_type, p_lines, p_idempotency_key
  );
end;
$function$

