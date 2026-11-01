\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
begin;
update projects set wip_account_id='aaaaaaa1-0000-4000-8000-000000000002' where id='bbbbbbb1-0000-4000-8000-0000000000a3';
select pg_sleep(4);
commit;
