\set ON_ERROR_STOP 0
\echo ==== TWO-PROJECT MULTILINE UPDATE: both orders must depend on final net, not row order
begin;
insert into public.projects(id,organization_id,code,name_ar,name_en,wip_account_id,cost_of_sales_account_id,budget_amount)
values ('a66f809d-c198-4f5e-a570-060f33a500a1','11111111-1111-4111-8111-111111111111','R6-MULTI-A','تحديث متعدد أ','Multi update A','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000),
       ('a66f809d-c198-4f5e-a570-060f33a500b2','11111111-1111-4111-8111-111111111111','R6-MULTI-B','تحديث متعدد ب','Multi update B','aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000004',1000000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
select public.capitalise_project_cost('a66f809d-c198-4f5e-a570-060f33a500a1',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R6 multi A cap') as cap_a \gset
select public.release_project_wip('a66f809d-c198-4f5e-a570-060f33a500a1',600,'2026-03-10','R6 multi A release') as rel_a \gset
select public.capitalise_project_cost('a66f809d-c198-4f5e-a570-060f33a500b2',1000,'aaaaaaa1-0000-4000-8000-000000000003','2026-03-01','R6 multi B cap') as cap_b \gset
select public.release_project_wip('a66f809d-c198-4f5e-a570-060f33a500b2',600,'2026-03-10','R6 multi B release') as rel_b \gset
reset role;
commit;

\echo ==== ORDER 1: move A debit to B first (A is temporarily -600), then B debit to A
begin;
update public.journal_entry_lines set project_id='a66f809d-c198-4f5e-a570-060f33a500b2'
where journal_entry_id=:'cap_a' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
update public.journal_entry_lines set project_id='a66f809d-c198-4f5e-a570-060f33a500a1'
where journal_entry_id=:'cap_b' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
select public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500a1') as net_a_order1,
       public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500b2') as net_b_order1;
do $$
declare
  v_a numeric := public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500a1');
  v_b numeric := public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500b2');
begin
  if v_a<>400 or v_b<>400 then
    raise exception 'ASSERT_MULTILINE_ORDER1_FAILED: expected A=400 B=400, actual A=% B=%',v_a,v_b;
  end if;
  raise notice 'ASSERT_MULTILINE_ORDER1_PASS: final A=400 B=400 despite temporary A=-600';
end $$;
rollback;

\echo ==== ORDER 2: move B debit to A first (B is temporarily -600), then A debit to B
begin;
update public.journal_entry_lines set project_id='a66f809d-c198-4f5e-a570-060f33a500a1'
where journal_entry_id=:'cap_b' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
update public.journal_entry_lines set project_id='a66f809d-c198-4f5e-a570-060f33a500b2'
where journal_entry_id=:'cap_a' and account_id='aaaaaaa1-0000-4000-8000-000000000001';
select public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500a1') as net_a_order2,
       public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500b2') as net_b_order2;
do $$
declare
  v_a numeric := public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500a1');
  v_b numeric := public.project_wip_net('a66f809d-c198-4f5e-a570-060f33a500b2');
begin
  if v_a<>400 or v_b<>400 then
    raise exception 'ASSERT_MULTILINE_ORDER2_FAILED: expected A=400 B=400, actual A=% B=%',v_a,v_b;
  end if;
  raise notice 'ASSERT_MULTILINE_ORDER2_PASS: final A=400 B=400 despite temporary B=-600';
end $$;
rollback;

begin;
delete from public.journal_entries where id in (:'cap_a', :'rel_a', :'cap_b', :'rel_b');
delete from public.projects where id in ('a66f809d-c198-4f5e-a570-060f33a500a1','a66f809d-c198-4f5e-a570-060f33a500b2');
commit;
