\set ON_ERROR_STOP 0
\echo === 1. owner: direct UPDATE of WIP on a project WITH postings
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
update projects set wip_account_id='aaaaaaa1-0000-4000-8000-000000000001' where id='bbbbbbb1-0000-4000-8000-0000000000a3';
\echo === 2. owner: direct UPDATE of the name (permitted) on the same project
update projects set name_en='A3 renamed directly' where id='bbbbbbb1-0000-4000-8000-0000000000a3';
\echo === 3. owner: direct DELETE
delete from projects where id='bbbbbbb1-0000-4000-8000-0000000000a3';
reset role;
\echo === 4. member without the permission: direct UPDATE of the name
set role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', false);
update projects set name_en='cashier attempt' where id='bbbbbbb1-0000-4000-8000-0000000000a3';
reset role;
\echo === state
select 'wip='||wip_account_id||' name='||name_en from projects where id='bbbbbbb1-0000-4000-8000-0000000000a3';
select 'audit PROJECT_UPDATED rows for A3: '||count(*) from financial_audit_logs where action='PROJECT_UPDATED' and entity_id='bbbbbbb1-0000-4000-8000-0000000000a3';
