\pset format unaligned
\pset tuples_only on
select pg_get_functiondef('public.capture_project_floor_baseline(uuid)'::regprocedure);
select pg_get_functiondef('public.check_project_wip_floor(uuid)'::regprocedure);
select pg_get_functiondef('public.project_wip_net(uuid)'::regprocedure);
