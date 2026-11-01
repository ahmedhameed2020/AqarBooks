begin; set local session_replication_role = replica; set local statement_timeout='60s';
insert into public.organizations(id,name,slug,default_currency,status) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','Q6E a','q6e-a-e0f4ca','EGP','ACTIVE');
insert into public.organizations(id,name,slug,default_currency,status) values ('c62dd833-f6e0-4b96-a12b-3d1684628e57','Q6E b','q6e-b-c62dd8','EGP','ACTIVE');
insert into public.organizations(id,name,slug,default_currency,status) values ('5792b573-9927-4e69-ad2b-f9964ae49bc4','Q6E c','q6e-c-5792b5','EGP','ACTIVE');
insert into public.properties(id,organization_id,name,code,timezone,property_type) values ('229e73e9-2924-4b6a-a4ce-b8a326aacbef','e0f4ca88-7a0b-4ad7-9180-88195030b465','P','P-e0f4ca','Africa/Cairo','resort');
insert into public.banks(id,organization_id,name_ar,name_en) values ('612ac99b-055c-4c73-b498-abaf21cc4300','e0f4ca88-7a0b-4ad7-9180-88195030b465','b','b');
insert into public.properties(id,organization_id,name,code,timezone,property_type) values ('4d02054e-cdbe-42b8-bad8-305c26620a29','c62dd833-f6e0-4b96-a12b-3d1684628e57','P','P-c62dd8','Africa/Cairo','resort');
insert into public.banks(id,organization_id,name_ar,name_en) values ('535801c2-565a-424e-9370-021d6357c5a4','c62dd833-f6e0-4b96-a12b-3d1684628e57','b','b');
insert into public.properties(id,organization_id,name,code,timezone,property_type) values ('399d9f93-2b45-46c3-b37c-85b849f0eba5','5792b573-9927-4e69-ad2b-f9964ae49bc4','P','P-5792b5','Africa/Cairo','resort');
insert into public.banks(id,organization_id,name_ar,name_en) values ('d72222b1-8caa-42fd-a166-da09c4e6b1c5','5792b573-9927-4e69-ad2b-f9964ae49bc4','b','b');
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('41d0d783-01e2-48ce-8e0c-1db18cb82938','e0f4ca88-7a0b-4ad7-9180-88195030b465','1110','x','A_ok','ASSET','DEBIT',false,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('f3c5ae55-3a1a-44c8-85bb-8d5d2fdcd53c','e0f4ca88-7a0b-4ad7-9180-88195030b465','1120','x','A_ok2','ASSET','DEBIT',false,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('5ca2fae4-402e-4888-80cc-b78ee349de9e','e0f4ca88-7a0b-4ad7-9180-88195030b465','1130','x','A_noncash','ASSET','DEBIT',false,true,false);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('441a4836-7777-4ba3-b628-a9759bdab384','e0f4ca88-7a0b-4ad7-9180-88195030b465','2250','x','A_liab','LIABILITY','CREDIT',false,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('73e146de-e710-468d-a24d-427ba6a3f1a5','e0f4ca88-7a0b-4ad7-9180-88195030b465','1100','x','A_group','ASSET','DEBIT',true,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('7a1d6e99-717a-458a-99d0-5788b923828a','e0f4ca88-7a0b-4ad7-9180-88195030b465','1220','x','A_inact','ASSET','DEBIT',false,false,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('b131b120-e974-49e8-8707-eaca28a774aa','e0f4ca88-7a0b-4ad7-9180-88195030b465','1115','x','A_allinact','ASSET','DEBIT',false,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('bd4ed1ed-8c35-4fb7-8b78-d3f3ccb8c07b','e0f4ca88-7a0b-4ad7-9180-88195030b465','2299','x','A_multi','LIABILITY','CREDIT',true,false,false);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('ea868184-0025-477e-bb06-18733f0cae50','c62dd833-f6e0-4b96-a12b-3d1684628e57','1110','x','B_ok','ASSET','DEBIT',false,true,true);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('c32e94b1-12ee-4a67-abfe-3895edeeded9','5792b573-9927-4e69-ad2b-f9964ae49bc4','1130','x','C_noncash','ASSET','DEBIT',false,true,false);
insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active,is_cash_equivalent) values ('75acd69b-2d5f-45ec-825e-732b15006ff6','5792b573-9927-4e69-ad2b-f9964ae49bc4','1110','x','C_ok','ASSET','DEBIT',false,true,true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L1-valid-control','41d0d783-01e2-48ce-8e0c-1db18cb82938',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L2-not-cash','5ca2fae4-402e-4888-80cc-b78ee349de9e',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L3-liability','441a4836-7777-4ba3-b628-a9759bdab384',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L4-group','73e146de-e710-468d-a24d-427ba6a3f1a5',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L5-account-inactive','7a1d6e99-717a-458a-99d0-5788b923828a',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L6-foreign-org','ea868184-0025-477e-bb06-18733f0cae50',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L7-link-inactive','b131b120-e974-49e8-8707-eaca28a774aa',false);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L8-missing-account','229cee91-09c9-4ddf-93c9-4ccf4dc25724',true);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','L9-all-reasons','bd4ed1ed-8c35-4fb7-8b78-d3f3ccb8c07b',false);
insert into public.bank_accounts(organization_id,property_id,bank_id,account_name,account_number,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','612ac99b-055c-4c73-b498-abaf21cc4300','K1-valid-control','N-K1-valid-control','f3c5ae55-3a1a-44c8-85bb-8d5d2fdcd53c',true);
insert into public.bank_accounts(organization_id,property_id,bank_id,account_name,account_number,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','612ac99b-055c-4c73-b498-abaf21cc4300','K2-not-cash','N-K2-not-cash','5ca2fae4-402e-4888-80cc-b78ee349de9e',true);
insert into public.bank_accounts(organization_id,property_id,bank_id,account_name,account_number,gl_account_id,is_active) values ('e0f4ca88-7a0b-4ad7-9180-88195030b465','229e73e9-2924-4b6a-a4ce-b8a326aacbef','612ac99b-055c-4c73-b498-abaf21cc4300','K3-inactive-on-valid','N-K3-inactive-on-valid','41d0d783-01e2-48ce-8e0c-1db18cb82938',false);
insert into public.cashboxes(organization_id,property_id,name,gl_account_id,is_active) values ('5792b573-9927-4e69-ad2b-f9964ae49bc4','399d9f93-2b45-46c3-b37c-85b849f0eba5','M1-org-c-not-cash','c32e94b1-12ee-4a67-abfe-3895edeeded9',true);
insert into public.bank_accounts(organization_id,property_id,bank_id,account_name,account_number,gl_account_id,is_active) values ('5792b573-9927-4e69-ad2b-f9964ae49bc4','399d9f93-2b45-46c3-b37c-85b849f0eba5','d72222b1-8caa-42fd-a166-da09c4e6b1c5','M2-org-c-inactive','N-M2-org-c-inactive','75acd69b-2d5f-45ec-825e-732b15006ff6',false);
\echo '-- 6e. EVERY cash box / bank account link judged by the SAME conditions the deposit rule uses (migration 20261018100000: treasury_gl_account_is_valid + the link must be active)'
\echo '--     reasons: LINK_INACTIVE | ACCOUNT_MISSING | ACCOUNT_OF_ANOTHER_ORGANIZATION | ACCOUNT_NOT_ASSET | ACCOUNT_IS_GROUP | ACCOUNT_INACTIVE | ACCOUNT_NOT_CASH_EQUIVALENT'
\echo '-- 6e-1. one row per link that fails at least one condition (a link can fail several; all reasons are listed)'
with links as (
  select 'cashbox'::text as kind, c.id as link_id, c.name as link_name, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select 'bank'::text, b.id, b.account_name, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), judged as (
  select l.*, a.code, a.category, a.is_group, a.is_active as account_active, a.is_cash_equivalent,
         array_remove(array[
           case when not l.link_active then 'LINK_INACTIVE' end,
           case when a.id is null then 'ACCOUNT_MISSING' end,
           case when a.id is not null and a.organization_id <> l.organization_id then 'ACCOUNT_OF_ANOTHER_ORGANIZATION' end,
           case when a.id is not null and a.category <> 'ASSET' then 'ACCOUNT_NOT_ASSET' end,
           case when a.id is not null and a.is_group then 'ACCOUNT_IS_GROUP' end,
           case when a.id is not null and not a.is_active then 'ACCOUNT_INACTIVE' end,
           case when a.id is not null and not a.is_cash_equivalent then 'ACCOUNT_NOT_CASH_EQUIVALENT' end
         ], null) as reasons
  from links l left join public.chart_of_accounts a on a.id = l.gl_account_id
)
select kind, organization_id, link_id, link_name, gl_account_id, code, category, is_group, account_active, is_cash_equivalent, link_active,
       array_to_string(reasons, ',') as reasons
from judged where cardinality(reasons) > 0
order by organization_id, kind, code nulls first, link_name limit 500;
\echo '-- 6e-2. the same, counted per reason (links and organizations affected)'
with links as (
  select 'cashbox'::text as kind, c.id as link_id, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select 'bank'::text, b.id, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), judged as (
  select l.*,
         array_remove(array[
           case when not l.link_active then 'LINK_INACTIVE' end,
           case when a.id is null then 'ACCOUNT_MISSING' end,
           case when a.id is not null and a.organization_id <> l.organization_id then 'ACCOUNT_OF_ANOTHER_ORGANIZATION' end,
           case when a.id is not null and a.category <> 'ASSET' then 'ACCOUNT_NOT_ASSET' end,
           case when a.id is not null and a.is_group then 'ACCOUNT_IS_GROUP' end,
           case when a.id is not null and not a.is_active then 'ACCOUNT_INACTIVE' end,
           case when a.id is not null and not a.is_cash_equivalent then 'ACCOUNT_NOT_CASH_EQUIVALENT' end
         ], null) as reasons
  from links l left join public.chart_of_accounts a on a.id = l.gl_account_id
)
select reason, kind, count(*) as links, count(distinct organization_id) as organizations
from judged, unnest(reasons) as reason
group by reason, kind order by reason, kind;
\echo '-- 6e-3. organizations that HAVE links but not one valid deposit account (every link is inactive or points at an invalid / missing / foreign account): their receipts would all be refused'
with links as (
  select c.id as link_id, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select b.id, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), valid_accounts as (
  select distinct l.organization_id, l.gl_account_id
  from links l join public.chart_of_accounts a on a.id = l.gl_account_id and a.organization_id = l.organization_id
  where l.link_active and a.is_active and not a.is_group and a.category = 'ASSET' and a.is_cash_equivalent
)
select l.organization_id, count(distinct l.link_id) as links, count(*) filter (where l.link_active) as active_links
from links l
where not exists (select 1 from valid_accounts v where v.organization_id = l.organization_id)
group by l.organization_id order by l.organization_id limit 500;


\echo '-- PARITY: link has no reasons <=> link active AND treasury_gl_account_is_valid(link org, account)'
with links as (select c.organization_id, c.gl_account_id, c.is_active from public.cashboxes c union all select b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b)
select count(*) as links_total, count(*) filter (where is_active and public.treasury_gl_account_is_valid(organization_id, gl_account_id)) as function_says_valid from links;
rollback;
