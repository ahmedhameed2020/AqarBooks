\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select open_fiscal_year('11111111-1111-4111-8111-111111111111', id, 'concurrency fixture') from fiscal_years where organization_id='11111111-1111-4111-8111-111111111111';
reset role;
insert into projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values
 ('bbbbbbb1-0000-4000-8000-0000000000c1','11111111-1111-4111-8111-111111111111','CONC-C','C','C','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
 ('bbbbbbb1-0000-4000-8000-0000000000d1','11111111-1111-4111-8111-111111111111','CONC-D','D','D','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000)
on conflict (id) do nothing;
