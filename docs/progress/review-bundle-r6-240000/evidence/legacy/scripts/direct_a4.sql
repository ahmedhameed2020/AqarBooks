\set ON_ERROR_STOP 0
\echo === 1. manager (owner) direct UPDATE of a locked field after postings
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
update projects set wip_account_id='aaaaaaa1-0000-4000-8000-000000000001' where id='bbbbbbb1-0000-4000-8000-0000000000a4';
\echo === 2. manager (owner) direct UPDATE of a permitted field (name) after postings
update projects set name_en='F renamed directly' where id='bbbbbbb1-0000-4000-8000-0000000000a4';
\echo === 3. manager (owner) direct DELETE of the project
delete from projects where id='bbbbbbb1-0000-4000-8000-0000000000a4';
reset role;
\echo === 4. member without finance.accounts.manage (cashier): direct UPDATE of the name
set role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', false);
update projects set name_en='cashier attempt' where id='bbbbbbb1-0000-4000-8000-0000000000a4';
reset role;
\echo === state after attempts
select 'wip='||wip_account_id||' name='||name_en from projects where id='bbbbbbb1-0000-4000-8000-0000000000a4';
select 'audit rows (PROJECT_UPDATED for F): '||count(*) from financial_audit_logs where action='PROJECT_UPDATED' and entity_id='bbbbbbb1-0000-4000-8000-0000000000a4';
