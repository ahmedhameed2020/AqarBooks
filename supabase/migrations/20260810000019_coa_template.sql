-- Phase 3: optional starter chart-of-accounts template, clonable per org
-- (spec §11: "Provide an optional initial resort accounting template, but
-- allow authorized customization"). Tenants are never forced to use it.

create table public.coa_templates (
  key text primary key,
  name_ar text not null,
  name_en text not null
);

create table public.coa_template_accounts (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.coa_templates (key) on delete cascade,
  sort_order int not null,
  code text not null,
  parent_code text,
  name_ar text not null,
  name_en text not null,
  category text not null check (category in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance text not null check (normal_balance in ('DEBIT', 'CREDIT')),
  is_group boolean not null default false,
  unique (template_key, code)
);

alter table public.coa_templates enable row level security;
alter table public.coa_template_accounts enable row level security;

create policy "coa_templates_select_authenticated"
  on public.coa_templates for select
  using (auth.uid() is not null);

create policy "coa_template_accounts_select_authenticated"
  on public.coa_template_accounts for select
  using (auth.uid() is not null);

create or replace function public.clone_chart_of_accounts_template(
  p_organization_id uuid,
  p_template_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_new_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  create temporary table if not exists _coa_clone_map (code text primary key, id uuid) on commit drop;
  delete from _coa_clone_map;

  for v_row in
    select * from public.coa_template_accounts
    where template_key = p_template_key
    order by sort_order
  loop
    insert into public.chart_of_accounts (
      organization_id, code, name_ar, name_en, parent_id, category, normal_balance, is_group
    ) values (
      p_organization_id,
      v_row.code,
      v_row.name_ar,
      v_row.name_en,
      (select id from _coa_clone_map where code = v_row.parent_code),
      v_row.category,
      v_row.normal_balance,
      v_row.is_group
    )
    returning id into v_new_id;

    insert into _coa_clone_map (code, id) values (v_row.code, v_new_id);
  end loop;
end;
$$;

insert into public.coa_templates (key, name_ar, name_en) values
  ('RESORT_STANDARD', 'دليل الحسابات القياسي للمنتجعات', 'Standard Resort Chart of Accounts');

insert into public.coa_template_accounts (template_key, sort_order, code, parent_code, name_ar, name_en, category, normal_balance, is_group) values
  ('RESORT_STANDARD', 1, '1000', null, 'الأصول', 'Assets', 'ASSET', 'DEBIT', true),
  ('RESORT_STANDARD', 2, '1100', '1000', 'الأصول المتداولة', 'Current Assets', 'ASSET', 'DEBIT', true),
  ('RESORT_STANDARD', 3, '1110', '1100', 'الصندوق', 'Cash on Hand', 'ASSET', 'DEBIT', false),
  ('RESORT_STANDARD', 4, '1120', '1100', 'البنوك', 'Banks', 'ASSET', 'DEBIT', false),
  ('RESORT_STANDARD', 5, '1130', '1100', 'ذمم الأعضاء المدينة', 'Accounts Receivable - Members', 'ASSET', 'DEBIT', false),
  ('RESORT_STANDARD', 6, '1200', '1000', 'الأصول الثابتة', 'Fixed Assets', 'ASSET', 'DEBIT', true),
  ('RESORT_STANDARD', 7, '1210', '1200', 'مبانٍ ومنشآت', 'Buildings & Facilities', 'ASSET', 'DEBIT', false),
  ('RESORT_STANDARD', 8, '1220', '1200', 'مجمع الإهلاك', 'Accumulated Depreciation', 'ASSET', 'DEBIT', false),

  ('RESORT_STANDARD', 9, '2000', null, 'الخصوم', 'Liabilities', 'LIABILITY', 'CREDIT', true),
  ('RESORT_STANDARD', 10, '2100', '2000', 'ذمم الموردين الدائنة', 'Accounts Payable - Suppliers', 'LIABILITY', 'CREDIT', false),
  ('RESORT_STANDARD', 11, '2200', '2000', 'إيرادات مقبوضة مقدمًا', 'Unearned Revenue', 'LIABILITY', 'CREDIT', false),

  ('RESORT_STANDARD', 12, '3000', null, 'حقوق الملكية', 'Equity', 'EQUITY', 'CREDIT', true),
  ('RESORT_STANDARD', 13, '3100', '3000', 'الأرباح المرحّلة', 'Retained Earnings', 'EQUITY', 'CREDIT', false),

  ('RESORT_STANDARD', 14, '4000', null, 'الإيرادات', 'Revenue', 'REVENUE', 'CREDIT', true),
  ('RESORT_STANDARD', 15, '4100', '4000', 'إيرادات اشتراكات الصيانة', 'Maintenance Fee Revenue', 'REVENUE', 'CREDIT', false),
  ('RESORT_STANDARD', 16, '4200', '4000', 'إيرادات رسوم العضوية', 'Membership Fee Revenue', 'REVENUE', 'CREDIT', false),
  ('RESORT_STANDARD', 17, '4300', '4000', 'إيرادات أخرى', 'Other Revenue', 'REVENUE', 'CREDIT', false),

  ('RESORT_STANDARD', 18, '5000', null, 'المصروفات', 'Expenses', 'EXPENSE', 'DEBIT', true),
  ('RESORT_STANDARD', 19, '5100', '5000', 'الرواتب والأجور', 'Salaries & Wages', 'EXPENSE', 'DEBIT', false),
  ('RESORT_STANDARD', 20, '5200', '5000', 'الصيانة والتشغيل', 'Maintenance & Operations', 'EXPENSE', 'DEBIT', false),
  ('RESORT_STANDARD', 21, '5300', '5000', 'المرافق (كهرباء ومياه)', 'Utilities', 'EXPENSE', 'DEBIT', false),
  ('RESORT_STANDARD', 22, '5400', '5000', 'مصروفات إدارية عامة', 'General & Administrative', 'EXPENSE', 'DEBIT', false);
