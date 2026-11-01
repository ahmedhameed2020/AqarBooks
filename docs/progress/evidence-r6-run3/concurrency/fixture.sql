\set ON_ERROR_STOP 1
insert into organizations(id,name,slug,default_currency,status) values ('11111111-1111-4111-8111-111111111111','CONC Org','conc-org-r6','EGP','ACTIVE') on conflict (id) do nothing;
select clone_tenant_role_templates('11111111-1111-4111-8111-111111111111');
insert into auth.users(id,email,aud,role,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values ('22222222-2222-4222-8222-222222222222','conc-owner@aqarbooks-test.local','authenticated','authenticated','','','','','',now(),now(),'{}','{}') on conflict (id) do nothing;
insert into organization_memberships(organization_id,user_id,status) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','active') on conflict do nothing;
insert into user_role_assignments(organization_id,user_id,role_id) select '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222', id from roles where organization_id='11111111-1111-4111-8111-111111111111' and key='TENANT_OWNER' on conflict do nothing;
insert into chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active) values
 ('aaaaaaa1-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','1300','WIP','WIP','ASSET','DEBIT',false,true),
 ('aaaaaaa1-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','1310','WIP2','WIP2','ASSET','DEBIT',false,true),
 ('aaaaaaa1-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','2100','AP','AP','LIABILITY','CREDIT',false,true),
 ('aaaaaaa1-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','5600','COS','COS','EXPENSE','DEBIT',false,true)
on conflict do nothing;
insert into projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount) values ('bbbbbbb1-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','CONC-1','P','P','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000) on conflict (id) do update set wip_account_id=excluded.wip_account_id, cost_of_sales_account_id=excluded.cost_of_sales_account_id;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select create_fiscal_year('11111111-1111-4111-8111-111111111111','2026','2026-01-01','2026-12-31');
