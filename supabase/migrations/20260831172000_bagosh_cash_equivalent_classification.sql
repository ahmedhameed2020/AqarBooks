-- Bagosh legacy cash-position metadata correction.
-- No journal amount, ownership, due, payment, or bank statement is changed.
-- Scope is intentionally narrow: only unmistakable demand-bank and cash-on-hand accounts.

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), targets(code) as (
  values
    ('1511000'::text), -- جاري بنك قناة السويس
    ('1514000'::text), -- جاري بنك قناة السويس بعائد
    ('1515000'::text), -- جاري بنك قناة السويس دولار أمريكي - 1
    ('1515001'::text), -- جاري بنك مصر
    ('1515002'::text), -- جاري بنك قناة السويس بدون عائد
    ('1541000'::text), -- نقدية بخزينة المقر
    ('1551000'::text)  -- نقدية بخزينة القرية
)
update public.chart_of_accounts a
set is_cash_equivalent = true
from target_org o, targets t
where a.organization_id = o.id
  and a.code = t.code
  and not a.is_group
  and a.category = 'ASSET';

comment on column public.chart_of_accounts.is_cash_equivalent is
'Controls inclusion in cash-position reporting. Legacy migrations must classify only demonstrably liquid cash/demand-bank accounts; deposits, disputed funds, and collection instruments require separate review.';
