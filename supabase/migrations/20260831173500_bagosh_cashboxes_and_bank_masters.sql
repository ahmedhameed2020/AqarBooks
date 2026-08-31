-- Bagosh current-operations master data.
-- Safe/reversible metadata only: no cashier session, opening count, payment, due,
-- bank account number, statement, or journal entry is fabricated.

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), target_property as (
  select p.id,p.organization_id
  from public.properties p
  join target_org o on o.id=p.organization_id
  where p.code='BAGOSH'
  limit 1
), cash_targets(account_code,cashbox_name) as (
  values
    ('1541000'::text,'خزينة المقر'::text),
    ('1551000'::text,'خزينة القرية'::text)
)
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active)
select o.id,p.id,t.cashbox_name,a.id,true
from target_org o
join target_property p on p.organization_id=o.id
join cash_targets t on true
join public.chart_of_accounts a
  on a.organization_id=o.id
 and a.code=t.account_code
 and a.category='ASSET'
 and not a.is_group
where not exists (
  select 1 from public.cashboxes c
  where c.organization_id=o.id
    and c.property_id=p.id
    and (c.gl_account_id=a.id or c.name=t.cashbox_name)
);

with target_org as (
  select id from public.organizations where slug='marsa-bagoush-north-coast'
), bank_targets(name_ar,name_en) as (
  values
    ('بنك مصر'::text,'Banque Misr'::text),
    ('بنك قناة السويس'::text,'Suez Canal Bank'::text)
)
insert into public.banks(organization_id,name_ar,name_en)
select o.id,b.name_ar,b.name_en
from target_org o
cross join bank_targets b
where not exists (
  select 1 from public.banks x
  where x.organization_id=o.id
    and (trim(x.name_ar)=trim(b.name_ar) or lower(trim(x.name_en))=lower(trim(b.name_en)))
);
